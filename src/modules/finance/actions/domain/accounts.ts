"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import { toMinor } from "@/lib/format";
import { zCheckbox, zId } from "@/lib/validation";
import { DomainError } from "@/modules/core/errors";
import {
  archiveAccountById,
  createAccount,
  deleteAccountById,
  editAccount,
  getAccount,
  unarchiveAccountById,
} from "../../service/domain/accounts";
import { toRateBps } from "../../service/utility/units";
import { ACCOUNT_TYPES } from "../../types";
import { CURRENCIES } from "../../db/schema/currency";
import { getBaseCurrency } from "../../db/queries/config/settings";

/**
 * The form collects what people type: major-unit amounts (₹1,234.56) and
 * percentages (8.65). Converting to minor units and basis points happens here,
 * at the boundary, and nothing downstream sees a float. The account's own
 * currency picks the exponent, so this stays correct for a currency that is not
 * 2-decimal.
 */
const accountSchema = z.object({
  name: z.string().min(1, "Name is required"),
  type: z.enum(ACCOUNT_TYPES),
  currency: z.enum(CURRENCIES).optional(),
  openingBalance: z.coerce.number().default(0),
  creditLimit: z.coerce.number().optional(),
  interestRate: z.coerce.number().optional(),
  originalAmount: z.coerce.number().optional(),
  emiAmount: z.coerce.number().optional(),
  tenureMonths: z.coerce.number().int().optional(),
  /** Only meaningful for `receivable` — see account-form.tsx. */
  includeInNetWorth: z.coerce.boolean(),
});

export interface AddAccountState {
  error?: string;
}

export const addAccountAction = defineFormAction(
  async (_prevState: AddAccountState, formData: FormData): Promise<AddAccountState> => {
    const parsed = accountSchema.safeParse({
      name: formData.get("name"),
      type: formData.get("type"),
      currency: formData.get("currency") || undefined,
      openingBalance: formData.get("openingBalance") || 0,
      creditLimit: formData.get("creditLimit") || undefined,
      interestRate: formData.get("interestRate") || undefined,
      originalAmount: formData.get("originalAmount") || undefined,
      emiAmount: formData.get("emiAmount") || undefined,
      tenureMonths: formData.get("tenureMonths") || undefined,
      includeInNetWorth: formData.get("includeInNetWorth") === "on",
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid account" };
    }

    const input = parsed.data;
    // No currency on the form yet: a new account defaults to what the vault
    // reports in, which is the only choice that cannot surprise anyone.
    const currency = input.currency ?? getBaseCurrency();
    const minor = (major: number | undefined) =>
      major === undefined ? undefined : toMinor(major, currency);

    // The five per-type fields no longer live on the account row — they moved
    // to the terms satellites in migration 0028.
    const loanTerms =
      input.type === "loan"
        ? {
            originalAmountMinor: minor(input.originalAmount) ?? null,
            emiMinor: minor(input.emiAmount) ?? null,
            tenureMonths: input.tenureMonths ?? null,
            rateBps: input.interestRate === undefined ? null : toRateBps(input.interestRate),
          }
        : undefined;
    const creditTerms =
      input.type === "credit_card" || input.type === "revolving_credit"
        ? {
            creditLimitMinor: minor(input.creditLimit) ?? null,
            aprBps: input.interestRate === undefined ? null : toRateBps(input.interestRate),
          }
        : undefined;

    createAccount({
      name: input.name,
      type: input.type,
      currency,
      openingBalanceMinor: toMinor(input.openingBalance, currency),
      excludeFromNetWorth: input.type === "receivable" && !input.includeInNetWorth,
      loanTerms,
      creditTerms,
    });

    revalidatePath("/finance");
    revalidatePath("/finance/accounts");
    revalidatePath("/dashboard");
    return {};
  },
);

/**
 * Edit / archive / delete.
 *
 * Every field is optional: the form only sends what it changed, and the service
 * re-applies the create-time validation to the merged row. Amounts arrive in
 * major units and are converted with the account's *own* currency — read from
 * the account rather than assumed, so a non-2-decimal currency does not become
 * a silent factor-of-100 error. On a currency change the new currency is the
 * right exponent for the new opening balance, and the service refuses the
 * change outright once the account has any transaction.
 */
const editAccountSchema = z.object({
  id: zId,
  name: z.string().min(1, "Name is required").optional(),
  type: z.enum(ACCOUNT_TYPES).optional(),
  currency: z.enum(CURRENCIES).optional(),
  openingBalance: z.coerce.number().optional(),
  creditLimit: z.coerce.number().optional(),
  interestRate: z.coerce.number().optional(),
  originalAmount: z.coerce.number().optional(),
  emiAmount: z.coerce.number().optional(),
  tenureMonths: z.coerce.number().int().optional(),
  includeInNetWorth: zCheckbox.optional(),
});

export const editAccountAction = defineFormAction(
  editAccountSchema,
  (input) => {
    const account = getAccount(input.id);
    if (!account) throw new DomainError("That account no longer exists.");

    const type = input.type ?? account.type;
    const currency = input.currency ?? account.currency;
    const minor = (major: number | undefined) =>
      major === undefined ? undefined : toMinor(major, currency);

    const hasLoanFields =
      input.originalAmount !== undefined ||
      input.emiAmount !== undefined ||
      input.tenureMonths !== undefined ||
      input.interestRate !== undefined;
    const hasCreditFields = input.creditLimit !== undefined || input.interestRate !== undefined;

    editAccount(input.id, {
      name: input.name,
      type: input.type,
      currency: input.currency,
      openingBalanceMinor: minor(input.openingBalance),
      excludeFromNetWorth:
        input.includeInNetWorth === undefined
          ? undefined
          : type === "receivable" && !input.includeInNetWorth,
      loanTerms:
        type === "loan" && hasLoanFields
          ? {
              originalAmountMinor: minor(input.originalAmount) ?? null,
              emiMinor: minor(input.emiAmount) ?? null,
              tenureMonths: input.tenureMonths ?? null,
              rateBps: input.interestRate === undefined ? null : toRateBps(input.interestRate),
            }
          : undefined,
      creditTerms:
        (type === "credit_card" || type === "revolving_credit") && hasCreditFields
          ? {
              creditLimitMinor: minor(input.creditLimit) ?? null,
              aprBps: input.interestRate === undefined ? null : toRateBps(input.interestRate),
            }
          : undefined,
    });
  },
  { name: "finance:edit-account" },
);

export const archiveAccountAction = defineFormAction(
  z.object({ id: zId }),
  (input) => {
    archiveAccountById(input.id);
  },
  { name: "finance:archive-account" },
);

export const unarchiveAccountAction = defineFormAction(
  z.object({ id: zId }),
  (input) => {
    unarchiveAccountById(input.id);
  },
  { name: "finance:unarchive-account" },
);

/** Refused by the service when history references the account; the resulting
 * DomainError message is what the form shows, and it names archiving as the
 * answer. */
export const deleteAccountAction = defineFormAction(
  z.object({ id: zId }),
  (input) => {
    deleteAccountById(input.id);
  },
  { name: "finance:delete-account" },
);
