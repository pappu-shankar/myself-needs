import "server-only";
import { cookies, headers } from "next/headers";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { getOrCreateSessionSecret } from "@/modules/core/db/crypto";
import { getConfig } from "@/modules/core/env/config";

/**
 * The browser half of a session: an encrypted, signed cookie naming the user
 * and the server-side session id. It proves nothing on its own — the in-memory
 * session registry (session-registry.ts) must still hold that sid, so a restart,
 * sign-out or revocation invalidates the cookie immediately.
 */
export interface SessionData {
  uid?: string;
  sid?: string;
  /** True between account creation (or claim) and the user acknowledging the
   * recovery key shown to them once. */
  recoveryKeyPending?: boolean;
}

export const SECURE_COOKIE_NAME = "__Host-myself-needs-session";
export const PLAIN_COOKIE_NAME = "myself-needs-session";

/** `__Host-` requires `secure`, `path=/` and no domain — only usable over HTTPS. */
export function sessionCookieName(): string {
  return getConfig().secureCookies ? SECURE_COOKIE_NAME : PLAIN_COOKIE_NAME;
}

function sessionOptions(): SessionOptions {
  const secure = getConfig().secureCookies;
  return {
    cookieName: secure ? SECURE_COOKIE_NAME : PLAIN_COOKIE_NAME,
    password: getOrCreateSessionSecret(),
    cookieOptions: {
      secure,
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      // A browser-session cookie; the server enforces idle and absolute limits.
      maxAge: undefined,
    },
  };
}

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}

export interface RequestMeta {
  /** Client IP — only when the reverse proxy is trusted (X-Forwarded-For), else null. */
  ip: string | null;
  userAgent: string | null;
}

/** Who is asking, as far as we can tell. The IP is taken from forwarding headers
 * only when `APP_TRUST_PROXY` is set; otherwise it'd be spoofable. */
export async function getRequestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const userAgent = h.get("user-agent");
  if (!getConfig().trustProxy) return { ip: null, userAgent };
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip")?.trim() || null;
  return { ip: ip ? ip.slice(0, 64) : null, userAgent };
}
