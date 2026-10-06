# Personal Life OS

A self-hosted, multi-user app for tracking finances, health, plans and more in one place. Each person has their own account and their own encrypted vault, people can share spaces (for example household finance), and an admin invites users and manages accounts without being able to read anyone's data. Run it on your own machine, or put it on a server behind HTTPS.

Built as a modular monolith on Next.js: **Finance** (accounts, transactions, budgets, debts, investments, tax, an insights engine), **Health** (vitals, symptoms, medications), **Plans** (financial and non-financial goals, prioritized), and a cross-module **Dashboard**. A **Mental** module exists as a minimal skeleton, left that way deliberately for now.

## Why

Most personal-finance and health-tracking tools ask you to hand your data to a company. This one doesn't have a company behind it. Your data is an encrypted SQLite file on a disk you control, unlocked by your own password, and never sent anywhere. See [`PRIVACY.md`](./PRIVACY.md) for what the app does over the network (almost nothing).

"Private" means encrypted at rest and hidden from the in-app admin. It does **not** mean hidden from whoever controls the server: see the threat model in [`docs/architecture/security.md`](./docs/architecture/security.md).

## Getting started (local)

```bash
pnpm install
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). On a fresh install you create the admin account with a one-time setup token (set `APP_SETUP_TOKEN`, or read the token the app prints in its log), choose a password (12+ characters) and are shown a one-time **recovery key**. Save it in a password manager. There is no email reset: if you lose both your password and your recovery key, your data cannot be recovered. The admin then invites other people from the admin area; each invitee creates their own password and recovery key.

For live testing, never use your real `data/` directory: `APP_DATA_DIR=data-dev pnpm dev`.

## Running it on the internet

Use `next build` + `next start` behind a TLS reverse proxy. The repo ships a `Dockerfile`, `docker-compose.yml` and a Caddy config for automatic HTTPS: see [`docs/deploy.md`](./docs/deploy.md). Main settings (all optional for local use):

| Variable | Purpose |
|---|---|
| `APP_DOMAIN` | Domain Caddy gets a certificate for (compose) |
| `APP_PUBLIC_ORIGIN` | Public URL, e.g. `https://life.example.com`; allows that host/origin, enables HSTS and Secure cookies. Also read at build time |
| `APP_ALLOWED_HOSTS` | Extra allowed `Host` names |
| `APP_TRUST_PROXY` | Trust `X-Forwarded-*` (only behind a proxy that overwrites them) |
| `APP_SETUP_TOKEN` | Token to claim a fresh install |
| `APP_IDLE_LOCK_MINUTES`, `APP_SESSION_MAX_HOURS`, `APP_MAX_OPEN_VAULTS` | Idle lock, absolute session length, open-vault cap |
| `APP_PROFILE_PICKER`, `APP_SECURE_COOKIES`, `APP_DATA_DIR` | Login profile cards, force Secure cookies, data directory |

Full table and defaults: [`docs/deploy.md`](./docs/deploy.md#environment-variables).

## Upgrading from the single-vault version

Earlier versions had one vault (`data/app.db` + `data/keyring.json`) unlocked by one passphrase. Nothing is lost on upgrade:

1. **Back up `data/` first** (copy the whole folder).
2. Start the new version. With no accounts yet and a legacy vault present, the app offers **`/claim`**.
3. Enter a username and your **old passphrase**. Your files are *moved* (never deleted) into `data/users/<id>/` and become the admin account's personal vault. Your old recovery key keeps working. If the process is interrupted, it finishes on the next request.
4. You can then change your password in Settings and invite others.

Each vault is migrated to the latest schema when its owner next signs in (an encrypted backup is taken first). The `/claim` page itself may still be landing; see [`docs/roadmap/phase-8-multi-user.md`](./docs/roadmap/phase-8-multi-user.md).

## Documentation map

| Looking for... | Go to |
|---|---|
| What the app is meant to do | [`PRD.md`](./PRD.md) |
| How it's built (module boundaries, security, performance) | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| Build status / what's done | [`ROADMAP.md`](./ROADMAP.md) |
| Design system / visual language | [`DESIGN.md`](./DESIGN.md) |
| Agent/contributor guide | [`AGENTS.md`](./AGENTS.md) |
| Deploying (Docker, Caddy, env vars, backups) | [`docs/deploy.md`](./docs/deploy.md) |
| Security model and known risks | [`docs/architecture/security.md`](./docs/architecture/security.md) |
| Privacy — what data goes where | [`PRIVACY.md`](./PRIVACY.md) |
| How to contribute | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |
| Reporting a security issue | [`SECURITY.md`](./SECURITY.md) |
| Community standards | [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) |

## Before committing

Pre-commit hooks (husky + lint-staged) run lint, typecheck, and affected tests automatically. To run everything by hand: `pnpm lint && pnpm exec tsc --noEmit && pnpm test`. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full contributor guide.

## License

[AGPL-3.0](./LICENSE) — free to use, modify, and self-host. If you run a modified version as a service others connect to, the AGPL requires making your changes' source available to them.
