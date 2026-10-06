import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import {
  getAccounts,
  getCategories,
  getTransactionsCount,
  getBudgetsForMonth,
  getNetWorth,
  getNetWorthTrend,
  getInsights,
  getFinanceSettings,
} from "@/modules/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavCard } from "@/components/ui/nav-card";
import { MoneyFigure } from "./_components/money";
import { NetWorthChart } from "./net-worth-chart";
import { InsightsBanner } from "./insights-banner";
import { GettingStartedChecklist } from "./getting-started-checklist";
import { FINANCE_SECTIONS } from "./ia-config";

export const metadata: Metadata = {
  title: "Finance — Personal Life OS",
};

export default async function FinancePage() {
  await requireUser();
  const accounts = getAccounts();
  const categories = getCategories();
  const transactionCount = getTransactionsCount();
  const budgets = getBudgetsForMonth();
  const totalBalance = getNetWorth();
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
      done: transactionCount > 0,
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

      {/* Grouped by section rather than one flat grid of fourteen cards, and
          derived from `ia-config.ts` so the hub, the section nav and the
          breadcrumb trail cannot drift apart the way the five hand-synced
          copies did. */}
      {FINANCE_SECTIONS.map((section) => {
        const pages = section.pages.filter((page) => !page.planned);
        if (pages.length === 0) return null;
        return (
          <section key={section.id} className="mb-6">
            <h2 className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
              {section.label}
            </h2>
            <p className="text-muted-foreground mb-3 text-sm">{section.summary}</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {pages.map((page) => (
                <NavCard
                  key={page.href}
                  href={page.href}
                  title={page.title}
                  description={page.description}
                />
              ))}
            </div>
          </section>
        );
      })}

      <InsightsBanner insights={insights} />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Total balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold">
              <MoneyFigure aggregate={totalBalance} />
            </p>
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
            <p className="tabular-nums text-2xl font-semibold">{transactionCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6">
        <NetWorthChart points={netWorthTrend} />
      </div>
    </>
  );
}
