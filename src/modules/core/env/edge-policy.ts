import type { AppConfig } from "./config";

/** Pure request-guard decisions used by src/proxy.ts, kept separate so they are unit-testable. */

export const MAX_AUTH_BODY_BYTES = 64 * 1024;

const SMALL_BODY_PATHS = new Set(["/login", "/login/recover", "/invite", "/setup", "/claim"]);

export function hostnameOf(hostHeader: string): string {
  return hostHeader.toLowerCase().replace(/:\d+$/, "");
}

/**
 * DNS-rebinding defence: a malicious page can re-point its own hostname at this
 * server, but the request still carries the attacker's name in `Host`.
 */
export function isHostAllowed(hostHeader: string | null, config: AppConfig): boolean {
  return config.allowedHosts.has(hostnameOf(hostHeader ?? ""));
}

const LOOPBACK_ORIGIN_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Allowed origins: loopback over http (any port) plus the configured public origin. */
export function isOriginAllowed(origin: string | null, config: AppConfig): boolean {
  if (!origin) return false;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false; // includes the literal "null" origin
  }
  if (url.origin !== origin) return false;
  if (config.publicOrigin && url.origin === config.publicOrigin.origin) return true;
  return url.protocol === "http:" && LOOPBACK_ORIGIN_HOSTS.has(url.hostname);
}

export function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

export function isOversizedAuthBody(
  method: string,
  pathname: string,
  contentLength: string | null,
): boolean {
  if (method !== "POST") return false;
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  if (!SMALL_BODY_PATHS.has(path)) return false;
  if (contentLength === null) return false;
  const n = Number(contentLength);
  return !Number.isFinite(n) || n > MAX_AUTH_BODY_BYTES;
}

export type EdgeDecision = { ok: true } | { ok: false; status: number; message: string };

export function decideRequest(
  req: {
    method: string;
    pathname: string;
    host: string | null;
    origin: string | null;
    contentLength: string | null;
  },
  config: AppConfig,
): EdgeDecision {
  if (!isHostAllowed(req.host, config)) {
    return { ok: false, status: 403, message: "Host not allowed." };
  }
  if (!isSafeMethod(req.method) && !isOriginAllowed(req.origin, config)) {
    return { ok: false, status: 403, message: "Cross-origin request refused." };
  }
  if (isOversizedAuthBody(req.method, req.pathname, req.contentLength)) {
    return { ok: false, status: 413, message: "Request body too large." };
  }
  return { ok: true };
}

export const HSTS_VALUE = "max-age=63072000; includeSubDomains";

export function wantsHsts(config: AppConfig): boolean {
  return config.publicOrigin?.protocol === "https:";
}
