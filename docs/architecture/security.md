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
2. **First run**: choosing a passphrase generates the vault (DEK + both wrapped copies) and immediately shows the generated recovery key once, with a copy-to-clipboard affordance and an explicit "I've saved this somewhere safe" acknowledgment gating access to the dashboard — a client-side UX nudge, not a security boundary (the session is already unlocked by this point).
3. **Return visit**: passphrase entered → unwraps the DEK → opens `data/app.db`. A session cookie (`iron-session`) holds session state in memory for the browser session.
4. **Forgotten passphrase**: a "Forgot passphrase?" link switches to a recovery-key entry form. A correct recovery key unwraps the DEK and requires setting a new passphrase before reaching the dashboard (re-wraps only the passphrase slot — the same recovery key stays valid afterward, so nothing new needs to be saved).
5. Wrong passphrase or recovery key → a specific but still generic-enough failure message (don't reveal whether the file exists / is corrupt vs. wrong key).

## Network exposure

- `pnpm dev` / `pnpm start` bind to `127.0.0.1` only — **never** `0.0.0.0`. This is a deliberate choice, not a default left unexamined: this app holds extremely sensitive financial/health data behind a single passphrase and was never designed to be reachable from other devices on the network.
- The only outbound network calls the app makes are one-way public-data pulls (mutual fund NAV refresh via AMFI/`mfapi.in`) — see [../prd/finance/investments.md](../prd/finance/investments.md). No personal data is ever sent anywhere.

## Dev/testing data isolation

`data/` is the one real vault. Any live/manual testing (Playwright, exploratory `pnpm dev` sessions) must run against an isolated `APP_DATA_DIR` (e.g. `data-dev`) instead — see `AGENTS.md`. Automated tests never touch disk for the database itself (an in-memory SQLite DB per test); `crypto.test.ts` isolates its own file-based state under a temp `APP_DATA_DIR` per test.

## Hardening checklist

| Item | Status |
|---|---|
| Localhost-only binding | Enforced in `package.json` scripts |
| Passphrase recovery | Implemented — a recovery key generated at vault setup, independent of the passphrase, via envelope encryption (see above) |
| Pre-commit lint/typecheck/test | husky + lint-staged |
| Dependency vulnerability scanning | `pnpm audit`, manual/periodic — see [../../ROADMAP.md](../../ROADMAP.md) |
| Backup/disaster-recovery | Partial — a forgotten passphrase is now recoverable via the recovery key, but there is still no file-level backup automation; any manual backup must include `keyring.json` alongside `app.db`, or both credentials become useless together |
