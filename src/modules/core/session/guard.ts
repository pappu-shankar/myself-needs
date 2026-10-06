import "server-only";
import { redirect } from "next/navigation";
import { getAccountStatusCached } from "@/modules/core/auth/accounts-store";
import { touchSession } from "@/modules/core/auth/sessions-store";
import { openVault } from "@/modules/core/db/client";
import { bindRenderScope, runWithScope } from "@/modules/core/db/request-scope";
import type { RequestScope, SpaceRole, VaultRef } from "@/modules/core/db/vault-types";
import { logError } from "@/modules/core/log";
import { ensureSpaceOpen } from "@/modules/core/spaces/spaces-service";
import { getSession } from "./session";
import {
  endSession,
  endUserSessions,
  getCachedKey,
  getLiveSession,
  setSessionVault,
  touchLiveSession,
} from "./session-registry";

/**
 * Resolves the signed-in user for this request, or null. Checks, in order: the
 * cookie names a live in-memory session for the same user; the account still
 * exists and is active (5 s cache — a disabled account's sessions are ended
 * here); the personal vault is open (reopened from the key cache after an LRU
 * eviction); and, when the session is looking at a space, that the user is
 * still a member who can open it (otherwise it falls back to their own vault).
 */
async function resolveScope(): Promise<RequestScope | null> {
  const session = await getSession();
  const { uid, sid } = session;
  if (!uid || !sid) return null;

  const live = getLiveSession(sid);
  if (!live || live.userId !== uid) return null;

  const status = getAccountStatusCached(uid);
  if (!status || status.status !== "active") {
    endUserSessions(uid, { reason: status ? "disabled" : "deleted" });
    return null;
  }

  const personal: VaultRef = { kind: "user", id: uid };
  const personalKey = getCachedKey(uid, personal);
  if (!personalKey) {
    endSession(sid, "invalid");
    return null;
  }
  try {
    // Idempotent: touches an open vault (keeping the idle lock away), reopens an evicted one.
    openVault(personal, personalKey);
  } catch (err) {
    logError("session:reopen", err);
    endSession(sid, "invalid");
    return null;
  }

  let vault: VaultRef = live.vault;
  let spaceRole: SpaceRole | null = null;
  if (vault.kind === "space") {
    spaceRole = ensureSpaceOpen(uid, vault.id);
    if (!spaceRole) {
      vault = personal;
      setSessionVault(sid, personal);
    }
  }

  const now = Date.now();
  touchLiveSession(sid, now);
  try {
    touchSession(sid, now);
  } catch (err) {
    logError("session:touch", err);
  }

  return { userId: uid, role: status.role, sessionId: sid, vault: { ...vault }, spaceRole };
}

/**
 * Call at the top of every protected page, layout and `generateMetadata`. Binds
 * the user's vault to this render (so `getDb()` works in the components below)
 * and redirects to /login when there is no valid session. Layout-level checks
 * alone aren't a boundary in the App Router.
 */
export async function requireUser(): Promise<RequestScope> {
  const scope = await resolveScope();
  if (!scope) redirect("/login");
  bindRenderScope(scope);
  return scope;
}

/**
 * Same checks as `requireUser`, without binding a render scope — for Server
 * Actions and route handlers, which run their work inside `runWithScope`
 * instead (an action may switch vaults and then re-render).
 */
export async function requireUserForAction(): Promise<RequestScope> {
  const scope = await resolveScope();
  if (!scope) redirect("/login");
  return scope;
}

/** Admin pages. A signed-in non-admin is sent to the dashboard. */
export async function requireAdmin(): Promise<RequestScope> {
  const scope = await requireUser();
  if (scope.role !== "admin") redirect("/dashboard");
  return scope;
}

/** Admin actions: no render binding and — by convention — no vault access. */
export async function requireAdminForAction(): Promise<RequestScope> {
  const scope = await requireUserForAction();
  if (scope.role !== "admin") redirect("/dashboard");
  return scope;
}

/** Route handlers and hand-written actions: requireUser + `runWithScope`. */
export async function withUser<T>(fn: (scope: RequestScope) => T | Promise<T>): Promise<T> {
  const scope = await requireUserForAction();
  return runWithScope(scope, () => fn(scope));
}

/** For public pages (login, invite…): the signed-in user or null, never redirects. */
export async function getOptionalUser(): Promise<RequestScope | null> {
  try {
    return await resolveScope();
  } catch (err) {
    logError("session:optional", err);
    return null;
  }
}

/** True while a freshly shown recovery key hasn't been acknowledged yet. */
export async function isRecoveryKeyPending(): Promise<boolean> {
  const session = await getSession();
  return session.recoveryKeyPending === true;
}
