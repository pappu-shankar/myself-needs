import "server-only";
import { randomBytes } from "node:crypto";
import { openVault } from "@/modules/core/db/client";
import { getSession, type RequestMeta } from "@/modules/core/session/session";
import { registerSession } from "@/modules/core/session/session-registry";
import { unsealSpaceKeys } from "@/modules/core/spaces/spaces-service";
import { recordLogin, type Account } from "./accounts-store";
import { recordAudit } from "./audit-store";
import { createSession, ipPrefix, isNewDevice, summarizeUserAgent } from "./sessions-store";

export type SignInVia = "password" | "recovery" | "invite" | "setup" | "claim";

export interface StartSessionOptions {
  via: SignInVia;
  recoveryKeyPending?: boolean;
}

/**
 * Turns a verified credential into a signed-in browser: opens the personal
 * vault, unseals the user's space keys, records the session (flagging a new
 * device), registers it in memory and writes the cookie. Only call from a
 * Server Action — it sets a cookie.
 */
export async function startSession(
  account: Account,
  dekHex: string,
  meta: RequestMeta,
  options: StartSessionOptions,
): Promise<{ sid: string; newDevice: boolean }> {
  openVault({ kind: "user", id: account.id }, dekHex);
  const spaceKeys = unsealSpaceKeys(account.id, dekHex);

  const uaSummary = meta.userAgent == null ? null : summarizeUserAgent(meta.userAgent);
  const prefix = meta.ip ? ipPrefix(meta.ip) : null;
  const newDevice = isNewDevice(account.id, uaSummary, prefix);

  const sid = randomBytes(32).toString("base64url");
  const now = Date.now();
  createSession({ sid, userId: account.id, ip: meta.ip, userAgent: meta.userAgent, now });
  registerSession({ sid, userId: account.id, personalDek: dekHex, spaceKeys, now });
  recordLogin(account.id, now);

  recordAudit({
    event: "login.succeeded",
    userId: account.id,
    ip: meta.ip,
    detail: { via: options.via, uaSummary, ipPrefix: prefix, newDevice },
    now,
  });
  if (newDevice) {
    recordAudit({
      event: "login.new_device",
      userId: account.id,
      ip: meta.ip,
      detail: { uaSummary, ipPrefix: prefix },
      now,
    });
  }

  const session = await getSession();
  session.uid = account.id;
  session.sid = sid;
  session.recoveryKeyPending = options.recoveryKeyPending ?? false;
  await session.save();
  return { sid, newDevice };
}
