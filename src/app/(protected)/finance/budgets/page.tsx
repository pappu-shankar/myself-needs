import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import Link from "next/link";
import { getCategoriesByType, getBudgetsForMonth } from "@/modules/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { formatMoney } from "@/lib/format";
import { AddBudgetDialog } from "./add-budget-dialog";
import { MoneyFigure } from "../_components/money";

export const metadata: Metadata = {
  title: "Budgets — Personal Life OS",
};

export default async function BudgetsPage() {
  await requireUser();
  const expenseCategories = getCategoriesByType("expense");
  const budgets = getBudgetsForMonth();

  return (
    <>
      <PageHeader title="Budgets" description="Monthly spending limits by category." />

      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">This month&apos;s budgets</h2>
        {expenseCategories.length > 0 && <AddBudgetDialog categories={expenseCategories} />}
      </div>

      {expenseCategories.length === 0 ? (
        <EmptyState
          title="Add an expense category first"
          description="Budgets are set per category — create an expense category before setting a monthly limit."
          action={
            <Link
              href="/finance/categories"
              className="text-primary text-sm underline-offset-4 hover:underline"
            >
              Go to Categories
            </Link>
          }
          className="mb-6"
        />
      ) : budgets.length === 0 ? (
        <EmptyState
          title="No budgets set for this month"
          description="Add a monthly limit for a category to get started."
          className="mb-6"
        />
      ) : (
        <Card className="mb-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Monthly limit</TableHead>
                <TableHead className="text-right">Spent</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgets.map((b) => {
                const remaining = b.monthlyLimitMinor - b.spend.baseMinor;
                // Null when the spend figure is incomplete: "over budget" needs
                // the whole number, and a budget that looks under because a
                // currency would not convert is the worst way to be wrong.
                const isOver = b.overBudget;
                return (
                  <TableRow key={b.categoryId}>
                    <TableCell>{b.categoryName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney({ minor: b.monthlyLimitMinor, currency: b.currency })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <MoneyFigure aggregate={b.spend} />
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${isOver ? "text-destructive" : ""}`}
                    >
                      {isOver === null
                        ? "—"
                        : isOver
                          ? `Over by ${formatMoney({ minor: Math.abs(remaining), currency: b.currency })}`
                          : formatMoney({ minor: remaining, currency: b.currency })}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
