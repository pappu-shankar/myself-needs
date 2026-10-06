import { getAccounts } from "../accounts";
import { getHoldingsWithValue } from "../investments";
import { getBudgetsForMonth } from "../budgets";
import { getEmergencyFundMonths } from "../reports";
import { getInsurancePolicies } from "../insurance";
import { getDueWorklist } from "../recurring";
import {
  get80cUtilization,
  get80dUtilization,
  getCapitalGainsEstimate,
  getRegimeComparison,
} from "../tax";
import { getTaxSettingsForYear } from "../../config/tax";
import { currentFiscalYear } from "../../utility/fiscal-year";
import {
  findDuplicateTransactionGroups,
  countUncategorizedTransactions,
} from "../../../db/queries/domain/insights";
import { getInsightsSettings } from "../../../db/queries/config/insights-settings";
import { todayIso } from "@/lib/dates";

/**
 * Everything every rule function needs, gathered once per engine run —
 * intra-module composition (all these live inside `finance`), not a
 * cross-module import. See docs/prd/finance/insights.md.
 */
export function getFinanceSnapshot() {
  // Every tax figure below is for the same FY, with that FY's settings.
  const fy = currentFiscalYear();
  return {
    today: todayIso(),
    accounts: getAccounts(),
    holdings: getHoldingsWithValue(),
    budgets: getBudgetsForMonth(),
    emergencyFundMonths: getEmergencyFundMonths(),
    insurancePolicies: getInsurancePolicies(),
    dueWorklist: getDueWorklist(),
    eightyC: get80cUtilization(fy),
    eightyD: get80dUtilization(fy),
    regime: getRegimeComparison(fy),
    capitalGains: getCapitalGainsEstimate(fy),
    taxSettings: getTaxSettingsForYear(fy.label),
    fy,
    duplicateGroups: findDuplicateTransactionGroups(),
    uncategorizedCount: countUncategorizedTransactions(),
    settings: getInsightsSettings(),
  };
}

export type FinanceSnapshot = ReturnType<typeof getFinanceSnapshot>;
