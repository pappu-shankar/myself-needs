/**
 * Deployment configuration, parsed once from environment variables.
 *
 * Bad values throw a clear startup error rather than silently falling back —
 * a typo in APP_PUBLIC_ORIGIN must not leave the app quietly un-hardened.
 */

export interface AppConfig {
  /** Public URL the app is served at behind a TLS proxy; null when loopback-only. */
  publicOrigin: URL | null;
  /** Lower-case hostnames (no port) accepted in the Host header. */
  allowedHosts: ReadonlySet<string>;
  /** Trust X-Forwarded-For / X-Forwarded-Host from the reverse proxy. */
  trustProxy: boolean;
  /** Required to claim a fresh install; null means a one-time token is printed to the log. */
  setupToken: string | null;
  idleLockMinutes: number;
  sessionMaxHours: number;
  maxOpenVaults: number;
  profilePicker: boolean;
  secureCookies: boolean;
}

const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "[::1]"];

type Env = Record<string, string | undefined>;

function fail(name: string, problem: string): never {
  throw new Error(`Invalid configuration: ${name} ${problem}.`);
}

function parseBool(env: Env, name: string, fallback: boolean): boolean {
  const raw = env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fail(name, `must be 1/0 or true/false (got "${env[name]}")`);
}

function parseInt_(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) return fail(name, `must be a whole number (got "${raw}")`);
  const n = Number(raw);
  if (n < min || n > max) return fail(name, `must be between ${min} and ${max} (got ${n})`);
  return n;
}

function parsePublicOrigin(raw: string | undefined): URL | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(
      "APP_PUBLIC_ORIGIN",
      `must be an absolute URL such as https://life.example.com (got "${value}")`,
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return fail("APP_PUBLIC_ORIGIN", "must use http: or https:");
  }
  if (url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    return fail("APP_PUBLIC_ORIGIN", "must be an origin only (no path, query or credentials)");
  }
  return url;
}

export function parseConfig(env: Env): AppConfig {
  const publicOrigin = parsePublicOrigin(env.APP_PUBLIC_ORIGIN);

  const allowedHosts = new Set(LOOPBACK_HOSTS);
  if (publicOrigin) allowedHosts.add(publicOrigin.hostname.toLowerCase());
  for (const entry of (env.APP_ALLOWED_HOSTS ?? "").split(",")) {
    const host = entry.trim().toLowerCase();
    if (!host) continue;
    if (!/^[a-z0-9.-]+$|^\[[0-9a-f:]+\]$/.test(host)) {
      fail(
        "APP_ALLOWED_HOSTS",
        `contains an invalid hostname "${entry.trim()}" (hostnames only, no port or scheme)`,
      );
    }
    allowedHosts.add(host);
  }

  const setupToken = env.APP_SETUP_TOKEN?.trim() || null;
  if (setupToken !== null && setupToken.length < 16) {
    fail("APP_SETUP_TOKEN", "must be at least 16 characters");
  }

  return {
    publicOrigin,
    allowedHosts,
    trustProxy: parseBool(env, "APP_TRUST_PROXY", false),
    setupToken,
    idleLockMinutes: parseInt_(env, "APP_IDLE_LOCK_MINUTES", 30, 1, 1440),
    sessionMaxHours: parseInt_(env, "APP_SESSION_MAX_HOURS", 12, 1, 720),
    maxOpenVaults: parseInt_(env, "APP_MAX_OPEN_VAULTS", 50, 1, 1000),
    profilePicker: parseBool(env, "APP_PROFILE_PICKER", false),
    secureCookies:
      publicOrigin?.protocol === "https:" || parseBool(env, "APP_SECURE_COOKIES", false),
  };
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  cached ??= parseConfig(process.env);
  return cached;
}

/** Test hook: drop the cached config so the next getConfig() re-reads the environment. */
export function resetConfigForTests(): void {
  cached = null;
}
