/**
 * Usernames are case-insensitive identifiers: NFKC-normalized, trimmed and
 * lower-cased before they are validated, stored or compared. Pure — safe for
 * client components (e.g. live form hints).
 */

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;

export type UsernameCheck = { ok: true; username: string } | { ok: false; message: string };

export function normalizeUsername(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase();
}

export function checkUsername(raw: string): UsernameCheck {
  const username = normalizeUsername(raw);
  if (username.length < USERNAME_MIN_LENGTH) {
    return { ok: false, message: `Username must be at least ${USERNAME_MIN_LENGTH} characters.` };
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return { ok: false, message: `Username can be at most ${USERNAME_MAX_LENGTH} characters.` };
  }
  if (/^[._-]/.test(username)) {
    return { ok: false, message: "Username must start with a letter or a digit." };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      message:
        "Username can only contain plain letters (a–z), digits, dots, dashes and underscores.",
    };
  }
  return { ok: true, username };
}

/** The normalized username when valid, otherwise `null`. */
export function parseUsername(raw: string): string | null {
  const result = checkUsername(raw);
  return result.ok ? result.username : null;
}
