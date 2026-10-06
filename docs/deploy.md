# Deploying behind TLS

The app always listens on plain HTTP and trusts a reverse proxy to terminate TLS. Never publish the Node port directly.

## Why `next dev` must never be exposed

`next dev` ships dev-only endpoints, relaxed CSP (`unsafe-eval`), verbose errors and source maps, and does not honour the production hardening assumptions. Exposed deployments must run `next build` + `next start` (the Dockerfile does this).

## Option A: VPS with Docker Compose + Caddy

1. Point a DNS A/AAAA record (e.g. `life.example.com`) at the VPS; open ports 80, 443 (tcp) and 443 (udp).
2. `cp .env.example .env` and set at least `APP_DOMAIN` and `APP_PUBLIC_ORIGIN=https://<domain>`. Optionally set `APP_SETUP_TOKEN` (see below).
3. `docker compose up -d --build`. Caddy gets a certificate automatically; the app is reachable only on the private compose network.
4. Open `https://<domain>/setup`, enter the setup token, create the admin account.

**Build-time note:** `APP_PUBLIC_ORIGIN` is read at *build* time too (it feeds Next's Server Actions `allowedOrigins`). Compose passes it as a build arg; if you change the domain, rebuild: `docker compose up -d --build`.

### First-run setup token
A fresh install cannot be claimed by whoever arrives first. Either set `APP_SETUP_TOKEN` (16+ chars), or leave it empty and read the one-time token the app prints in its log: `docker compose logs app | grep -i setup`.

## Option B: Tailscale Serve / Funnel

Run the app on the host (`pnpm build && pnpm start`, loopback only) or via compose, then:

- Private to your tailnet: `tailscale serve --bg 3000`
- Public internet: `tailscale funnel --bg 3000`

Set `APP_PUBLIC_ORIGIN=https://<machine>.<tailnet>.ts.net` (before building), `APP_TRUST_PROXY=1`, and `APP_SECURE_COOKIES=1`. Skip Caddy in this setup.

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `APP_DOMAIN` | required (compose) | Domain Caddy serves and obtains a certificate for |
| `APP_PUBLIC_ORIGIN` | unset | Public origin, e.g. `https://life.example.com` (no path). Adds the host to the allow-list and to allowed Origins, enables HSTS and Secure cookies when https. Needed at build time |
| `APP_ALLOWED_HOSTS` | empty | Extra comma-separated hostnames for the Host header |
| `APP_TRUST_PROXY` | `0` (compose: `1`) | Trust `X-Forwarded-*` from the proxy. Only enable behind a proxy that overwrites them |
| `APP_SETUP_TOKEN` | unset | Token (16+ chars) required to claim a fresh install |
| `APP_IDLE_LOCK_MINUTES` | `30` | Idle lock timeout |
| `APP_SESSION_MAX_HOURS` | `12` | Absolute session lifetime |
| `APP_MAX_OPEN_VAULTS` | `50` | Open-vault LRU cap |
| `APP_PROFILE_PICKER` | `0` | Show profile picker on login |
| `APP_SECURE_COOKIES` | `0` | Force Secure cookies (implied by an https public origin) |
| `APP_DATA_DIR` | `data` (container `/app/data`) | Data directory |
| `GIT_SHA` | unset | Reported (truncated) by `/healthz` |

Invalid values stop the app at startup with an explanatory error.

## What the edge enforces

Host must be loopback or a configured host; non-GET/HEAD requests need an allowed `Origin` (loopback http or the public origin); bodies over 64 KB are refused on `/login`, `/login/recover`, `/invite`, `/setup`, `/claim`; HSTS over https; `Cache-Control: no-store` on dynamic responses; CSP with nonce. `/healthz` returns only `{ok, version}`.

## Backups

Everything lives in the `appdata` volume (`/app/data`): `accounts.db`, `users/`, `spaces/`, `avatars/`, `session-secret.bin`. Back up all of it together, e.g. with the app stopped (or SQLite-consistent snapshots):

```
docker compose stop app
docker run --rm -v <project>_appdata:/data -v "$PWD":/backup debian:stable-slim tar czf /backup/appdata-$(date +%F).tgz -C /data .
docker compose start app
```

Vaults are encrypted with per-user keys; a backup without users' passwords/recovery keys is unreadable by design. Losing `session-secret.bin` only signs everyone out. Test a restore occasionally.

## Upgrades

`git pull && docker compose up -d --build`. Vault migrations run per vault at sign-in. Take a backup first. Roll back by checking out the previous commit and rebuilding (migrations are forward-only, so restore the backup if the schema changed).

## Remaining risks

- A single host: the server process holds unlocked vault keys in memory while sessions are active; a host compromise exposes active users' data.
- No external rate-limiting or WAF; throttling is in-app only. Consider fail2ban or Cloudflare in front for public hosts.
- Certificate issuance and DNS are your responsibility; with `APP_TRUST_PROXY=1` any other path to the app container bypasses the proxy's header overwriting, so keep it off published ports.
- Dependencies (including MediaPipe assets fetched at build time from Google storage) are only as trustworthy as upstream; run `pnpm audit` periodically.
- Backups are unencrypted at the volume level beyond the per-vault encryption (accounts.db metadata and avatars are not secret-keyed per user).
