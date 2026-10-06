# Security

Threat model, per-user encryption, sign-in and sessions, request routing, network edge, and known risks.

**Related:** [data-model.md](./data-model.md) · [multi-user-contracts.md](./multi-user-contracts.md) (pinned interfaces) · [../deploy.md](../deploy.md) (running it on the internet) · [../prd/finance/](../prd/finance/) (the most sensitive data)

Status note: this describes the implemented core (`src/modules/core/{db,session,auth,spaces,env}`, `src/proxy.ts`). Items marked *(unverified)* were read from code or plan but not exercised end to end; the sign-in/admin/settings **pages** were still landing when this was written (see [../roadmap/phase-8-multi-user.md](../roadmap/phase-8-multi-user.md)).

## Threat model

The app is a multi-user, self-hosted service that can sit on the public internet behind a TLS reverse proxy. Whoever runs it is the **operator**; people they invite are **users**; one user is the **admin**.

In scope:

- **Remote attackers** guessing passwords, enumerating usernames, replaying invite links, forging cross-site requests, abusing DNS rebinding, or exhausting memory through the key-derivation function (KDF).
- **Other users** of the same instance trying to read each other's data or a space they don't belong to.
- **The in-app admin**, who manages accounts but must not be able to read other users' data.
- **Stolen disk or backup**: files at rest are useless without a user's password or recovery key.

**What "private" means here.** Data is private *at rest* and *from the in-app admin*. It is **not** private from whoever controls the server: a process with access to the host can read memory (unlocked keys while sessions are live), modify the code, or capture passwords at sign-in. Only host users you trust should operate this.

## Encryption: one vault per user and per space

A **vault** is one SQLCipher database (`better-sqlite3-multiple-ciphers`) with its own random 32-byte **DEK** (data encryption key) and the full app schema. There is no `user_id` column anywhere; isolation is by file.

```
data/accounts.db                      account registry (plaintext metadata)
data/session-secret.bin               cookie-sealing secret
data/avatars/<userId>.webp|jpg        plaintext profile images
data/users/<uuid>/app.db, keyring.json, backups/, fashion-photos/, fashion-garments/
data/spaces/<uuid>/app.db, backups/   shared spaces (no password keyring)
```

### Personal vaults: envelope encryption

The DEK is independent of any credential and wrapped (AES-256-GCM) once per credential in the user's `keyring.json`:

- **Password**: `KEK = scrypt(password, salt)`.
- **Recovery key**: a generated 128-bit value shown once, `KEK = scrypt(recoveryKey, salt)`.

A wrong credential fails AES-GCM authentication. **No password hash is stored anywhere**: a password is correct exactly when it unwraps that user's DEK. The keyring is written atomically (temp file, fsync, rename); creation refuses to overwrite an existing vault.

**KDF cost is calibrated, not fixed.** `calibrateKdf()` (`db/crypto.ts`) times scrypt on the host once per process and picks `N` for about 250 ms (never below 2^15); the chosen `{N, r, p}` is stored in each keyring. A keyring without a `kdf` field uses the legacy `N=2^17, r=8, p=1`, so older vaults keep working.

**KDF semaphore.** scrypt at this cost uses roughly 128 MB per derivation, so at most 2 run concurrently and 8 may queue; beyond that callers get `KdfBusyError` immediately. This bounds memory under a sign-in flood.

### Identity keys and sealed space keys

Each user gets an **X25519 identity key pair** at account creation. The public key is plaintext in `accounts.db`; the private key is AES-256-GCM-encrypted under a key HKDF-derived from the user's DEK and kept in their keyring (`db/sealing.ts`).

A **space** is another vault whose DEK is generated at creation and stored **only sealed to each member's public key** (`space_members.sealed_key`): ephemeral X25519 ECDH, HKDF-SHA256, AES-256-GCM. At sign-in the user unseals the keys of every space they belong to. Consequences:

- Adding a member needs no online interaction from them: the owner seals the key to their public key.
- The admin plays no part in sharing and never holds a space key.
- **Removing a member re-keys the space** (`PRAGMA rekey` to a fresh DEK, re-sealed for the remaining members; registry update and rekey share one transaction). If no remaining member is online, the re-key is deferred and completed the next time a holder opens the space (`ensureSpaceOpen`). Until then, the removed member's cached copy of the old DEK is the residual risk; removal also drops their membership, so they cannot open the space going forward. Note that a removed member could have copied data while they had access, as with any shared system.
- Roles: owner, editor, viewer. Actions that aren't `readOnly` are refused for a viewer.

### Account registry (`data/accounts.db`)

Plain SQLite with raw SQL, versioned by `user_version` (separate from `drizzle/`). Tables: `accounts`, `invites`, `sessions`, `audit`, `spaces`, `space_members`, `alerts_dismissed`, `login_throttle`.

It holds **plaintext metadata only**: username, display name, colour, role, status, last login, lockout counters, public key, invite token **hashes** (sha256, expiry, single use), session history (ip, user agent), the security audit log, space names/membership/roles/sealed keys, throttle state.

**Why plaintext:** it is needed *before* anyone authenticates (to find which vault to unwrap, to throttle by name, to validate an invite), so it cannot be keyed to a user. It contains no passwords, hashes of passwords, DEKs, or vault contents. Usernames, space names and audit entries are therefore visible to anyone with the file or with the admin UI.

## Sign-in flow

Password sign-in (`auth/auth-service.ts`):

1. **Throttle check** (below). A throttled attempt is audited and refused before any KDF work.
2. **Lookup by normalised username** (NFKC, lower-case, `^[a-z0-9][a-z0-9._-]{2,31}$`).
3. **Unknown user: `dummyUnwrap()`**, a real scrypt against a throw-away keyring with the calibrated cost, so timing matches a real attempt. The error is the same generic "Incorrect username or password." for unknown user and wrong password, and both increment the same throttle.
4. Real user: `unlockWithPassword(<user dir>, password)`. A disabled account is only revealed **after** the password was correct.
5. On success: unseal space keys, open the personal vault (applies pending migrations, see [data-model.md](./data-model.md)), register the session, record the audit/session rows, and flag a new device.

**Recovery key** (`/login/recover`): same throttle (namespaced key), same dummy unwrap for unknown users. The vault is opened *before* the keyring is rewritten, so an unopenable vault never ends up with a changed keyring. A successful reset ends the user's other sessions. The recovery key stays valid.

**Throttling** (`auth/throttle.ts`; all layers must allow):

| Layer | Rule |
|---|---|
| Per username, persisted (`login_throttle`) | Key is a sha256 of the normalised name, so unknown names throttle like real ones. 5 free failures, then 30 s doubling to a 15 min cap; survives restarts; forgotten 24 h after the last failure |
| Per IP, in memory | 20 failures per 15 min. Only when an IP is known, i.e. `APP_TRUST_PROXY` is on (IPv6 grouped by /64) |
| Global, in memory | 60 failures per minute |

Recovery-key, invite and claim attempts use their own key namespaces with the same limits.

**Passwords**: 12 to 256 characters, not in a bundled common-password list, not the username. **Invites**: 32-byte random token, only its sha256 is stored, 72 h expiry, single use, redeemed by one atomic update inside the same registry transaction that creates the account. The link carries the token in the URL fragment so it doesn't reach proxy logs *(unverified: invite UI pending)*.

**Fresh install**: the first admin needs `APP_SETUP_TOKEN` (16+ chars) or a one-time token printed to the server log, so whoever reaches the site first cannot claim it.

**Account creation is all-or-nothing**: the vault directory, keyring, migrated DB, identity keys and registry rows are created together; on failure the directory is moved to a `.trash-` sibling and the vault closed.

## Sessions

Two halves, both required:

- **Cookie** (`iron-session`, `httpOnly`, `SameSite=Strict`, no `Max-Age`): sealed `{uid, sid}`. Over HTTPS (`APP_PUBLIC_ORIGIN` is https, or `APP_SECURE_COOKIES=1`) it is `Secure` and named with the `__Host-` prefix.
- **In-memory registry** (`session/session-registry.ts`): sid to user and current vault, plus each user's unlocked DEKs (personal vault and spaces) kept only while they have a live session. **Keys are never written to disk**, so a server restart signs everyone out.

`resolveScope()` in `session/guard.ts` checks on every request: the cookie's sid is live and belongs to the uid; the account still exists and is active (5 s cache, so a disable or delete ends that user's sessions within seconds); the personal vault opens; and if the session is viewing a space, the user is still a member (else it falls back to their own vault).

Lifetimes and endings:

- **Idle lock**: `APP_IDLE_LOCK_MINUTES` (default 30). Each vault in the pool has an idle timer; when a user's *personal* vault idles out, **all that user's sessions end** (`idle`, audited). Every authenticated request touches the vault.
- **Absolute max age**: `APP_SESSION_MAX_HOURS` (default 12).
- **Eviction is not idle.** The pool holds at most `APP_MAX_OPEN_VAULTS` (default 50) vaults, closing the least recently used. An evicted vault only closes the connection; the user's cached key stays and the next request reopens it transparently. Only idle closes sign people out.
- Sign out (this session), sign out everywhere, sign out one device, password change, admin disable/delete: each ends the relevant sessions immediately. When a user's last session ends their keys are forgotten and vaults nobody else holds are closed.
- A **new device** (user-agent + IP prefix not seen before) raises an in-app alert and a security log entry. Network is judged from the IP prefix only; no external geo lookup.

## Request routing: which database does this request use?

`getDb()` must never fall through to another user's data. Two carriers (`db/request-scope.ts`):

- **Server Actions and route handlers** run in `runWithScope(scope, fn)` (`AsyncLocalStorage.run`).
- **Server Component renders** cannot be wrapped by their parent, so `requireUser()` fills a **React `cache()` box**, which React scopes to the current render request.

`getDb()` (`db/client.ts`) returns the connection for `currentScope().vault`; with no scope it **throws** (`VaultStateError`), i.e. **fail-closed**. A test-only default connection exists when `NODE_ENV === "test"`. Binding a *different* user or vault to an already-bound render throws. **`enterWith` is never used** (it leaks scope into whatever runs next on the same async context); `architecture.test.ts` enforces this.

Guards (`session/guard.ts`): `requireUser()` (pages, layouts, `generateMetadata`), `requireAdmin()`, `withUser()` (route handlers, hand-written actions), `defineFormAction`/`defineAction`, `defineAdminAction` (admin code never opens another user's vault). Details in [system-design.md](./system-design.md#server-actions-and-pages-the-enforced-conventions).

## Network edge

`src/proxy.ts` with pure decisions in `src/modules/core/env/edge-policy.ts`:

- **Host allow-list**: loopback plus `APP_PUBLIC_ORIGIN`'s host plus `APP_ALLOWED_HOSTS`; anything else is 403 (DNS rebinding).
- **Origin allow-list**: every request other than GET/HEAD needs an `Origin` that is the public origin or loopback http; otherwise 403. Next's Server Actions `allowedOrigins` is also derived from `APP_PUBLIC_ORIGIN` at **build** time.
- **Body limit**: POSTs to `/login`, `/login/recover`, `/invite`, `/setup`, `/claim` over 64 KB are refused (413, by `Content-Length`).
- **Headers**: CSP with a per-request nonce and `connect-src 'self'` (also blocks the MediaPipe telemetry beacon), `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, COOP/CORP same-origin, a restrictive `Permissions-Policy`, **HSTS** (2 years, includeSubDomains) when the public origin is https, and **`Cache-Control: no-store` on every response** the proxy handles.
- **`/healthz`** returns only `{ok, version}`.
- **Bind address and proxy.** The app listens on plain HTTP; Docker Compose puts Caddy in front for TLS, with the app reachable only on the private network. Caddy overwrites `X-Forwarded-*`; the app trusts them only with `APP_TRUST_PROXY=1`. Never expose the Node port, and never run `next dev` on an exposed host. See [../deploy.md](../deploy.md).
- Outbound calls: only one-way public-data pulls (mutual fund NAV from AMFI/`mfapi.in`). No personal data is sent anywhere.

## Files on disk

- `data/`, `users/<id>`, `spaces/<id>` are `0700`; vault, keyring, secret and backup files `0600`. Ids are validated as UUIDs before touching the filesystem.
- Migration backups are byte copies of the encrypted DB (newest 5 per vault), so are exactly as encrypted as the original.
- Deleting a user or space renames its folder to a `.trash-` sibling first so a crash never leaves half a vault.
- Logs never contain action inputs, query parameters or secrets (`src/modules/core/log.ts`).
- Don't store passwords or recovery keys next to the data.

## Legacy claim (upgrading a single-vault install)

A pre-multi-user install (`data/app.db` + `data/keyring.json`) is claimed by its owner at `/claim`: enter a username and the **old passphrase** (which proves ownership; nothing is touched on a wrong one). The DB is checkpointed, an identity key pair is added to the keyring, a crash marker `data/.claim.json` is written, the files are **renamed** (never deleted) into `data/users/<id>.partial/` then `data/users/<id>/`, and the admin account row is created. Every step after the marker needs no secret and is idempotent, so an interrupted claim is finished automatically on the next request. The old recovery key keeps working. Page flow *(unverified: `/claim` page pending)*.

## Known risks and limitations

- **Host compromise** exposes live users' data (keys in memory, passwords at login).
- **Plaintext on disk**: `accounts.db` (usernames, display names, audit log with IPs, space names), **avatars**, and **fashion photos/garment images** (the latter are per-vault files but not encrypted; encrypting them is a follow-up).
- **No 2FA yet** (single sign-in factor); no passkeys.
- **No email-based reset**: losing both the password and the recovery key loses that user's data. A removed or deleted account's data is gone.
- **Backups of the data volume** include the plaintext registry; per-vault files are encrypted.
- **Throttling is in-app only**; consider fail2ban or an external WAF for public hosts. Per-IP limits need `APP_TRUST_PROXY=1` to see client IPs.
- **Edge body limit trusts `Content-Length`**; chunked bodies are bounded by Next/Caddy limits, not this check *(unverified)*.
- **Space re-key is deferred** when no remaining member is online (see above).
- Dependencies and build-time assets (MediaPipe models) are as trustworthy as upstream; run `pnpm audit` periodically.

## Dev/testing data isolation

`data/` holds real users' vaults (including `users/`, `spaces/`, `accounts.db`). Never unlock, read or write it for testing. Live runs use `APP_DATA_DIR=data-dev` (see `AGENTS.md`); automated tests use in-memory SQLite or a temp `APP_DATA_DIR`.

## Hardening checklist

| Item | Status |
|---|---|
| Per-user vaults, DEK wrapped by password and recovery key | Implemented |
| Account enumeration resistance (dummy unwrap, generic error) | Implemented |
| Persisted per-name, per-IP and global throttling | Implemented |
| KDF concurrency cap (2 running, 8 queued) and calibration | Implemented |
| Fail-closed `getDb()`, no `enterWith` | Implemented, tested |
| Session check on every page, action, route handler | `requireUser`/`withUser`/`define*Action`; `architecture.test.ts` (see roadmap for sweep status) |
| Session revocation (sign-out, devices, disable, idle, restart) | Implemented |
| Host and Origin allow-lists, body limits, HSTS, no-store, CSP | Implemented in `src/proxy.ts` |
| Space key sealing and re-key on member removal | Implemented |
| Safe first run (setup token) and legacy claim | Implemented in core; UI pending |
| Migration safety (encrypted backup, auto-restore) | Per vault, at sign-in |
| File permissions | `0700` dirs, `0600` files |
| 2FA / passkeys | Not implemented |
| Encrypt fashion images and avatars | Not implemented |
| Backup/disaster recovery | Manual: back up the whole data volume (see [../deploy.md](../deploy.md)) |
| Dependency scanning | `pnpm audit`, manual |
