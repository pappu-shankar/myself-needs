"use server";

/**
 * The only Server Actions that run WITHOUT an unlocked vault — they are how the
 * vault gets unlocked. Everything else goes through `defineFormAction`.
 */

import { redirect } from "next/navigation";
import { z } from "zod";
import { isDatabaseOpen, openDatabase } from "@/modules/core/db/client";
import {
  createVault,
  getVaultStatus,
  rewrapForNewPassphrase,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
} from "@/modules/core/db/crypto";
import { CredentialError, DatabaseOpenError, VaultStateError } from "@/modules/core/errors";
import { logAudit, logError } from "@/modules/core/log";
import { getSession } from "@/modules/core/session/session";
import { beginUnlockedSession, endUnlockedSession } from "@/modules/core/session/unlock-state";
import {
  checkUnlockAllowed,
  recordUnlockFailure,
  recordUnlockSuccess,
} from "@/modules/core/session/unlock-throttle";

const PASSPHRASE_MIN = "Passphrase must be at least 8 characters";

const MISSING_FILE_MESSAGES = {
  "missing-database":
    "Your vault's database (app.db) is missing, but its keyring is still here. Restore app.db from a backup — nothing has been changed.",
  "missing-keyring":
    "Your vault's keyring (keyring.json) is missing, so the database can't be decrypted. Restore keyring.json from a backup — nothing has been changed.",
} as const;

function unlockFailureMessage(err: unknown, scope: string): string {
  if (
    err instanceof CredentialError ||
    err instanceof VaultStateError ||
    err instanceof DatabaseOpenError
  ) {
    if (err instanceof DatabaseOpenError) logError(scope, err);
    return err.message;
  }
  logError(scope, err);
  return "Couldn't unlock your vault. Please try again.";
}

async function startSession(options: { reuseLiveEpoch: boolean; recoveryKeyPending?: boolean }) {
  const session = await getSession();
  session.unlocked = true;
  session.epoch = beginUnlockedSession(options.reuseLiveEpoch);
  session.recoveryKeyPending = options.recoveryKeyPending ?? false;
  await session.save();
}

/** Opens the database unless this process already has it open (another tab). */
function ensureOpen(dekHex: string): boolean {
  const wasOpen = isDatabaseOpen();
  if (!wasOpen) openDatabase(dekHex);
  return wasOpen;
}

const unlockSchema = z.object({
  passphrase: z.string().min(8, PASSPHRASE_MIN),
  confirmPassphrase: z.string().optional(),
});

export interface UnlockState {
  error?: string;
  recoveryKeyReveal?: string;
}

export async function unlockAction(
  _prevState: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  const parsed = unlockSchema.safeParse({
    passphrase: formData.get("passphrase"),
    confirmPassphrase: formData.get("confirmPassphrase") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid passphrase" };
  }
  const { passphrase, confirmPassphrase } = parsed.data;

  const throttle = checkUnlockAllowed();
  if (!throttle.allowed) {
    logAudit("vault.unlock.throttled");
    return { error: "Too many unlock attempts. Please wait and try again." };
  }

  const status = getVaultStatus();
  if (status === "missing-database" || status === "missing-keyring") {
    return { error: MISSING_FILE_MESSAGES[status] };
  }

  if (status === "uninitialized") {
    if (passphrase !== confirmPassphrase) {
      return { error: "Passphrases do not match" };
    }
    try {
      const { recoveryKey, dekHex } = await createVault(passphrase);
      openDatabase(dekHex);
      await startSession({ reuseLiveEpoch: false, recoveryKeyPending: true });
      recordUnlockSuccess();
      logAudit("vault.created");
      return { recoveryKeyReveal: recoveryKey };
    } catch (err) {
      recordUnlockFailure();
      return { error: unlockFailureMessage(err, "vault:create") };
    }
  }

  try {
    const dekHex = await unlockWithPassphrase(passphrase);
    const wasOpen = ensureOpen(dekHex);
    await startSession({ reuseLiveEpoch: wasOpen });
    recordUnlockSuccess();
    logAudit("vault.unlocked");
  } catch (err) {
    recordUnlockFailure();
    logAudit("vault.unlock.failed");
    return { error: unlockFailureMessage(err, "vault:unlock") };
  }
  redirect("/dashboard");
}

/** Clears the reveal-pending flag once the user has saved their recovery key. */
export async function acknowledgeRecoveryKeyAction(): Promise<void> {
  const session = await getSession();
  session.recoveryKeyPending = false;
  await session.save();
  redirect("/dashboard");
}

const recoveryKeySchema = z.object({
  recoveryKey: z.string().min(1, "Enter your recovery key"),
});

export interface UnlockWithRecoveryKeyState {
  error?: string;
  verified?: boolean;
}

/** Verifies the recovery key only — never opens the database or touches the
 * session. Success hands control to `resetPassphraseAfterRecoveryAction`,
 * which re-verifies and does the actual unlock. */
export async function unlockWithRecoveryKeyAction(
  _prevState: UnlockWithRecoveryKeyState,
  formData: FormData,
): Promise<UnlockWithRecoveryKeyState> {
  const throttle = checkUnlockAllowed();
  if (!throttle.allowed) {
    logAudit("vault.unlock.throttled");
    return { error: "Too many unlock attempts. Please wait and try again." };
  }
  const parsed = recoveryKeySchema.safeParse({ recoveryKey: formData.get("recoveryKey") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid recovery key" };
  }
  const status = getVaultStatus();
  if (status !== "ready") {
    return {
      error:
        status === "uninitialized"
          ? "There's no vault to recover yet."
          : MISSING_FILE_MESSAGES[status],
    };
  }
  try {
    await unlockWithRecoveryKey(parsed.data.recoveryKey);
    recordUnlockSuccess();
    logAudit("vault.recovery.verified");
  } catch (err) {
    recordUnlockFailure();
    logAudit("vault.recovery.failed");
    return { error: unlockFailureMessage(err, "vault:recovery-verify") };
  }
  return { verified: true };
}

const resetPassphraseSchema = z
  .object({
    recoveryKey: z.string().min(1),
    newPassphrase: z.string().min(8, PASSPHRASE_MIN),
    confirmNewPassphrase: z.string(),
  })
  .refine((data) => data.newPassphrase === data.confirmNewPassphrase, {
    message: "Passphrases do not match",
    path: ["confirmNewPassphrase"],
  });

export interface ResetPassphraseState {
  error?: string;
}

/** Opens the database BEFORE re-wrapping the passphrase slot, so a vault that
 * can't be opened never ends up with a changed keyring. */
export async function resetPassphraseAfterRecoveryAction(
  _prevState: ResetPassphraseState,
  formData: FormData,
): Promise<ResetPassphraseState> {
  const throttle = checkUnlockAllowed();
  if (!throttle.allowed) {
    logAudit("vault.unlock.throttled");
    return { error: "Too many unlock attempts. Please wait and try again." };
  }
  const parsed = resetPassphraseSchema.safeParse({
    recoveryKey: formData.get("recoveryKey"),
    newPassphrase: formData.get("newPassphrase"),
    confirmNewPassphrase: formData.get("confirmNewPassphrase"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    const dekHex = await unlockWithRecoveryKey(parsed.data.recoveryKey);
    const wasOpen = ensureOpen(dekHex);
    await rewrapForNewPassphrase(dekHex, parsed.data.newPassphrase);
    await startSession({ reuseLiveEpoch: wasOpen });
    recordUnlockSuccess();
    logAudit("vault.recovery.reset");
  } catch (err) {
    recordUnlockFailure();
    logAudit("vault.recovery.reset.failed");
    return { error: unlockFailureMessage(err, "vault:recovery-reset") };
  }
  redirect("/dashboard");
}

/** Closes the encrypted database and revokes every session cookie (not just this
 * browser's) by discarding the unlock epoch. */
export async function lockAction(): Promise<void> {
  const session = await getSession();
  session.destroy();
  endUnlockedSession();
  logAudit("vault.locked");
  redirect("/unlock");
}
