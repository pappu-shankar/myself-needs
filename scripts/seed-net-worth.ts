/**
 * One-time personal data load — run manually, then delete this file.
 *
 *   pnpm exec tsx --import ./scripts/lib/server-only-shim.mjs scripts/seed-net-worth.ts --user <uuid>
 *
 * `--user` is the account's id (its directory under <APP_DATA_DIR>/users/);
 * prompts for that user's password, unlocks only their personal vault and
 * runs inside its request scope (scripts/lib/vault-cli.ts). The shim stands in
 * for `server-only`, which plain Node can't resolve. Add APP_DATA_DIR=data-dev
 * to run against the dev data directory.
 *
 * Inserts everything below via the same service-layer functions the app's own
 * forms use (createAccount/createHolding/createCashFlow/createValuation) —
 * no raw SQL, all the normal validation/sign-convention logic applies.
 *
 * FINAL — ready to run.
 */
import { todayIso } from "@/lib/dates";
import {
  createAccount,
  createHolding,
  createCashFlow,
  createValuation,
  createInsurancePolicy,
  getAccounts,
  getHoldingsWithValue,
} from "@/modules/finance";
import { promptPlain, withUserVault } from "./lib/vault-cli";

const TODAY = todayIso();
const GOLD_PRICE_PER_GRAM = 13500;
const SILVER_PRICE_PER_GRAM = 250;

/** "DD/MM/YY" -> "YYYY-MM-DD" */
function parseDMY(s: string): string {
  const [d, m, y] = s.split("/");
  return `20${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

type StockRow = [symbol: string, category: string, qty: number, avgPrice: number, currentValue: number];

const UPSTOX_STOCKS: StockRow[] = [
  ["CIPLA", "Pharmaceuticals", 1, 1354.4, 1354.4],
  ["DIVISLAB", "Pharmaceuticals", 2, 3024.0, 6048.0],
  ["DRREDDY", "Pharmaceuticals", 56, 1198.52, 67117.12],
  ["EXIDEIND", "Batteries", 7, 134.54, 941.78],
  ["FINCABLES", "Cable", 4, 821.0, 3284.0],
  ["GAIL", "Gases & Fuels", 10, 84.8, 848.0],
  ["GOLDBEES", "ETF", 200, 48.99, 9798.0],
  ["HCLTECH", "IT-Software", 9, 1129.39, 10164.51],
  ["HDBFS", "NBFC", 68, 740.0, 50320.0],
  ["HDFCBANK", "Bank", 22, 743.67, 16360.74],
  ["HEROMOTOCO", "Automobile", 1, 5305.0, 5305.0],
  ["HINDALCO", "Metal", 10, 365.0, 3650.0],
  ["ICICIPRULI", "Life Insurance", 4, 595.0, 2380.0],
  ["IDEA", "Telecommunication", 258, 7.78, 2007.24],
  ["IDFCFIRSTB", "Bank", 315, 60.42, 19032.3],
  ["INDUSINDBK", "Bank", 32, 929.72, 29751.04],
  ["INFY", "IT-Software", 8, 1450.25, 11602.0],
  ["IOC", "Refineries", 7, 66.3, 464.1],
  ["ITC", "FMCG", 233, 278.22, 64825.26],
  ["ITCHOTELS", "Hotels", 35, 265.88, 9305.8],
  ["JYOTHYLAB", "FMCG", 75, 308.57, 23142.75],
  ["KALYANKJIL", "Jewellery", 5, 382.08, 1910.4],
  ["KTKBANK", "Bank", 180, 197.97, 35634.6],
  ["MANAPPURAM", "NBFC", 188, 175.37, 32969.56],
  ["MHRIL", "Hotels", 18, 298.0, 5364.0],
  ["MUTHOOTFIN", "NBFC", 1, 959.0, 959.0],
  ["NATCOPHARM", "Pharmaceuticals", 75, 807.34, 60550.5],
  ["NEWGEN", "IT-Software", 2, 177.0, 354.0],
  ["NMDC", "Minerals", 60, 14.59, 875.4],
  ["NSLNISP", "Steel & Iron", 20, 58.72, 1174.4],
  ["PETRONET", "Energy", 15, 265.0, 3975.0],
  ["SBIN", "Bank", 13, 290.1, 3771.3],
  ["SOUTHBANK", "Bank", 205, 29.9, 6129.5],
  ["SPANDANA", "NBFC", 26, 264.0, 6864.0],
  ["SUNPHARMA", "Pharmaceuticals", 2, 968.5, 1937.0],
  ["TATACAP", "NBFC", 244, 326.0, 79544.0],
  ["TATACHEM", "Chemicals", 4, 1102.0, 4408.0],
  ["TATASTEEL", "Steel & Iron", 50, 95.96, 4798.0],
  ["TATATECH", "IT-Services", 6, 1193.33, 7159.98],
  ["TCS", "IT-Software", 9, 2764.29, 24878.61],
  ["TECHM", "IT-Software", 1, 945.0, 945.0],
  ["TITAN", "Jewellery", 3, 2454.67, 7364.01],
  ["TMB", "Bank", 82, 437.29, 35857.78],
  ["TMCV", "Automobile", 116, 270.51, 31379.16],
  ["TMPV", "Automobile", 130, 569.6, 74048.0],
  ["WIPRO", "IT-Software", 39, 208.15, 8117.85],
  ["ZYDUSLIFE", "Pharmaceuticals", 13, 884.5, 11498.5],
  ["SHARDACROP", "Chemicals", 4, 819, 3276.0],
];

const AIONION_SELF_STOCKS: StockRow[] = [
  ["FINCABLES", "Cable", 3, 828.48, 2485.44],
  ["FIVESTAR", "NBFC", 5, 425.12, 2125.6],
  ["GOLDBEES", "ETF", 15, 79.82, 1197.3],
  ["ITC", "FMCG", 25, 370.26, 9256.5],
  ["JYOTHYLAB", "FMCG", 2, 281.5, 563.0],
  ["KTKBANK", "Bank", 3, 197.07, 591.21],
  ["MHRIL", "Hotels", 3, 319.81, 959.43],
  ["PETRONET", "Energy", 3, 272.96, 818.88],
  ["SOUTHBANK", "Bank", 12, 25.63, 307.56],
  ["TCS", "IT-Software", 3, 2143.67, 6431.01],
  ["TMCV", "Automobile", 7, 209.75, 1468.25],
  ["TMPV", "Automobile", 7, 463.6, 3245.2],
  ["WIPRO", "IT-Software", 4, 219.24, 876.96],
  ["HEROMOTOCO", "Automobile", 3, 4900.38, 14701.14],
];

const AIONION_AMMA_STOCKS: StockRow[] = [
  ["GOLDBEES", "ETF", 19, 80.25, 1524.75],
  ["HDFCBANK", "Bank", 5, 839.82, 4199.1],
  ["INDUSINDBK", "Bank", 3, 671.34, 2014.02],
  ["ITC", "FMCG", 8, 407.93, 3263.44],
  ["JYOTHYLAB", "FMCG", 2, 263.61, 527.22],
  ["KTKBANK", "Bank", 17, 276.35, 4697.95],
  ["MANAPPURAM", "NBFC", 7, 341.3, 2389.1],
  ["SOUTHBANK", "Bank", 33, 37.61, 1241.13],
  ["TCS", "IT-Software", 1, 2239.89, 2239.89],
  ["YESBANK", "Bank", 5, 21.13, 105.65],
  ["DRREDDY", "Pharmaceuticals", 4, 1233.14, 4932.56],
];

type BondRow = [lender: string, value: number, ytm: string, maturityDMY: string, couponRatePct: number, frequency: string];

const BONDS: BondRow[] = [
  ["Annapurna finance", 100000, "10.85%", "07/09/29", 12.25, "Monthly"],
  ["Annapurna finance", 100000, "11.42%", "14/04/32", 11.75, "Monthly"],
  ["Navi Finserv", 100000, "10.74%", "19/08/28", 10.75, "Monthly"],
  ["Muthoottu mini", 100000, "10.72%", "29/08/28", 9.75, "Monthly"],
  ["Muthoottu mini", 100000, "10.72%", "29/08/28", 9.75, "Monthly"],
  ["Muthoottu Capital", 100000, "11.02%", "28/03/31", 10.75, "Monthly"],
  ["Muthoottu Capital", 100000, "11.02%", "28/03/31", 10.75, "Monthly"],
  ["Annapurna finance", 100000, "11.42%", "14/04/32", 11.75, "Monthly"],
  ["Annapurna finance", 100000, "11.42%", "14/04/32", 11.75, "Monthly"],
  ["Annapurna finance", 100000, "11.42%", "14/04/32", 11.75, "Monthly"],
  ["Muthoottu Fincorp", 100000, "10.54%", "30/12/33", 10.4, "Monthly"],
];

function addEquity(accountId: number, [symbol, category, qty, avgPrice, currentValue]: StockRow) {
  const holding = createHolding({ type: "equity", name: symbol, accountId, units: qty, notes: `Category: ${category}` });
  createCashFlow({ holdingId: holding.id, date: TODAY, amount: -(qty * avgPrice), flowType: "contribution" });
  createValuation({ holdingId: holding.id, date: TODAY, pricePerUnit: currentValue / qty });
}

function addBond([lender, value, ytm, maturityDMY, couponRatePct, frequency]: BondRow) {
  const holding = createHolding({
    type: "bond",
    name: lender,
    interestRate: couponRatePct,
    maturityDate: parseDMY(maturityDMY),
    notes: `NCD — YTM ${ytm}, coupon ${couponRatePct}% (${frequency})`,
  });
  createCashFlow({ holdingId: holding.id, date: TODAY, amount: -value, flowType: "contribution" });
}

void withUserVault(async () => {
  const existing = getAccounts();
  if (existing.length > 0) {
    console.log(`Vault already has ${existing.length} account(s). Re-running this script will duplicate data.`);
    const proceed = await promptPlain('Type "yes" to continue anyway: ');
    if (proceed.trim().toLowerCase() !== "yes") {
      console.log("Aborted.");
      return;
    }
  }

  // --- Bank / cash accounts ---
  createAccount({ name: "Cash", type: "cash", openingBalance: 5000 });
  createAccount({ name: "ICICI Savings", type: "savings", openingBalance: 5000 });
  createAccount({ name: "HDFC Savings", type: "savings", openingBalance: 50000 });
  createAccount({ name: "UCO Savings", type: "savings", openingBalance: 5000 });

  // --- Receivables (excluded from net worth by default — matches the source spreadsheet) ---
  createAccount({ name: "Accounts receivable — Suriya", type: "receivable", openingBalance: 231544, excludeFromNetWorth: true });
  createAccount({ name: "Accounts receivable — Dad", type: "receivable", openingBalance: 1000000, excludeFromNetWorth: true });

  // --- Liabilities ---
  createAccount({ name: "Gold Loan", type: "loan", openingBalance: 722139 });
  createAccount({ name: "Credit Card", type: "credit_card", openingBalance: 4000 });
  // Agreement 155644025 — 1,000,000 @ 10.85%, 36mo, EMI 32,668. 23 of 36 EMIs
  // paid as of TODAY (last paid due 07/08/2026, next due 07/09/2026), so
  // outstanding principal = 398,976 per the bank's repayment schedule.
  createAccount({
    name: "HDFC Bank Personal Loan",
    type: "loan",
    openingBalance: 398976,
    interestRate: 10.85,
    originalAmount: 1000000,
    emiAmount: 32668,
    tenureMonths: 36,
  });

  // --- Insurance ---
  createInsurancePolicy({
    type: "health",
    provider: "HDFC ERGO",
    name: "my:Optima Secure (Parents — Family Floater)",
    policyNumber: "2856206113720102000",
    sumAssured: 500000,
    premiumAmount: 33426,
    premiumFrequency: "yearly",
    startDate: "2026-02-19",
    renewalDate: "2027-02-18",
    is80dEligible: true,
    notes: "Insured: S Muthu Vijayan (father, premium 24472) + M Thamilarasi (mother, premium 8955). 80D certificate on file.",
  });

  // --- Brokerage accounts + equities ---
  const upstox = createAccount({ name: "Upstox", type: "investment", openingBalance: 0 });
  const aionionSelf = createAccount({ name: "Aionion Capital (Self)", type: "investment", openingBalance: 0 });
  const aionionAmma = createAccount({ name: "Aionion Capital (Amma)", type: "investment", openingBalance: 0 });

  for (const row of UPSTOX_STOCKS) addEquity(upstox.id, row);
  for (const row of AIONION_SELF_STOCKS) addEquity(aionionSelf.id, row);
  for (const row of AIONION_AMMA_STOCKS) addEquity(aionionAmma.id, row);

  // --- Bonds (NCDs) ---
  for (const bond of BONDS) addBond(bond);

  // --- EPF ---
  const epf = createHolding({ type: "govt_scheme", name: "EPF", notes: "94% can be withdrawn", is80cEligible: true });
  createCashFlow({ holdingId: epf.id, date: TODAY, amount: -1115542, flowType: "contribution" });

  // --- Gold / silver ---
  const digitalGold = createHolding({ type: "gold", name: "Digital gold", units: 2.0024 });
  createCashFlow({ holdingId: digitalGold.id, date: TODAY, amount: -(2.0024 * 6000), flowType: "contribution" });
  createValuation({ holdingId: digitalGold.id, date: TODAY, pricePerUnit: GOLD_PRICE_PER_GRAM });

  const jewelleryGold = createHolding({ type: "other_asset", name: "Jewellery gold", units: 252, notes: "22K, avg purchase ₹8000/g" });
  createCashFlow({ holdingId: jewelleryGold.id, date: TODAY, amount: -(252 * 8000), flowType: "contribution" });
  createValuation({ holdingId: jewelleryGold.id, date: TODAY, pricePerUnit: GOLD_PRICE_PER_GRAM });

  const jewellerySilver = createHolding({ type: "other_asset", name: "Jewellery silver", units: 30, notes: "avg purchase ₹130/g" });
  createCashFlow({ holdingId: jewellerySilver.id, date: TODAY, amount: -(30 * 130), flowType: "contribution" });
  createValuation({ holdingId: jewellerySilver.id, date: TODAY, pricePerUnit: SILVER_PRICE_PER_GRAM });

  // --- Summary ---
  const accountsTotal = getAccounts().reduce((sum, a) => sum + a.balance, 0);
  const holdingsTotal = getHoldingsWithValue().reduce((sum, h) => sum + h.currentValue, 0);
  console.log("\nDone.");
  console.log(`Accounts total:  ${accountsTotal.toFixed(2)}`);
  console.log(`Holdings total:  ${holdingsTotal.toFixed(2)}`);
  console.log(`Net worth:       ${(accountsTotal + holdingsTotal).toFixed(2)}`);
  console.log("(Compare against your expected figures — anything still missing wasn't in this run.)");
});
