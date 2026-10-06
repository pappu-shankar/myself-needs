"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { defineAction, defineFormAction } from "@/modules/core/action/define-action";
import { changePassword, rotateRecoveryKey, unlockWithPassword } from "@/modules/core/db/crypto";
import { getUserDir } from "@/modules/core/env/paths";
import { CredentialError, DomainError } from "@/modules/core/errors";
import { getSession } from "@/modules/core/session/session";
import { endSession, endUserSessions } from "@/modules/core/session/session-registry";
import { listSpacesBlockingDeletion } from "@/modules/core/spaces/spaces-service";
import { deleteAccountCompletely } from "./account-lifecycle";
import { findById, isLastActiveAdmin, updateProfile } from "./accounts-store";
import { dismissAlert, recordAudit } from "./audit-store";
import { deleteAvatar, parseAvatar, writeAvatar } from "./avatar";
import { checkPassword } from "./password-policy";
import { getSession as getSessionRecord } from "./sessions-store";
import { checkLogin, recordLoginFailure, recordLoginSuccess } from "./throttle";
import { throttledMessage } from "./auth-service";
import { normalizeUsername } from "./username";

/**
 * Signed-in account settings. All `readOnly` as far as the vault goes (they
 * touch the keyring/registry, not records), so they work while looking at a
 * space as a viewer.
 */

function me(userId: string) {
  const account = findById(userId);
  if (!account) throw new DomainError("Your account no longer exists.");
  return account;
}

/** Re-entering the password inside the app is throttled like a sign-in. */
async function verifyOwnPassword(userId: string, username: string, password: string) {
  const key = `reauth:${username}`;
  const throttle = checkLogin(key);
  if (!throttle.allowed) throw new DomainError(throttledMessage(throttle.retryAfterMs));
  try {
    const dek = await unlockWithPassword(getUserDir(userId), password);
    recordLoginSuccess(key);
    return dek;
  } catch (err) {
    if (err instanceof CredentialError) recordLoginFailure(key);
    throw err;
  }
}

const requiredPassword = (message: string) => z.string({ error: message }).min(1, message);

export const changePasswordAction = defineFormAction(
  z
    .object({
      currentPassword: requiredPassword("Enter your current password"),
      newPassword: requiredPassword("Enter a new password"),
      confirmNewPassword: requiredPassword("Confirm your new password"),
    })
    .refine((d) => d.newPassword === d.confirmNewPassword, {
      message: "The passwords don't match",
      path: ["confirmNewPassword"],
    }),
  async ({ currentPassword, newPassword }, scope) => {
    const account = me(scope.userId);
    const policy = checkPassword(newPassword, { username: account.username });
    if (!policy.ok) throw new DomainError(policy.message);
    await verifyOwnPassword(account.id, account.username, currentPassword);
    await changePassword(getUserDir(account.id), currentPassword, newPassword);
    endUserSessions(account.id, { exceptSid: scope.sessionId, reason: "password-changed" });
    recordAudit({ event: "password.changed", userId: account.id });
  },
  { name: "account:change-password", echoValues: false, revalidate: false, readOnly: true },
);

/** Returns the new recovery key exactly once; the old one stops working. */
export const rotateRecoveryKeyAction = defineFormAction(
  z.object({ password: requiredPassword("Enter your password") }),
  async ({ password }, scope) => {
    const account = me(scope.userId);
    await verifyOwnPassword(account.id, account.username, password);
    const recoveryKey = await rotateRecoveryKey(getUserDir(account.id), password);
    recordAudit({ event: "recovery.rotated", userId: account.id });
    return recoveryKey;
  },
  { name: "account:rotate-recovery-key", echoValues: false, revalidate: false, readOnly: true },
);

/**
 * Deletes the signed-in account and its vault. Refused for the last active
 * admin, and while the user is the only owner of a space other people are in
 * (they must make someone else an owner, or delete the space, first). Spaces
 * where they are the only member are deleted with the account.
 */
export const deleteMyAccountAction = defineFormAction(
  z.object({
    password: requiredPassword("Enter your password"),
    confirmUsername: requiredPassword("Type your username to confirm"),
  }),
  async ({ password, confirmUsername }, scope) => {
    const account = me(scope.userId);
    if (normalizeUsername(confirmUsername) !== account.username) {
      throw new DomainError("Type your username exactly to confirm.");
    }
    if (isLastActiveAdmin(account.id)) {
      throw new DomainError(
        "You're the only admin. Make someone else an admin before deleting your account.",
      );
    }
    const blocking = listSpacesBlockingDeletion(account.id);
    if (blocking.length > 0) {
      throw new DomainError(
        `You're the only owner of ${blocking.map((s) => `"${s.name}"`).join(", ")}. Make another member an owner, or delete ${blocking.length === 1 ? "that space" : "those spaces"}, first.`,
      );
    }
    await verifyOwnPassword(account.id, account.username, password);
    deleteAccountCompletely(account.id, account.id);
    const session = await getSession();
    session.destroy();
    redirect("/login");
  },
  { name: "account:delete", echoValues: false, revalidate: false, readOnly: true },
);

export const updateProfileAction = defineFormAction(
  z.object({
    displayName: z.string().max(200).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour in #rrggbb format")
      .optional(),
  }),
  ({ displayName, color }, scope) => {
    updateProfile(scope.userId, { displayName: displayName ?? null, color: color ?? null });
  },
  { name: "account:update-profile", readOnly: true },
);

/** `avatar`: base64 (or a data: URL) of a ≤256×256, ≤200 KB WebP/JPEG,
 * resized in the browser before upload. */
export const uploadAvatarAction = defineFormAction(
  z.object({
    avatar: z.string({ error: "Choose a picture" }).max(300_000, "Pictures can be at most 200 KB"),
  }),
  ({ avatar }, scope) => {
    const { format, bytes } = parseAvatar(avatar);
    writeAvatar(scope.userId, format, bytes);
    updateProfile(scope.userId, { hasAvatar: true });
  },
  { name: "account:upload-avatar", echoValues: false, readOnly: true },
);

export const removeAvatarAction = defineAction(
  z.object({}),
  (_input, scope) => {
    deleteAvatar(scope.userId);
    updateProfile(scope.userId, { hasAvatar: false });
  },
  { name: "account:remove-avatar", readOnly: true },
);

/** Signs out one of the user's own devices (or this one). */
export const signOutDeviceAction = defineFormAction(
  z.object({ sid: z.string().min(1).max(200) }),
  async ({ sid }, scope) => {
    const record = getSessionRecord(sid);
    if (!record || record.userId !== scope.userId) {
      throw new DomainError("That device isn't signed in to your account.");
    }
    endSession(sid, "device-revoked");
    recordAudit({ event: "session.revoked", userId: scope.userId, detail: { via: "device-list" } });
    if (sid === scope.sessionId) {
      const session = await getSession();
      session.destroy();
      redirect("/login");
    }
  },
  { name: "account:sign-out-device", readOnly: true },
);

/** Ends every one of the user's sessions except the one making the request. */
export const signOutOtherDevicesAction = defineAction(
  z.object({}),
  (_input, scope) => {
    const ended = endUserSessions(scope.userId, {
      exceptSid: scope.sessionId,
      reason: "device-revoked",
    });
    recordAudit({
      event: "session.revoked",
      userId: scope.userId,
      detail: { via: "sign-out-others", count: ended.length },
    });
    return { count: ended.length };
  },
  { name: "account:sign-out-other-devices", readOnly: true },
);

export const dismissAlertAction = defineAction(
  z.object({ alertId: z.string().min(1).max(200) }),
  ({ alertId }, scope) => {
    dismissAlert(scope.userId, alertId);
  },
  { name: "account:dismiss-alert", readOnly: true },
);
