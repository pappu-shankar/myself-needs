"use server";

import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import type { ActionState } from "@/modules/core/action/types";
import { zId, zIsoDate, zPositiveAmount } from "@/lib/validation";
import { toMinor } from "@/lib/format";
import { createBudget } from "../../service/domain/budgets";
import { CURRENCIES } from "../../db/schema/currency";
import { getBaseCurrency } from "../../db/queries/config/settings";

export type AddBudgetState = ActionState;

/** Upsert by (categoryId, effectiveFrom) — see `createBudget`. */
export const addBudgetAction = defineFormAction(
  z.object({
    categoryId: zId,
    monthlyLimit: zPositiveAmount,
    currency: z.enum(CURRENCIES).optional(),
    effectiveFrom: zIsoDate,
  }),
  (input) => {
    // The limit is set in the budget's own currency, and spend in another
    // currency converts into it for comparison rather than the limit
    // converting out — see docs/prd/finance/budgets.md.
    const currency = input.currency ?? getBaseCurrency();
    createBudget({
      categoryId: input.categoryId,
      effectiveFrom: input.effectiveFrom,
      currency,
      monthlyLimitMinor: toMinor(input.monthlyLimit, currency),
    });
  },
  { name: "finance:add-budget" },
);
