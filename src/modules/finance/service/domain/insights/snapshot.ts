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
  getCurrentFinancialYear,
  getRegimeComparison,
} from "../tax";
import { getTaxSettingsView } from "../../config/tax";
import {
  findDuplicateTransactionGroups,
  countUncategorizedTransactions,
} from "../../../db/queries/domain/insights";
import { getInsightsSettings } from "../../../db/queries/config/insights-settings";

/**
 * Everything every rule function needs, gathered once per engine run —
 * intra-module composition (all these live inside `finance`), not a
 * cross-module import. See docs/prd/finance/insights.md.
 */
export function getFinanceSnapshot() {
  return {
    today: new Date().toISOString().slice(0, 10),
    accounts: getAccounts(),
    holdings: getHoldingsWithValue(),
    budgets: getBudgetsForMonth(),
    emergencyFundMonths: getEmergencyFundMonths(),
    insurancePolicies: getInsurancePolicies(),
    dueWorklist: getDueWorklist(),
    eightyC: get80cUtilization(),
    eightyD: get80dUtilization(),
    regime: getRegimeComparison(),
    capitalGains: getCapitalGainsEstimate(),
    taxSettings: getTaxSettingsView(),
    fy: getCurrentFinancialYear(),
    duplicateGroups: findDuplicateTransactionGroups(),
    uncategorizedCount: countUncategorizedTransactions(),
    settings: getInsightsSettings(),
  };
}

export type FinanceSnapshot = ReturnType<typeof getFinanceSnapshot>;
