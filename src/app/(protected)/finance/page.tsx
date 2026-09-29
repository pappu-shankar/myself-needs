import type { Metadata } from "next";
import { requireUnlocked } from "@/modules/core/session/guard";
import {
  getAccounts,
  getCategories,
  getTransactionsPage,
  getBudgetsForMonth,
  getTotalBalance,
  getNetWorthTrend,
  getInsights,
  getFinanceSettings,
} from "@/modules/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavCard } from "@/components/ui/nav-card";
import { NetWorthChart } from "./net-worth-chart";
import { InsightsBanner } from "./insights-banner";
import { GettingStartedChecklist } from "./getting-started-checklist";

export const metadata: Metadata = {
  title: "Finance — Personal Life OS",
};

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const NAV_ITEMS = [
  {
    href: "/finance/accounts",
    title: "Accounts",
    description: "Bank accounts, cards, loans, and other balances.",
  },
  {
    href: "/finance/categories",
    title: "Categories",
    description: "Income and expense categories.",
  },
  {
    href: "/finance/transactions",
    title: "Transactions",
    description: "Income, expenses, and transfers.",
  },
  {
    href: "/finance/budgets",
    title: "Budgets",
    description: "Monthly spending limits by category.",
  },
  {
    href: "/finance/recurring",
    title: "Recurring",
    description: "Recurring rules and unconfirmed occurrences.",
  },
  {
    href: "/finance/insurance",
    title: "Insurance",
    description: "Life, health, term, and vehicle policies.",
  },
  {
    href: "/finance/debts",
    title: "Debts",
    description: "Credit cards and loans, with amortization.",
  },
  {
    href: "/finance/investments",
    title: "Investments",
    description: "Holdings and scheme reference rates.",
  },
  {
    href: "/finance/reports",
    title: "Reports",
    description: "Spending, income, and net worth charts.",
  },
  {
    href: "/finance/tax",
    title: "Tax",
    description: "Deductions, regime comparison, and capital gains.",
  },
  {
    href: "/finance/calculators",
    title: "Calculators",
    description: "SIP, lumpsum, CAGR, XIRR, IRR, inflation, EMI.",
  },
  {
    href: "/finance/insights",
    title: "Insights",
    description: "Audits, advice, and compliance nudges.",
  },
  {
    href: "/finance/settings",
    title: "Settings",
    description: "Allocation targets, tax rates, and insight thresholds.",
  },
] as const;

export default async function FinancePage() {
  await requireUnlocked();
  const accounts = getAccounts();
  const categories = getCategories();
  const { total } = getTransactionsPage(0);
  const budgets = getBudgetsForMonth();
  const totalBalance = getTotalBalance();
  const netWorthTrend = getNetWorthTrend();
  const insights = getInsights();
  const settings = getFinanceSettings();

  const gettingStartedSteps = [
    {
      label: "Add an account",
      description: "A bank account, card, or loan — everything else is recorded against one.",
      href: "/finance/accounts",
      done: accounts.length > 0,
    },
    {
      label: "Add a category",
      description: "How income and expenses get grouped — e.g. Salary, Groceries, Rent.",
      href: "/finance/categories",
      done: categories.length > 0,
    },
    {
      label: "Log a transaction",
      description: "An income, expense, or transfer against an account and category.",
      href: "/finance/transactions",
      done: total > 0,
    },
    {
      label: "Set a budget",
      description: "A monthly limit for a category, checked against what you've actually spent.",
      href: "/finance/budgets",
      done: budgets.length > 0,
    },
  ];
  const showGettingStarted =
    !settings?.gettingStartedDismissed && gettingStartedSteps.some((s) => !s.done);

  return (
    <>
      <PageHeader
        title="Finance"
        description="Accounts, categories, transactions, budgets, recurring rules, and insurance."
      />

      {showGettingStarted && <GettingStartedChecklist steps={gettingStartedSteps} />}

      <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {NAV_ITEMS.map((item) => (
          <NavCard
            key={item.href}
            href={item.href}
            title={item.title}
            description={item.description}
          />
        ))}
      </div>

      <InsightsBanner insights={insights} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Total balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold">{formatAmount(totalBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold">{accounts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold">{total}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6">
        <NetWorthChart points={netWorthTrend} />
      </div>
    </>
  );
}
