# Security Policy

This app handles sensitive personal data (finance, health, mental health) for anyone who runs it, encrypted at rest behind a passphrase — see [`docs/architecture/security.md`](./docs/architecture/security.md) for the full design. If you find a way to break that model, please report it responsibly rather than filing a public issue.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting for this repository ("Security" tab → "Report a vulnerability") rather than opening a public issue or discussion. That keeps the details private until a fix is available, and gives you a private channel to include reproduction steps, affected versions, and any proof-of-concept.

This is a personal open-source project with no dedicated security team, so there's no SLA — but reports will be read and taken seriously, and credited (if you'd like) once a fix ships.

## What's in scope

Realistic, high-value reports:

- A way to read or derive `data/app.db`'s contents without the passphrase or recovery key (weaknesses in the DEK/KEK envelope encryption, the SQLCipher integration, or key derivation).
- A way to bypass the unlock/session flow (`src/modules/core/session/`) to reach protected routes without a valid passphrase.
- Injection vulnerabilities (SQL injection despite Drizzle's parameterization, XSS in rendered user input, command injection in the NAV-refresh network call).
- A way for the app to leak data over the network beyond the one documented call (mutual fund NAV lookup) — see [`PRIVACY.md`](./PRIVACY.md) for what's expected.

## What's out of scope

- **Physical access to an unlocked session or an already-decrypted device.** The threat model is explicitly local-only, single-machine — see [`docs/architecture/security.md`](./docs/architecture/security.md)'s threat model section. If someone has your unlocked laptop, that's outside what this app can protect against.
- **A forgotten passphrase *and* lost recovery key.** This is by design, not a bug — see the security doc's encryption-at-rest section for why there's deliberately no third way in.
- Vulnerabilities in dependencies that already have a public CVE and no available fix — report those upstream instead, though a note here is still welcome if it affects this app specifically.
