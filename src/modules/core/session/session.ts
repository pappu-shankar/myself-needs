import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { getOrCreateSessionSecret } from "@/modules/core/db/crypto";

export interface SessionData {
  unlocked?: boolean;
  /** Must match the server's in-memory unlock epoch — see unlock-state.ts. */
  epoch?: string;
  /** True only between first-run vault creation (or a recovery-key rotation) and
   * the user acknowledging the new recovery key. */
  recoveryKeyPending?: boolean;
}

function sessionOptions(): SessionOptions {
  return {
    cookieName: "myself-needs-session",
    password: getOrCreateSessionSecret(),
    cookieOptions: {
      // Never sent off-device: the app only ever listens on 127.0.0.1 over HTTP.
      secure: false,
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      // A browser-session cookie (gone when the browser closes). It can't expire
      // server-side on its own, which is what the unlock epoch is for.
      maxAge: undefined,
    },
  };
}

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions());
}
