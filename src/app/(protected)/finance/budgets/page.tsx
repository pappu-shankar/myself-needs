import type { Metadata } from "next";
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
import { Button } from "@/components/ui/button";
import { AddBudgetDialog } from "./add-budget-dialog";

export const metadata: Metadata = {
  title: "Budgets — Personal Life OS",
};

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BudgetsPage() {
  const expenseCategories = getCategoriesByType("expense");
  const budgets = getBudgetsForMonth();

  return (
    <>
      <PageHeader
        title="Budgets"
        description="Monthly spending limits by category."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/finance" />}>
            Back to Finance
          </Button>
        }
      />

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
                const remaining = b.monthlyLimit - b.actualSpend;
                const isOver = remaining < 0;
                return (
                  <TableRow key={b.categoryId}>
                    <TableCell>{b.categoryName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(b.monthlyLimit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(b.actualSpend)}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${isOver ? "text-destructive" : ""}`}
                    >
                      {isOver
                        ? `Over by ${formatAmount(Math.abs(remaining))}`
                        : formatAmount(remaining)}
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
