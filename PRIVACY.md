# Privacy

This is a self-hosted, single-user application. There is no backend, no account system, and no company operating a service on your behalf — you run this on your own machine, and your data stays there. This document describes what the app itself does and doesn't do with your data; it is not a Terms of Service, because no service is being provided by anyone but you, to yourself.

## What's stored, and where

Everything you enter — finance, health, mental, and plans data — is written to a single encrypted SQLite database file on your own filesystem (`data/app.db` by default). It's encrypted at rest via SQLCipher, unlockable only with your passphrase or your recovery key. See [`docs/architecture/security.md`](./docs/architecture/security.md) for the full technical detail.

No one else — not the maintainers of this project, not a hosting provider, not anyone — can read this file. There is no server it syncs to, no cloud backup, no account to recover through a third party. If you lose both your passphrase and your recovery key, or the database file itself, the data is gone; nobody can help you get it back. That's the tradeoff of an architecture with no central party who could.

## Network calls this app makes

The app binds to `127.0.0.1` only — it is never reachable from other devices on your network, let alone the internet.

The only outbound network request it ever makes is a manual mutual-fund NAV lookup (via `mfapi.in` / AMFI's public data), triggered only when you click "Refresh NAV" on a specific holding. That request sends only a public AMFI scheme code — never anything else about you or your data. No telemetry, no analytics, no crash reporting, no update-checking, no calls of any other kind, to anyone.

## If you run this for someone else

The app has no multi-user support — it's built for one person, one machine, one passphrase. If you set this up on a device someone else will use, they get full access to everything in that install; there's no separation between "you" and "them." Running one shared install for multiple people isn't something this app is designed to do safely.

## If you fork or modify this project

You're free to change anything (see [`LICENSE`](./LICENSE) — AGPL-3.0). If you modify this code and run it as a hosted service others connect to over a network, the AGPL requires you to make your modified source available to those users. That's a license obligation on you as the operator, not something this document imposes — but it's worth knowing before turning a personal tool into someone else's service, since that changes the privacy picture described above entirely (network exposure, a party other than the user holding the data, etc.) and this document no longer describes that setup.
