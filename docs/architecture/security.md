# Security

Unlock flow, encryption at rest, and network exposure.

**Related:** [data-model.md](./data-model.md) · [../prd/finance/](../prd/finance/) (holds the most sensitive data)

## Threat model

Single user, single machine, local-only. The realistic risk is physical device access (lost/stolen laptop) or an unencrypted backup exposing the raw file — not remote attackers, since the app is never exposed to the network. Designed accordingly: no multi-user auth, no OAuth, but real encryption at rest and a deliberate no-network-exposure stance.

## Encryption at rest — envelope encryption (DEK/KEK)

The database's actual SQLCipher key is a randomly-generated 32-byte DEK (data encryption key), independent of any credential — not derived directly from the passphrase. The DEK is wrapped (AES-256-GCM) once per credential:

- **Passphrase**: `KEK = scrypt(passphrase, salt)` — hardened cost params (`N=131072`), explicit rather than relying on Node's implicit defaults.
- **Recovery key**: a separately-generated, high-entropy 128-bit value (hex, grouped for readability) shown once at vault setup — `KEK = scrypt(recoveryKey, salt)`, same hardened params.

Both wrapped copies live in `data/keyring.json`, written atomically (temp file + rename) since a half-written copy would be catastrophic — it alone reconstructs the database key. A wrong credential fails via AES-GCM's own authentication check (no manual/timing-sensitive comparison needed); the existing SQLCipher pragma-probe on open is kept as a cheap secondary sanity check.

- Database file: `data/app.db`, gitignored, encrypted via `better-sqlite3-multiple-ciphers` (SQLite3MultipleCiphers), keyed by the DEK.
- No plaintext copy of the database is ever written (no debug dumps to disk containing decrypted data).
- Neither the passphrase, the recovery key, nor the DEK itself is ever persisted anywhere except wrapped inside `keyring.json`.
- **`keyring.json` is the single most valuable file in the app.** Losing it means permanent data loss even with a perfectly-remembered passphrase, because the passphrase only unwraps a DEK that exists nowhere else — any future backup story must include `keyring.json` alongside `app.db`, not `app.db` alone.

## Unlock flow

1. App starts → unlock screen (not the dashboard) is the first thing shown, every time. No cached/remembered passphrase.
2. **Vault status is decided from both files.** `getVaultStatus()` (`src/modules/core/db/crypto.ts`) looks at `keyring.json` **and** `app.db`: neither → first run; both → normal unlock; only one → the unlock page explains which file is missing and how to restore it, and refuses to do anything else. Vault creation also refuses to run if either file exists (the keyring is created with an atomic create-if-absent `link`), so a moved or missing `app.db` can never cause the surviving keyring to be overwritten.
3. **First run**: choosing a passphrase generates the vault (DEK + both wrapped copies) and immediately shows the generated recovery key once, with a copy-to-clipboard affordance and an explicit "I've saved this somewhere safe" acknowledgment gating access to the dashboard — a client-side UX nudge, not a security boundary.
4. **Return visit**: passphrase entered → unwraps the DEK → opens `data/app.db` (applying any pending migrations, see [data-model.md](./data-model.md)). A wrong passphrase, a damaged/mismatched database and an unreadable keyring each produce their own message.
5. **Forgotten passphrase**: "Forgot passphrase?" switches to a recovery-key form. A correct recovery key unwraps the DEK; the database is opened **before** the passphrase slot is re-wrapped, so a vault that can't be opened never ends up with a changed keyring. The recovery key stays valid afterwards.
6. **Settings → Recovery key / Passphrase**: while unlocked, the passphrase can be changed (requires the current one) and the recovery key can be rotated (requires the passphrase). Rotation replaces the recovery slot, so the old key stops working at once — but any older copy of `keyring.json` (e.g. in a backup) still opens with the key it was made with.
7. Key derivation (scrypt, N=2^17) runs asynchronously so it never blocks the server.

## Sessions

- The cookie (`iron-session`, `httpOnly`, `SameSite=Strict`) is a **browser-session cookie** — no `Max-Age`, gone when the browser closes.
- iron-session cookies can't be revoked on their own, so each unlock also mints a random **epoch** kept only in server memory (`src/modules/core/session/unlock-state.ts`); a cookie is valid only while it carries the current epoch. Locking, idle auto-lock and a server restart all discard the epoch, which revokes every outstanding cookie at once, not just the current browser's.
- **Idle auto-lock**: after 30 minutes without an authenticated request the database is closed and the epoch discarded. Configure with `APP_IDLE_LOCK_MINUTES` (`0` disables it).
- `requireUnlocked()` checks database-open + cookie-epoch on every protected page, API route and (via `defineFormAction`/`defineAction`) every Server Action. This is enforced by `src/test/architecture.test.ts`.

## Network exposure

- `pnpm dev` / `pnpm start` bind to `127.0.0.1` only — **never** `0.0.0.0`. This app holds extremely sensitive financial/health data behind a single passphrase and was never designed to be reachable from other devices on the network.
- **Host allow-list** (`src/proxy.ts`): requests whose `Host` isn't `127.0.0.1`, `localhost` or `[::1]` are refused with 403. Binding to loopback alone doesn't stop a malicious website from reaching the app through DNS rebinding; this does.
- **Content-Security-Policy** with a per-request nonce (`src/proxy.ts`), including `connect-src 'self'`: no script on the page can send data to another origin. This also blocks the usage-telemetry beacon that ships inside `@mediapipe/tasks-vision` (it posts to `odml.pa.googleapis.com`). Plus `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, and no `X-Powered-By`.
- The only outbound network calls the app makes are one-way public-data pulls from the server (mutual fund NAV refresh via AMFI/`mfapi.in`) — see [../prd/finance/investments.md](../prd/finance/investments.md). No personal data is ever sent anywhere.

## Files on disk

- `data/` is created `0700`; `app.db`, `keyring.json`, `session-secret.bin` and migration backups are `0600` (existing files are tightened on first access). The keyring is written to a temp file, fsynced, then atomically renamed into place.
- Logs go to the terminal running the app only, and never contain action inputs or query parameters (Drizzle's query errors embed bound parameters, so those are redacted — see `src/modules/core/log.ts`).
- Don't keep the passphrase or recovery key in a file next to the vault (e.g. a `.env` in the project or in `data/`): anyone who can copy the folder could then open it. Use a password manager.

## Dev/testing data isolation

`data/` is the one real vault. Any live/manual testing (Playwright, exploratory `pnpm dev` sessions) must run against an isolated `APP_DATA_DIR` (e.g. `data-dev`) instead — see `AGENTS.md`. Automated tests never touch the real vault: most use an in-memory SQLite DB per test; `crypto.test.ts` and `client.test.ts` exercise the real encrypted file paths under a temp `APP_DATA_DIR`.

## Hardening checklist

| Item | Status |
|---|---|
| Localhost-only binding | Enforced in `package.json` scripts |
| DNS-rebinding protection | Host allow-list in `src/proxy.ts` |
| Content-Security-Policy | Nonce-based, `connect-src 'self'` — `src/proxy.ts` |
| Session check on every page, action and route | `requireUnlocked` + `defineFormAction`; enforced by `src/test/architecture.test.ts` |
| Session revocation / auto-lock | In-memory unlock epoch; 30-minute idle lock (`APP_IDLE_LOCK_MINUTES`) |
| Passphrase recovery | Recovery key via envelope encryption; rotatable in Settings |
| Safe first run | Vault status from both files; keyring never overwritten |
| Migration safety | Encrypted pre-migration backup, automatic restore on failure |
| File permissions | `0700` data dir, `0600` vault files |
| Pre-commit lint/typecheck/test | husky + lint-staged |
| Dependency vulnerability scanning | `pnpm audit`, manual/periodic — see [../../ROADMAP.md](../../ROADMAP.md) |
| Backup/disaster-recovery | Partial — automatic encrypted backups before migrations only. A manual backup must include `keyring.json` alongside `app.db` (and, until photos move into the database, `fashion-photos/` and `fashion-garments/`) |
