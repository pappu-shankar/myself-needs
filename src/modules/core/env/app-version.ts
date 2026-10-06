import "server-only";
import pkg from "../../../../package.json";

/** The app version, inlined at build time from package.json (unlike
 * `npm_package_version`, it doesn't depend on how the server was started). */
export const APP_VERSION: string = pkg.version;

/** `1.2.3`, or `1.2.3+<sha>` when the deployment sets GIT_SHA. */
export function getAppVersionLabel(): string {
  const sha = process.env.GIT_SHA?.trim();
  return sha ? `${APP_VERSION}+${sha.slice(0, 12)}` : APP_VERSION;
}
