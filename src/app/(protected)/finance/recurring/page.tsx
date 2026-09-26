import type { Metadata } from "next";
import Link from "next/link";
import { getAccounts, getCategories, getRecurringRules, getDueWorklist } from "@/modules/finance";
import { getGoals } from "@/modules/plans";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { AddRecurringRuleDialog } from "./add-recurring-rule-dialog";
import { DueWorklist } from "./due-worklist";

export const metadata: Metadata = {
  title: "Recurring — Personal Life OS",
};

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RecurringPage() {
  const accounts = getAccounts();
  const categories = getCategories();
  const recurringRules = getRecurringRules();
  const dueItems = getDueWorklist();
  // Cross-module composition at the app layer — see docs/prd/finance/goal-linked-investments.md.
  const goals = getGoals();

  return (
    <>
      <PageHeader
        title="Recurring"
        description="Recurring rules — rent, subscriptions, EMIs — and their unconfirmed occurrences."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/finance" />}>
            Back to Finance
          </Button>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-medium">Due — not yet logged</CardTitle>
        </CardHeader>
        <CardContent>
          <DueWorklist items={dueItems} />
        </CardContent>
      </Card>

      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">All recurring rules</h2>
        {accounts.length > 0 && (
          <AddRecurringRuleDialog accounts={accounts} categories={categories} goals={goals} />
        )}
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          title="Add an account first"
          description="Recurring rules run against an account — create one before setting up a schedule here."
          action={
            <Link
              href="/finance/accounts"
              className="text-primary text-sm underline-offset-4 hover:underline"
            >
              Go to Accounts
            </Link>
          }
          className="mb-6"
        />
      ) : recurringRules.length === 0 ? (
        <EmptyState
          title="No recurring rules yet"
          description="Add one to get started — e.g. rent, a subscription, an EMI."
          className="mb-6"
        />
      ) : (
        <Card className="mb-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Note</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Start date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recurringRules.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.note ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground capitalize">{r.type}</TableCell>
                  <TableCell>
                    {r.type === "transfer"
                      ? `${r.accountName} → ${r.toAccountName}`
                      : r.accountName}
                  </TableCell>
                  <TableCell>{r.categoryName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(r.amount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">{r.frequency}</TableCell>
                  <TableCell className="tabular-nums">{r.startDate}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
