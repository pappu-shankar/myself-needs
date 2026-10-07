/**
 * Public surface — the only thing other modules/app routes may import from
 * `finance`. NOTE: client components must import Server Actions from
 * `actions/**\/*.ts` directly, never through this barrel — see
 * docs/architecture/system-design.md.
 */
export {
  getAccounts,
  getAccount,
  getAccountTerms,
  getDebtTermsByAccount,
  getAccountBalanceMinorById,
  getAccountCurrency,
  /** Per-currency subtotals, and the base-currency aggregate that carries the
   * rate it used. `getTotalBalance` is gone: it added a dollar balance to a
   * rupee one, which is the bug the currency column exists to prevent. */
  getNetWorthByCurrency,
  getNetWorth,
  createAccount,
  /* Lifecycle: edit in place, archive rather than delete, and refuse a delete
   * that history references — see docs/prd/finance/provenance-lifecycle.md. */
  editAccount,
  archiveAccountById,
  unarchiveAccountById,
  deleteAccountById,
} from "./service/domain/accounts";
export {
  getCategories,
  getCategoriesByType,
  getCategory,
  createCategory,
  editCategory,
  archiveCategoryById,
  unarchiveCategoryById,
  deleteCategoryById,
} from "./service/domain/categories";
export {
  getTransactionsPage,
  getTransactionsCount,
  getHasAnyTransactions,
  getRecentTransactions,
  createTransaction,
  getTransaction,
  /** The void and its replacement together, read forward from the mistake to
   * the fix — the correction trail. */
  getTransactionCorrectionTrail,
  voidTransaction,
  correctTransaction,
} from "./service/domain/transactions";
export type {
  TransactionsCursor,
  TransactionsCursorPageParams,
  TransactionRow,
} from "./db/queries/domain/transactions";
export {
  getBudgetsForMonth,
  createBudget,
  getBudgetSpend,
  type BudgetForMonth,
} from "./service/domain/budgets";
export {
  getRecurringRules,
  getRecurringRule,
  getDueWorklist,
  createRecurringRule,
  editRecurringRule,
  /* Pause and archive are different: pausing stops future due periods on a rule
   * still expected to resume, archiving retires the arrangement entirely. */
  pauseRecurringRuleById,
  resumeRecurringRuleById,
  archiveRecurringRuleById,
  unarchiveRecurringRuleById,
  deleteRecurringRuleById,
} from "./service/domain/recurring";
export {
  getInsurancePolicies,
  getInsurancePolicy,
  createInsurancePolicy,
  editInsurancePolicy,
  archiveInsurancePolicyById,
  unarchiveInsurancePolicyById,
  deleteInsurancePolicyById,
} from "./service/domain/insurance";
export { getSchemeTemplates, createSchemeTemplate } from "./service/domain/scheme-templates";
export { getNetWorthTrend } from "./service/domain/net-worth";
export {
  /** The several net worths — "assets minus liabilities" is one sentence and
   * more than one number. See docs/prd/finance/net-worth.md. */
  getNetWorthByScope,
  NET_WORTH_SCOPES,
  type NetWorthScope,
  type NetWorthView,
  type NetWorthByScope,
  type NetWorthComponent,
} from "./service/domain/net-worth-scopes";
export {
  getGoals,
  getGoal,
  createGoal,
  editGoal,
  retireGoal,
  getGoalProgress,
  getFundingPlan,
  type GoalProgress,
  type FundingPlan,
} from "./service/domain/goals";
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
  getPortfolioXirrByCurrency,
  getHoldingCurrency,
  createHolding,
  createCashFlow,
  createValuation,
  getCashFlow,
  getCashFlowCorrectionTrail,
  voidCashFlow,
  correctCashFlow,
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

/** Money aggregate shape and the provenance vocabulary, for the UI layer. A
 * converted total is only auditable if the view can read the basis it carries. */
export type {
  MoneyAggregate,
  CurrencyContribution,
  ConfidenceShare,
} from "./service/utility/aggregate";
export type { ConfidenceLevel, ProvenanceSource, ProvenanceMethod } from "./db/schema/provenance";
export type { Currency } from "./db/schema/currency";
