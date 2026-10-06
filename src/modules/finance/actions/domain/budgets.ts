"use server";

import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import type { ActionState } from "@/modules/core/action/types";
import { zId, zIsoDate, zPositiveAmount } from "@/lib/validation";
import { createBudget } from "../../service/domain/budgets";

export type AddBudgetState = ActionState;

/** Upsert by (categoryId, effectiveFrom) — see `createBudget`. */
export const addBudgetAction = defineFormAction(
  z.object({
    categoryId: zId,
    monthlyLimit: zPositiveAmount,
    effectiveFrom: zIsoDate,
  }),
  (input) => {
    createBudget(input);
  },
  { name: "finance:add-budget" },
);
