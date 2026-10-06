/**
 * Public surface — the only thing other modules/app routes may import from
 * `finance`. NOTE: client components must import Server Actions from
 * `actions/**\/*.ts` directly, never through this barrel — see
 * docs/architecture/system-design.md.
 */
export {
  getAccounts,
  getAccount,
  getAccountBalanceById,
  getTotalBalance,
  createAccount,
} from "./service/domain/accounts";
export { getCategories, getCategoriesByType, createCategory } from "./service/domain/categories";
export {
  getTransactionsPage,
  getHasAnyTransactions,
  getRecentTransactions,
  createTransaction,
} from "./service/domain/transactions";
export type {
  TransactionsCursor,
  TransactionsCursorPageParams,
  TransactionRow,
} from "./db/queries/domain/transactions";
export { getBudgetsForMonth, createBudget } from "./service/domain/budgets";
export { getRecurringRules, getDueWorklist, createRecurringRule } from "./service/domain/recurring";
export { getInsurancePolicies, createInsurancePolicy } from "./service/domain/insurance";
export { getSchemeTemplates, createSchemeTemplate } from "./service/domain/scheme-templates";
export { getNetWorthTrend } from "./service/domain/net-worth";
export { getIncomeExpenseReport, getEmergencyFundMonths } from "./service/domain/reports";
export { getCurrentAllocation, getAllocationReport } from "./service/domain/allocation";
export { getFinanceSettings } from "./service/config/allocation";
export {
  get80cUtilization,
  get80dUtilization,
  getCapitalGainsEstimate,
  getRegimeComparison,
  listTaxFiscalYears,
  type CapitalGainsEstimate,
  type RegimeComparison,
} from "./service/domain/tax";
export { getTaxPolicyView, listTaxPolicyYears } from "./service/config/tax";
export {
  currentFiscalYear,
  fiscalYearOf,
  parseFiscalYearLabel,
  shiftFiscalYear,
  type FiscalYear,
} from "./service/utility/fiscal-year";
export { getInsights } from "./service/domain/insights/engine";
export { getInsightsSettingsView } from "./service/config/insights-settings";
export { searchFinance } from "./service/domain/search";
export type { Insight, InsightCategory, InsightSeverity } from "./service/domain/insights/types";
export {
  getHoldingsWithValue,
  getHoldingsByGoalId,
  getHolding,
  getCashFlowsForHolding,
  getValuationsForHolding,
  getPortfolioXirr,
  createHolding,
  createCashFlow,
  createValuation,
} from "./service/domain/investments";
export { addAccountAction, type AddAccountState } from "./actions/domain/accounts";
export { addCategoryAction, type AddCategoryState } from "./actions/domain/categories";
export { addTransactionAction, type AddTransactionState } from "./actions/domain/transactions";
export { addBudgetAction, type AddBudgetState } from "./actions/domain/budgets";
export {
  addRecurringRuleAction,
  type AddRecurringRuleState,
  confirmRecurringAction,
  type ConfirmRecurringState,
} from "./actions/domain/recurring";
export { addInsurancePolicyAction, type AddInsurancePolicyState } from "./actions/domain/insurance";
export {
  addSchemeTemplateAction,
  type AddSchemeTemplateState,
} from "./actions/domain/scheme-templates";
export {
  addHoldingAction,
  type AddHoldingState,
  addCashFlowAction,
  type AddCashFlowState,
  addValuationAction,
  type AddValuationState,
  refreshNavAction,
  type RefreshNavState,
} from "./actions/domain/investments";
export {
  setDateOfBirthAction,
  type SetDateOfBirthState,
  setAllocationTargetAction,
  type SetAllocationTargetState,
  dismissGettingStartedAction,
} from "./actions/config/allocation";
export {
  updateTaxSettingsAction,
  startFiscalYearAction,
  addTaxSlabAction,
  updateTaxSlabAction,
  deleteTaxSlabAction,
} from "./actions/config/tax";
export { dismissInsightAction, type DismissInsightState } from "./actions/domain/insights";
export {
  updateInsightsSettingsAction,
  type UpdateInsightsSettingsState,
} from "./actions/config/insights";
export * from "./types";
