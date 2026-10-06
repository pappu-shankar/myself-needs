"use server";

import { z } from "zod";
import { defineFormAction } from "@/modules/core/action/define-action";
import { zId, zNumber, zPercent } from "@/lib/validation";
import {
  addTaxSlab,
  editTaxSlab,
  removeTaxSlab,
  setTaxSettings,
  startFiscalYear,
} from "../../service/config/tax";

const zFiscalYear = z
  .string({ error: "Pick a financial year" })
  .regex(/^\d{4}-\d{2}$/, "Pick a financial year like 2025-26");
const zRegime = z.enum(["old", "new"], { error: "Pick a regime" });
const zRupees = zNumber.refine((n) => n >= 0, "Can't be negative");
const zMonths = zNumber.refine((n) => Number.isInteger(n) && n >= 0, "Enter whole months");
/** Blank = no upper limit (the open-ended top bracket). */
const zUpto = zNumber
  .refine((n) => n > 0, "Upper limit must be more than zero")
  .optional()
  .transform((n) => n ?? null);

export const updateTaxSettingsAction = defineFormAction(
  z.object({
    fiscalYear: zFiscalYear,
    eightyCLimit: zRupees,
    eightyDLimit: zRupees,
    equityLtcgThresholdMonths: zMonths,
    equityLtcgExemption: zRupees,
    equityLtcgRate: zPercent,
    equityStcgRate: zPercent,
    otherLtcgThresholdMonths: zMonths,
    otherLtcgRate: zPercent,
    otherStcgRate: zPercent,
    standardDeductionOld: zRupees,
    standardDeductionNew: zRupees,
    cessPercent: zPercent,
    rebate87aThresholdOld: zRupees,
    rebate87aThresholdNew: zRupees,
  }),
  ({ fiscalYear, ...patch }) => {
    setTaxSettings(fiscalYear, patch);
  },
  { name: "finance:tax-settings" },
);

/** Creates an FY by copying the most recent FY's settings and slabs. */
export const startFiscalYearAction = defineFormAction(
  z.object({ fiscalYear: zFiscalYear }),
  ({ fiscalYear }) => {
    startFiscalYear(fiscalYear);
    return { fiscalYear };
  },
  { name: "finance:tax-start-fy" },
);

export const addTaxSlabAction = defineFormAction(
  z.object({
    fiscalYear: zFiscalYear,
    regime: zRegime,
    uptoAmount: zUpto,
    ratePercent: zPercent,
  }),
  ({ fiscalYear, regime, uptoAmount, ratePercent }) => {
    addTaxSlab(fiscalYear, regime, uptoAmount, ratePercent);
  },
  { name: "finance:tax-slab-add" },
);

export const updateTaxSlabAction = defineFormAction(
  z.object({ id: zId, uptoAmount: zUpto, ratePercent: zPercent }),
  ({ id, uptoAmount, ratePercent }) => {
    editTaxSlab(id, uptoAmount, ratePercent);
  },
  { name: "finance:tax-slab-update" },
);

export const deleteTaxSlabAction = defineFormAction(
  z.object({ id: zId }),
  ({ id }) => {
    removeTaxSlab(id);
  },
  { name: "finance:tax-slab-delete" },
);
