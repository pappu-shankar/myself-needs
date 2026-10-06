/**
 * Lets a one-off script load app code outside Next.js. App modules import
 * `server-only`, which Next resolves (to a no-op under the `react-server`
 * condition) but plain Node can't find. This maps it to that same empty
 * module, for both `import` and `require`. Load with `tsx --import`:
 *
 *   pnpm exec tsx --import ./scripts/lib/server-only-shim.mjs scripts/<script>.ts --user <uuid>
 */
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

const EMPTY = pathToFileURL(
  path.resolve(process.cwd(), "node_modules/next/dist/compiled/server-only/empty.js"),
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: EMPTY, format: "commonjs", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
