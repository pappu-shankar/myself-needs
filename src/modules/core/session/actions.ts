"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { closeDatabase, databaseFileExists, openDatabase } from "@/modules/core/db/client";
import {
  createVault,
  rewrapForNewPassphrase,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
} from "@/modules/core/db/crypto";
import { getSession } from "@/modules/core/session/session";

const unlockSchema = z.object({
  passphrase: z.string().min(8, "Passphrase must be at least 8 characters"),
});

export interface UnlockState {
  error?: string;
  recoveryKeyReveal?: string;
}

export async function unlockAction(
  _prevState: UnlockState,
  formData: FormData,
): Promise<UnlockState> {
  const parsed = unlockSchema.safeParse({ passphrase: formData.get("passphrase") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid passphrase" };
  }

  const isFirstRun = !databaseFileExists();
  if (isFirstRun) {
    const confirmPassphrase = formData.get("confirmPassphrase");
    if (parsed.data.passphrase !== confirmPassphrase) {
      return { error: "Passphrases do not match" };
    }

    const { recoveryKey, dekHex } = createVault(parsed.data.passphrase);
    openDatabase(dekHex);

    const session = await getSession();
    session.unlocked = true;
    session.recoveryKeyPending = true;
    await session.save();

    return { recoveryKeyReveal: recoveryKey };
  }

  try {
    const dekHex = unlockWithPassphrase(parsed.data.passphrase);
    openDatabase(dekHex);
  } catch {
    return { error: "Incorrect passphrase" };
  }

  const session = await getSession();
  session.unlocked = true;
  await session.save();

  redirect("/dashboard");
}

/** Clears the reveal-pending flag and completes the first-run unlock. */
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
  const parsed = recoveryKeySchema.safeParse({ recoveryKey: formData.get("recoveryKey") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid recovery key" };
  }

  try {
    unlockWithRecoveryKey(parsed.data.recoveryKey);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Incorrect recovery key" };
  }

  return { verified: true };
}

const resetPassphraseSchema = z
  .object({
    recoveryKey: z.string().min(1),
    newPassphrase: z.string().min(8, "Passphrase must be at least 8 characters"),
    confirmNewPassphrase: z.string(),
  })
  .refine((data) => data.newPassphrase === data.confirmNewPassphrase, {
    message: "Passphrases do not match",
    path: ["confirmNewPassphrase"],
  });

export interface ResetPassphraseState {
  error?: string;
}

export async function resetPassphraseAfterRecoveryAction(
  _prevState: ResetPassphraseState,
  formData: FormData,
): Promise<ResetPassphraseState> {
  const parsed = resetPassphraseSchema.safeParse({
    recoveryKey: formData.get("recoveryKey"),
    newPassphrase: formData.get("newPassphrase"),
    confirmNewPassphrase: formData.get("confirmNewPassphrase"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let dekHex: string;
  try {
    dekHex = unlockWithRecoveryKey(parsed.data.recoveryKey);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Incorrect recovery key" };
  }

  rewrapForNewPassphrase(dekHex, parsed.data.newPassphrase);
  openDatabase(dekHex);

  const session = await getSession();
  session.unlocked = true;
  await session.save();

  redirect("/dashboard");
}

/** Closes the encrypted database and clears the session — requires the full
 * passphrase to be re-entered, matching "ask every time" from the security model. */
export async function lockAction(): Promise<void> {
  const session = await getSession();
  session.destroy();
  closeDatabase();
  redirect("/unlock");
}
