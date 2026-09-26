import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { getOrCreateSessionSecret } from "@/modules/core/db/crypto";

export interface SessionData {
  unlocked: boolean;
  /** True only between first-run vault creation and the user acknowledging
   * their recovery key — holds off /unlock's own redirect-when-unlocked
   * guard so the reveal screen survives Next's post-action route refresh. */
  recoveryKeyPending?: boolean;
}

const sessionOptions: SessionOptions = {
  cookieName: "myself-needs-session",
  password: getOrCreateSessionSecret(),
  cookieOptions: {
    // Never sent off-device: the app never runs anywhere but 127.0.0.1.
    secure: false,
    sameSite: "strict",
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
