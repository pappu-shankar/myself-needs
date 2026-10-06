import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";
import { sameVault, type RequestScope } from "./vault-types";

/**
 * Which user (and which of their vaults) the current request acts for. Two
 * carriers, because Next.js gives us two kinds of request:
 *
 * - **Actions and route handlers** run inside `runWithScope` — an
 *   `AsyncLocalStorage.run`, so the scope follows every await in that call tree
 *   and nothing outside it.
 * - **Server Component renders** can't be wrapped that way (a layout can't wrap
 *   its children's render), so `requireUser()` calls `bindRenderScope`, which
 *   fills a React `cache()` box. React scopes that box to the current render
 *   request; outside a render, `cache()` returns a fresh value every call, so a
 *   binding never leaks into an unrelated request.
 *
 * `enterWith` is never used — it would leak the scope into whatever runs next
 * on the same async context. When neither carrier is set, `currentScope()` is
 * `undefined` and `getDb()` fails closed.
 */

const globalForScope = globalThis as unknown as {
  __requestScopeStorage?: AsyncLocalStorage<RequestScope>;
};
// On globalThis so a dev hot-reload (or a second copy of this module in another
// bundle layer) still reads the same storage the running request wrote to.
const storage = (globalForScope.__requestScopeStorage ??= new AsyncLocalStorage<RequestScope>());

interface RenderScopeBox {
  scope: RequestScope | undefined;
}

const getRenderBox = cache((): RenderScopeBox => ({ scope: undefined }));

function freeze(scope: RequestScope): RequestScope {
  return Object.freeze({ ...scope, vault: Object.freeze({ ...scope.vault }) });
}

export function runWithScope<T>(scope: RequestScope, fn: () => T): T {
  return storage.run(freeze(scope), fn);
}

/**
 * Binds `scope` to the current Server Component render. Rebinding the same
 * user + vault is a no-op; binding a different one in the same render throws
 * rather than silently switching databases halfway through a page.
 */
export function bindRenderScope(scope: RequestScope): void {
  const box = getRenderBox();
  if (box.scope) {
    if (box.scope.userId === scope.userId && sameVault(box.scope.vault, scope.vault)) return;
    throw new Error("A different user or vault is already bound to this request.");
  }
  box.scope = freeze(scope);
}

/** The innermost scope: an explicit `runWithScope` wins over the render binding. */
export function currentScope(): RequestScope | undefined {
  return storage.getStore() ?? getRenderBox().scope;
}
