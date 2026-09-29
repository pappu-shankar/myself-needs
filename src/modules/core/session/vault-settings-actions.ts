"use server";

import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import { changePassphrase, rotateRecoveryKey } from "@/modules/core/db/crypto";

const PASSPHRASE_MIN = "Passphrase must be at least 8 characters";

/** Returns the new recovery key exactly once; the old one stops working. */
export const rotateRecoveryKeyAction = defineFormAction(
  z.object({
    passphrase: z.string({ error: "Enter your passphrase" }).min(1, "Enter your passphrase"),
  }),
  ({ passphrase }) => rotateRecoveryKey(passphrase),
  { name: "vault:rotate-recovery-key", echoValues: false, revalidate: false },
);

export const changePassphraseAction = defineFormAction(
  z
    .object({
      currentPassphrase: z.string({ error: "Enter your current passphrase" }),
      newPassphrase: z.string({ error: PASSPHRASE_MIN }).min(8, PASSPHRASE_MIN),
      confirmNewPassphrase: z.string({ error: "Confirm your new passphrase" }),
    })
    .refine((data) => data.newPassphrase === data.confirmNewPassphrase, {
      message: "Passphrases do not match",
      path: ["confirmNewPassphrase"],
    }),
  ({ currentPassphrase, newPassphrase }) => changePassphrase(currentPassphrase, newPassphrase),
  { name: "vault:change-passphrase", echoValues: false, revalidate: false },
);
