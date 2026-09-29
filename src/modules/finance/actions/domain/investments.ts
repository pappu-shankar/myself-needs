"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUnlocked } from "@/modules/core/session/guard";
import {
  createCashFlow,
  createHolding,
  createValuation,
  refreshMutualFundNav,
} from "../../service/domain/investments";
import { INVESTMENT_TYPES, CASH_FLOW_TYPES } from "../../types";

const holdingSchema = z.object({
  type: z.enum(INVESTMENT_TYPES),
  name: z.string().min(1, "Name is required"),
  accountId: z.coerce.number().int().optional(),
  units: z.coerce.number().positive().optional(),
  interestRate: z.coerce.number().optional(),
  maturityDate: z.string().optional(),
  schemeTemplateId: z.coerce.number().int().optional(),
  externalCode: z.string().optional(),
  notes: z.string().optional(),
  is80cEligible: z.coerce.boolean(),
  linkedGoalId: z.coerce.number().int().optional(),
});

export interface AddHoldingState {
  error?: string;
}

export async function addHoldingAction(
  _prevState: AddHoldingState,
  formData: FormData,
): Promise<AddHoldingState> {
  await requireUnlocked();
  const parsed = holdingSchema.safeParse({
    type: formData.get("type"),
    name: formData.get("name"),
    accountId: formData.get("accountId") || undefined,
    units: formData.get("units") || undefined,
    interestRate: formData.get("interestRate") || undefined,
    maturityDate: formData.get("maturityDate") || undefined,
    schemeTemplateId: formData.get("schemeTemplateId") || undefined,
    externalCode: formData.get("externalCode") || undefined,
    notes: formData.get("notes") || undefined,
    is80cEligible: formData.get("is80cEligible") === "on",
    linkedGoalId: formData.get("linkedGoalId") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid holding" };
  }

  createHolding({
    type: parsed.data.type,
    name: parsed.data.name,
    accountId: parsed.data.accountId ?? null,
    units: parsed.data.units ?? null,
    interestRate: parsed.data.interestRate ?? null,
    maturityDate: parsed.data.maturityDate ?? null,
    schemeTemplateId:
      parsed.data.type === "govt_scheme" ? (parsed.data.schemeTemplateId ?? null) : null,
    externalCode:
      parsed.data.type === "mutual_fund_domestic" ? (parsed.data.externalCode ?? null) : null,
    notes: parsed.data.notes ?? null,
    is80cEligible: parsed.data.is80cEligible,
    linkedGoalId: parsed.data.linkedGoalId ?? null,
  });

  revalidatePath("/finance/investments/holdings");
  revalidatePath("/finance/investments");
  return {};
}

const cashFlowSchema = z.object({
  holdingId: z.coerce.number().int(),
  date: z.string().min(1, "Date is required"),
  amount: z.coerce.number().refine((v) => v !== 0, "Amount can't be zero"),
  flowType: z.enum(CASH_FLOW_TYPES),
});

export interface AddCashFlowState {
  error?: string;
}

export async function addCashFlowAction(
  _prevState: AddCashFlowState,
  formData: FormData,
): Promise<AddCashFlowState> {
  await requireUnlocked();
  const parsed = cashFlowSchema.safeParse({
    holdingId: formData.get("holdingId"),
    date: formData.get("date"),
    amount: formData.get("amount"),
    flowType: formData.get("flowType"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid cash flow" };
  }

  createCashFlow(parsed.data);

  revalidatePath("/finance/investments/holdings");
  revalidatePath("/finance/investments");
  return {};
}

const valuationSchema = z.object({
  holdingId: z.coerce.number().int(),
  date: z.string().min(1, "Date is required"),
  pricePerUnit: z.coerce.number().positive("Price must be greater than 0"),
});

export interface AddValuationState {
  error?: string;
}

export async function addValuationAction(
  _prevState: AddValuationState,
  formData: FormData,
): Promise<AddValuationState> {
  await requireUnlocked();
  const parsed = valuationSchema.safeParse({
    holdingId: formData.get("holdingId"),
    date: formData.get("date"),
    pricePerUnit: formData.get("pricePerUnit"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid valuation" };
  }

  createValuation(parsed.data);

  revalidatePath("/finance/investments/holdings");
  revalidatePath("/finance/investments");
  return {};
}

export interface RefreshNavState {
  error?: string;
}

export async function refreshNavAction(
  _prevState: RefreshNavState,
  formData: FormData,
): Promise<RefreshNavState> {
  await requireUnlocked();
  const holdingId = Number(formData.get("holdingId"));
  if (!Number.isInteger(holdingId)) {
    return { error: "Invalid holding" };
  }

  try {
    await refreshMutualFundNav(holdingId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "NAV refresh failed" };
  }

  revalidatePath("/finance/investments/holdings");
  revalidatePath("/finance/investments");
  return {};
}
