# Phase 8 — Multi-user (per-user vaults, shared spaces, internet-ready)

**Related:** [../../ROADMAP.md](../../ROADMAP.md) · [../architecture/security.md](../architecture/security.md) · [../architecture/multi-user-contracts.md](../architecture/multi-user-contracts.md) · [../deploy.md](../deploy.md)

The app changed from one encrypted vault behind one passphrase, loopback only, to a multi-user service that can be exposed to the internet: username + password sign-in, admin-invited accounts, per-user encrypted vaults, shared spaces, devices and a security log, and a Docker/Caddy deploy. The existing vault becomes the admin's account (legacy claim).

Status below was read from the code at the time of writing; the page layer was still landing (`src/app` had `admin/` and the redirecting `unlock` page, but no `login`, `invite`, `setup` or `claim` routes yet, and about 60 files still used the deprecated `requireUnlocked` alias).

| # | Task | Status |
|---|---|---|
| 0 | Pin the contracts (`RequestScope`, path helpers, crypto signatures with a vault-dir parameter, registry API) | Done ([multi-user-contracts.md](../architecture/multi-user-contracts.md)) |
| 1 | Core DB: vault pool, request scope (ALS + React `cache()`), fail-closed `getDb()`, test harness (`setTestDefaultDatabase`) | Done |
| 2 | Crypto: per-dir keyrings, KDF calibration, KDF semaphore, dummy unwrap, identity keys, seal/unseal | Done |
| 3 | Account registry: accounts, invites, sessions, audit, spaces, throttle; password and username policy | Done |
| 4 | Edge: config parsing, host/origin allow-lists, body limits, HSTS, no-store (`proxy.ts`, `edge-policy.ts`) | Done |
| 5 | Sessions and guards: in-memory registry, `requireUser`/`requireAdmin`/`withUser`, idle lock, absolute max age, device revocation | Done |
| 6 | Auth service and actions: login, recovery, invite, first-admin setup, legacy claim | Core done; auth pages (`/login`, `/login/recover`, `/invite`, `/setup`, `/claim`) not yet present |
| 7 | Shared spaces: service, actions, roles, module picker, re-key on removal | Core done; spaces UI not verified |
| 8 | Admin area (`/admin`, users, invites, health) and `GET /healthz` | Admin pages present *(unverified)*; `/healthz` done |
| 9 | Settings: change password, rotate recovery key, devices, security log, sign out everywhere, delete account, profile/avatar | Account actions present; settings pages still the single-vault forms |
| 10 | Mechanical sweep: `requireUnlocked` to `requireUser`, `withUser` in route handlers and `search-action.ts`, `generateMetadata` guard, per-vault fashion paths | In progress |
| 11 | Docker, Compose, Caddy, `.env.example`, deploy doc | Done (`Dockerfile`, `docker-compose.yml`, `deploy/Caddyfile`); not exercised end to end here |
| 12 | Docs (this pass) | Done |
| 13 | Live check against `data-dev`: claim, invite second user, spaces, device sign-out, restart, header curl checks, `docker compose up` locally | Not run |
| 14 | `pnpm verify` | Not run (was blocked by unrelated uncommitted finance type errors) |

## Notable decisions

- **A database per user and per space instead of a shared database with `user_id`.** No schema change to ~54 tables, the admin never holds another user's key, existing services keep calling `getDb()`, and deleting a user is deleting a folder.
- **No password hashes.** A password is correct when it unwraps the user's DEK. Unknown usernames run a dummy unwrap of equal cost, so timing and messages don't reveal which accounts exist.
- **Plaintext registry** (`accounts.db`) because it is needed before anyone authenticates. It holds usernames, roles, audit and sealed space keys, never secrets.
- **Space keys are sealed to each member's X25519 public key** (ECDH + HKDF + AES-GCM), so members can be added offline and the server/admin never learn them. Removing a member re-keys the space; if no holder is online it is deferred to the next open.
- **Two scope carriers**: `AsyncLocalStorage.run` for actions/route handlers; a React `cache()` box, filled by `requireUser()`, for renders. `enterWith` is banned and `getDb()` throws without a scope.
- **Eviction is not idle.** The vault pool (LRU, `APP_MAX_OPEN_VAULTS`) can close a vault without signing anyone out; only a personal-vault idle timeout ends sessions. Keys live in memory only, so a restart signs everyone out.
- **KDF cost is calibrated** (~250 ms) and stored per keyring; legacy keyrings keep `N=2^17`. At most 2 derivations run and 8 queue to bound memory.
- **The app always speaks HTTP and trusts a TLS proxy**; `APP_TRUST_PROXY` is off unless a proxy overwrites `X-Forwarded-*`.
- **Legacy claim never deletes files** and is restartable at every step via the `data/.claim.json` marker.
- **Migrations run per vault at sign-in**, each preceded by an encrypted backup.
- **Accepted and documented risks**: host operators can read live data; no 2FA; plaintext avatars, fashion images and registry metadata; no email reset.
