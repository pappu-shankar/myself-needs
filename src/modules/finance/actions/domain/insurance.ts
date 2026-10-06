"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import {
  archiveInsurancePolicyById,
  createInsurancePolicy,
  deleteInsurancePolicyById,
  editInsurancePolicy,
  getInsurancePolicy,
  unarchiveInsurancePolicyById,
} from "../../service/domain/insurance";
import { INSURANCE_TYPES, RECURRING_FREQUENCIES } from "../../types";
import { toMinor } from "@/lib/format";
import { zCheckbox, zId, zIsoDate, zOptionalText, zPositiveAmount, zText } from "@/lib/validation";
import { DomainError } from "@/modules/core/errors";
import { getBaseCurrency } from "../../db/queries/config/settings";

const insurancePolicySchema = z.object({
  type: z.enum(INSURANCE_TYPES),
  provider: z.string().min(1, "Provider is required"),
  name: z.string().min(1, "Name is required"),
  policyNumber: z.string().optional(),
  sumAssured: z.coerce.number().positive().optional(),
  premiumAmount: z.coerce.number().positive("Premium amount must be greater than 0"),
  premiumFrequency: z.enum(RECURRING_FREQUENCIES),
  startDate: z.string().min(1, "Start date is required"),
  renewalDate: z.string().optional(),
  notes: z.string().optional(),
  is80cEligible: z.coerce.boolean(),
  is80dEligible: z.coerce.boolean(),
  recurringRuleId: z.coerce.number().int().optional(),
});

export interface AddInsurancePolicyState {
  error?: string;
}

export const addInsurancePolicyAction = defineFormAction(
  async (
    _prevState: AddInsurancePolicyState,
    formData: FormData,
  ): Promise<AddInsurancePolicyState> => {
    const parsed = insurancePolicySchema.safeParse({
      type: formData.get("type"),
      provider: formData.get("provider"),
      name: formData.get("name"),
      policyNumber: formData.get("policyNumber") || undefined,
      sumAssured: formData.get("sumAssured") || undefined,
      premiumAmount: formData.get("premiumAmount"),
      premiumFrequency: formData.get("premiumFrequency"),
      startDate: formData.get("startDate"),
      renewalDate: formData.get("renewalDate") || undefined,
      notes: formData.get("notes") || undefined,
      is80cEligible: formData.get("is80cEligible") === "on",
      is80dEligible: formData.get("is80dEligible") === "on",
      recurringRuleId: formData.get("recurringRuleId") || undefined,
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid insurance policy" };
    }

    // No currency field on the policy form yet, so a policy is denominated in
    // what the vault reports in.
    const currency = getBaseCurrency();

    createInsurancePolicy({
      type: parsed.data.type,
      provider: parsed.data.provider,
      name: parsed.data.name,
      policyNumber: parsed.data.policyNumber ?? null,
      currency,
      sumAssuredMinor:
        parsed.data.sumAssured === undefined ? null : toMinor(parsed.data.sumAssured, currency),
      premiumAmountMinor: toMinor(parsed.data.premiumAmount, currency),
      premiumFrequency: parsed.data.premiumFrequency,
      startDate: parsed.data.startDate,
      renewalDate: parsed.data.renewalDate ?? null,
      notes: parsed.data.notes ?? null,
      is80cEligible: parsed.data.is80cEligible,
      is80dEligible: parsed.data.is80dEligible,
      recurringRuleId: parsed.data.recurringRuleId ?? null,
    });

    revalidatePath("/finance");
    revalidatePath("/finance/insurance");
    return {};
  },
);

/**
 * Edit / archive / delete.
 *
 * Only the fields the form actually changed are sent, and the service re-runs
 * the create-time validation on the merged row. Major-unit amounts convert with
 * the **policy's own** currency, read from the stored row rather than assumed —
 * the create path can default to the base currency because the row does not
 * exist yet, but an edit must not re-interpret an existing policy's amounts.
 */
const editInsurancePolicySchema = z.object({
  id: zId,
  type: z.enum(INSURANCE_TYPES).optional(),
  provider: zText("Provider").optional(),
  name: zText("Name").optional(),
  policyNumber: zOptionalText(100),
  sumAssured: zPositiveAmount.optional(),
  premiumAmount: zPositiveAmount.optional(),
  premiumFrequency: z.enum(RECURRING_FREQUENCIES).optional(),
  startDate: zIsoDate.optional(),
  renewalDate: zIsoDate.optional(),
  notes: zOptionalText(),
  is80cEligible: zCheckbox.optional(),
  is80dEligible: zCheckbox.optional(),
});

export const editInsurancePolicyAction = defineFormAction(
  editInsurancePolicySchema,
  (input) => {
    const policy = getInsurancePolicy(input.id);
    if (!policy) throw new DomainError("That insurance policy no longer exists.");
    const currency = policy.currency;

    editInsurancePolicy(input.id, {
      type: input.type,
      provider: input.provider,
      name: input.name,
      policyNumber: input.policyNumber,
      sumAssuredMinor:
        input.sumAssured === undefined ? undefined : toMinor(input.sumAssured, currency),
      premiumAmountMinor:
        input.premiumAmount === undefined ? undefined : toMinor(input.premiumAmount, currency),
      premiumFrequency: input.premiumFrequency,
      startDate: input.startDate,
      renewalDate: input.renewalDate,
      notes: input.notes,
      is80cEligible: input.is80cEligible,
      is80dEligible: input.is80dEligible,
    });
  },
  { name: "finance:edit-insurance-policy" },
);

export const archiveInsurancePolicyAction = defineFormAction(
  z.object({ id: zId }),
  (input) => {
    archiveInsurancePolicyById(input.id);
  },
  { name: "finance:archive-insurance-policy" },
);

export const unarchiveInsurancePolicyAction = defineFormAction(
  z.object({ id: zId }),
  (input) => {
    unarchiveInsurancePolicyById(input.id);
  },
  { name: "finance:unarchive-insurance-policy" },
);

/** Refused by the service once a premium has been logged under the policy. */
export const deleteInsurancePolicyAction = defineFormAction(
  z.object({ id: zId }),
  (input) => {
    deleteInsurancePolicyById(input.id);
  },
  { name: "finance:delete-insurance-policy" },
);
