import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { acceptInviteAction, setupAction } from "@/modules/core/auth/actions";
import { createInvite } from "@/modules/core/auth/admin-service";
import { findByUsername, type Account } from "@/modules/core/auth/accounts-store";
import { __resetSetupTokenForTests } from "@/modules/core/auth/setup-token";
import { setupTestRegistry, teardownTestRegistry } from "@/modules/core/auth/test-registry";
import { closeAllVaults, getDb } from "@/modules/core/db/client";
import { __setKdfParamsForTests } from "@/modules/core/db/crypto";
import type { RequestScope } from "@/modules/core/db/vault-types";
import { resetConfigForTests } from "@/modules/core/env/config";
import { requireUserForAction, withUser } from "@/modules/core/session/guard";
import { resetSessionRegistryForTests } from "@/modules/core/session/session-registry";
import { resetBrowsers, switchBrowser } from "./fake-next";

/**
 * End-to-end harness for multi-user tests: a temporary APP_DATA_DIR, an
 * in-memory account registry, cheap KDF params, and helpers that sign people
 * up through the real Server Actions. Test files must mock next/headers,
 * next/navigation and next/cache with ./fake-next first.
 */

export const SETUP_TOKEN = "test-setup-token-0123456789";
export const PASSWORDS: Record<string, string> = {};

export function passwordFor(username: string): string {
  return (PASSWORDS[username] ??= `plum-orbit-${username}-candle-77`);
}

let workDir: string | undefined;
const savedEnv: Record<string, string | undefined> = {};

const ENV_KEYS = [
  "APP_DATA_DIR",
  "APP_SETUP_TOKEN",
  "APP_MAX_OPEN_VAULTS",
  "APP_IDLE_LOCK_MINUTES",
];

export function setupMultiUserEnv(env: Record<string, string> = {}): string {
  workDir = path.join(process.cwd(), ".vitest-tmp", randomUUID());
  mkdirSync(workDir, { recursive: true });
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.APP_DATA_DIR = path.join(workDir, "data");
  process.env.APP_SETUP_TOKEN = SETUP_TOKEN;
  delete process.env.APP_MAX_OPEN_VAULTS;
  delete process.env.APP_IDLE_LOCK_MINUTES;
  Object.assign(process.env, env);
  resetConfigForTests();
  __setKdfParamsForTests({ N: 1024, r: 8, p: 1 });
  closeAllVaults();
  resetSessionRegistryForTests();
  setupTestRegistry();
  resetBrowsers();
  __resetSetupTokenForTests();
  return process.env.APP_DATA_DIR;
}

export function teardownMultiUserEnv(): void {
  closeAllVaults();
  resetSessionRegistryForTests();
  teardownTestRegistry();
  __setKdfParamsForTests(null);
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  resetConfigForTests();
  if (workDir) rmSync(workDir, { recursive: true, force: true });
  workDir = undefined;
}

export function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

/** Creates the first admin through `setupAction`, signed in in browser `username`. */
export async function setupAdmin(username = "admin"): Promise<Account> {
  switchBrowser(username);
  const password = passwordFor(username);
  const state = await setupAction(
    {},
    form({ setupToken: SETUP_TOKEN, username, password, confirmPassword: password }),
  );
  if (!state.recoveryKey) throw new Error(`setup failed: ${state.error}`);
  return findByUsername(username)!;
}

/** Admin invites `username`, who accepts in their own browser (left active). */
export async function inviteAndJoin(
  admin: Account,
  username: string,
): Promise<{ account: Account; recoveryKey: string }> {
  const { token } = createInvite(admin.id, {});
  switchBrowser(username);
  const password = passwordFor(username);
  const state = await acceptInviteAction(
    {},
    form({ token, username, password, confirmPassword: password }),
  );
  if (!state.recoveryKey) throw new Error(`invite failed: ${state.error}`);
  return { account: findByUsername(username)!, recoveryKey: state.recoveryKey };
}

/** The signed-in scope of a browser (throws the redirect when signed out). */
export async function scopeOf(browserName: string): Promise<RequestScope> {
  switchBrowser(browserName);
  return requireUserForAction();
}

/** Runs `fn` as a request from that browser, inside its scope. */
export async function asUser<T>(
  browserName: string,
  fn: (scope: RequestScope) => T | Promise<T>,
): Promise<T> {
  switchBrowser(browserName);
  return withUser(fn);
}

export function addGoal(name: string): void {
  getDb().run(sql`INSERT INTO plans_goals (name) VALUES (${name})`);
}

export function goalNames(): string[] {
  return getDb()
    .all<{ name: string }>(sql`SELECT name FROM plans_goals ORDER BY id`)
    .map((row) => row.name);
}
