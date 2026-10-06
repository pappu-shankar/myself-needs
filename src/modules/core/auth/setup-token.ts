import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getConfig } from "@/modules/core/env/config";

/**
 * Who may create the first admin on a fresh install. Not "whoever reaches the
 * site first": they must present `APP_SETUP_TOKEN`, or — when that isn't set —
 * a one-time token generated at first need and printed once to the server log
 * (only someone with access to the host can read it). Kept in memory, so a
 * restart prints a new one.
 */

const globalForSetup = globalThis as unknown as { __oneTimeSetupToken?: string };

/** Generates and logs the one-time token if needed. Call when the setup page renders. */
export function announceSetupToken(): void {
  if (getConfig().setupToken || globalForSetup.__oneTimeSetupToken) return;
  const token = randomBytes(24).toString("base64url");
  globalForSetup.__oneTimeSetupToken = token;
  console.warn(
    `[setup] No APP_SETUP_TOKEN is set. One-time setup token for creating the first admin: ${token}`,
  );
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function verifySetupToken(input: string): boolean {
  const expected = getConfig().setupToken ?? globalForSetup.__oneTimeSetupToken;
  if (!expected) {
    announceSetupToken();
    return false;
  }
  return timingSafeEqual(digest(input.trim()), digest(expected));
}

/** After setup completes the one-time token is spent. */
export function consumeSetupToken(): void {
  globalForSetup.__oneTimeSetupToken = undefined;
}

/** Test-only peek at the generated token. */
export function __getOneTimeSetupTokenForTests(): string | undefined {
  if (process.env.NODE_ENV !== "test") throw new Error("test only");
  return globalForSetup.__oneTimeSetupToken;
}

export function __resetSetupTokenForTests(): void {
  globalForSetup.__oneTimeSetupToken = undefined;
}
