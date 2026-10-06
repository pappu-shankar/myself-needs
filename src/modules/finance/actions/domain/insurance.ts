"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import { createInsurancePolicy } from "../../service/domain/insurance";
import { INSURANCE_TYPES, RECURRING_FREQUENCIES } from "../../types";
import { toMinor } from "@/lib/format";
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
