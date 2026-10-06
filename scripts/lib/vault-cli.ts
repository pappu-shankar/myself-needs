/**
 * Shared plumbing for one-off scripts that read or write one user's vault:
 * parses `--user <uuid>`, prompts for that user's password (hidden, never
 * logged), unlocks `<APP_DATA_DIR>/users/<uuid>`, and runs `fn` inside a request
 * scope so `getDb()` and every service resolve to that vault.
 *
 * Run scripts with the server-only shim (see ./server-only-shim.mjs):
 *
 *   pnpm exec tsx --import ./scripts/lib/server-only-shim.mjs scripts/<script>.ts --user <uuid>
 *
 * Set APP_DATA_DIR=data-dev to point at the dev data directory instead of data/.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { closeAllVaults, openVault } from "@/modules/core/db/client";
import { unlockWithPassword } from "@/modules/core/db/crypto";
import { runWithScope } from "@/modules/core/db/request-scope";
import type { RequestScope, VaultRef } from "@/modules/core/db/vault-types";
import { assertSafeId, getDataDir, getVaultDir } from "@/modules/core/env/paths";

const KEY_LF = 10;
const KEY_CR = 13;
const KEY_CTRL_C = 3;
const KEY_CTRL_D = 4;
const KEY_BACKSPACE = 127;
const KEY_DELETE = 8;

export function promptHidden(query: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    process.stdout.write(query);
    let value = "";
    const onData = (char: Buffer) => {
      const code = char[0];
      if (code === KEY_LF || code === KEY_CR || code === KEY_CTRL_D) {
        process.stdin.removeListener("data", onData);
        process.stdin.setRawMode?.(false);
        process.stdout.write("\n");
        rl.close();
        resolve(value);
      } else if (code === KEY_CTRL_C) {
        process.exit(1);
      } else if (code === KEY_BACKSPACE || code === KEY_DELETE) {
        value = value.slice(0, -1);
      } else {
        value += char.toString("utf8");
      }
    };
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.on("data", onData);
  });
}

export function promptPlain(query: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer);
    }),
  );
}

/** The value of `--user <uuid>` (or `--user=<uuid>`), validated; exits on a missing/bad id. */
export function parseUserArg(argv: string[] = process.argv.slice(2)): string {
  let value: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--user") value = argv[i + 1];
    else if (argv[i].startsWith("--user=")) value = argv[i].slice("--user=".length);
  }
  try {
    if (!value) throw new Error("missing");
    return assertSafeId(value);
  } catch {
    console.error(
      "Usage: ... --user <account uuid>  (see the users/ directory under APP_DATA_DIR)",
    );
    process.exit(2);
  }
}

/** Unlocks the `--user` vault and runs `fn` inside its scope; always closes the vault. */
export async function withUserVault(fn: () => void | Promise<void>): Promise<void> {
  const userId = parseUserArg();
  // Checked before getVaultDir(), which would create the directory.
  if (!existsSync(path.join(getDataDir(), "users", userId))) {
    console.error(`No vault for user ${userId} under ${getDataDir()}`);
    process.exitCode = 1;
    return;
  }
  const vault: VaultRef = { kind: "user", id: userId };
  const password = await promptHidden(`Password for ${userId}: `);

  let dekHex: string;
  try {
    dekHex = await unlockWithPassword(getVaultDir(vault), password);
  } catch (err) {
    console.error(err instanceof Error ? err.message : "Unlock failed");
    process.exitCode = 1;
    return;
  }

  openVault(vault, dekHex);
  const scope: RequestScope = {
    userId,
    role: "member",
    sessionId: "script",
    vault,
    spaceRole: null,
  };
  try {
    await runWithScope(scope, fn);
  } finally {
    closeAllVaults();
  }
}
