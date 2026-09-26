export const ACCOUNT_TYPES = [
  "checking",
  "savings",
  "cash",
  "credit_card",
  "loan",
  "investment",
  "receivable",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const TRANSACTION_TYPES = ["income", "expense", "transfer"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const CATEGORY_TYPES = ["income", "expense"] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export const RECURRING_FREQUENCIES = [
  "weekly",
  "monthly",
  "quarterly",
  "half_yearly",
  "yearly",
] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const INSURANCE_TYPES = ["life", "health", "term", "vehicle", "other"] as const;
export type InsuranceType = (typeof INSURANCE_TYPES)[number];

export const INVESTMENT_TYPES = [
  "equity",
  "intl_equity",
  "mutual_fund_domestic",
  "mutual_fund_intl",
  "bond",
  "gold",
  "fd",
  "rd",
  "chit_fund",
  "govt_scheme",
  "other_asset",
] as const;
export type InvestmentType = (typeof INVESTMENT_TYPES)[number];

/** Types valued as units × latest price (see investment_valuations). */
export const UNIT_PRICED_TYPES = new Set<InvestmentType>([
  "equity",
  "intl_equity",
  "mutual_fund_domestic",
  "mutual_fund_intl",
  "bond",
  "gold",
  "other_asset",
]);

/** Types valued via a compounded accrual estimate from interest_rate. */
export const ACCRUAL_TYPES = new Set<InvestmentType>(["fd", "rd"]);

export const CASH_FLOW_TYPES = [
  "contribution",
  "redemption",
  "dividend",
  "interest",
  "maturity",
] as const;
export type CashFlowType = (typeof CASH_FLOW_TYPES)[number];
