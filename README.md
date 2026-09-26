# Personal Life OS

A self-hosted, single-user app for tracking your finances, health, and plans in one place — encrypted at rest, running entirely on your own machine, with no account, no cloud sync, and no one but you able to see your data.

Built as a modular monolith on Next.js: **Finance** (accounts, transactions, budgets, debts, investments, tax, an insights engine), **Health** (vitals, symptoms, medications), **Plans** (financial and non-financial goals, prioritized), and a cross-module **Dashboard**. A **Mental** module exists as a minimal skeleton, left that way deliberately for now.

## Why

Most personal-finance and health-tracking tools ask you to hand your data to a company. This one doesn't have a company behind it — it's a single encrypted SQLite file on your disk, opened with a passphrase you choose, never sent anywhere. See [`PRIVACY.md`](./PRIVACY.md) for exactly what the app does and doesn't do over the network (short version: almost nothing).

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) — the app always starts at an unlock screen. On first run, you'll choose a passphrase and be shown a one-time **recovery key**; save it somewhere safe (a password manager, a printed backup) before continuing. There's no password-reset email, no support team to call — that recovery key is the only way back in if you forget your passphrase. See [`docs/architecture/security.md`](./docs/architecture/security.md) for the full encryption design.

## Documentation map

| Looking for... | Go to |
|---|---|
| What the app is meant to do | [`PRD.md`](./PRD.md) |
| How it's built (module boundaries, security, performance) | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| Build status / what's done | [`ROADMAP.md`](./ROADMAP.md) |
| Design system / visual language | [`DESIGN.md`](./DESIGN.md) |
| Agent/contributor guide | [`AGENTS.md`](./AGENTS.md) |
| Privacy — what data goes where | [`PRIVACY.md`](./PRIVACY.md) |
| How to contribute | [`CONTRIBUTING.md`](./CONTRIBUTING.md) |
| Reporting a security issue | [`SECURITY.md`](./SECURITY.md) |
| Community standards | [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) |

## Before committing

Pre-commit hooks (husky + lint-staged) run lint, typecheck, and affected tests automatically. To run everything by hand: `pnpm lint && pnpm exec tsc --noEmit && pnpm test`. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the full contributor guide.

## License

[AGPL-3.0](./LICENSE) — free to use, modify, and self-host. If you run a modified version as a service others connect to, the AGPL requires making your changes' source available to them.
