import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeUsername } from "./username";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 256;

export type PasswordCheck = { ok: true } | { ok: false; message: string };

const COMMON_PASSWORDS_FILE = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "src/modules/core/auth/common-passwords.txt",
);

let commonPasswords: Set<string> | undefined;

/** The bundled list (lower-cased), read once per process. */
function getCommonPasswords(): Set<string> {
  if (!commonPasswords) {
    const text = readFileSync(/* turbopackIgnore: true */ COMMON_PASSWORDS_FILE, "utf8");
    commonPasswords = new Set(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#")),
    );
  }
  return commonPasswords;
}

export function isCommonPassword(password: string): boolean {
  return getCommonPasswords().has(password.normalize("NFKC").toLowerCase());
}

/** Length is counted in Unicode code points, so emoji/CJK aren't penalized. */
export function checkPassword(
  password: string,
  options: { username?: string } = {},
): PasswordCheck {
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      message: `Use at least ${PASSWORD_MIN_LENGTH} characters — a few unrelated words make a strong, memorable password.`,
    };
  }
  if (length > PASSWORD_MAX_LENGTH) {
    return { ok: false, message: `Use at most ${PASSWORD_MAX_LENGTH} characters.` };
  }
  if (options.username && normalizeUsername(password) === normalizeUsername(options.username)) {
    return { ok: false, message: "Your password can't be the same as your username." };
  }
  if (isCommonPassword(password)) {
    return {
      ok: false,
      message: "That password is too common and easy to guess. Pick something more personal.",
    };
  }
  return { ok: true };
}
