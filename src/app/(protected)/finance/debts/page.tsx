import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import Link from "next/link";
import { getAccounts } from "@/modules/finance";
import { getCreditUtilization } from "@/modules/finance/service/utility/loans";
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
import { LoanAmortization } from "./loan-amortization";

export const metadata: Metadata = {
  title: "Debts — Personal Life OS",
};

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function DebtsPage() {
  await requireUser();
  const accounts = getAccounts();
  const creditCards = accounts.filter((a) => a.type === "credit_card");
  const loans = accounts.filter((a) => a.type === "loan");

  const totalOwed = creditCards.reduce((sum, c) => sum + Math.abs(c.balance), 0);
  const totalLimit = creditCards.reduce((sum, c) => sum + (c.creditLimit ?? 0), 0);
  const overallUtilization = getCreditUtilization(totalOwed, totalLimit);

  const amortizableLoans = loans
    .filter((l) => l.interestRate != null && l.emiAmount != null && Math.abs(l.balance) > 0)
    .map((l) => ({
      id: l.id,
      name: l.name,
      outstandingBalance: Math.abs(l.balance),
      annualInterestRate: l.interestRate!,
      emiAmount: l.emiAmount!,
    }));

  return (
    <>
      <PageHeader
        title="Debts"
        description="Credit cards and loans — filtered from your accounts."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/finance" />}>
            Back to Finance
          </Button>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-medium">Credit cards</CardTitle>
        </CardHeader>
        <CardContent>
          {creditCards.length === 0 ? (
            <EmptyState
              title="No credit cards"
              description="Add an account with type Credit card to see it here."
              action={
                <Link
                  href="/finance/accounts"
                  className="text-primary text-sm underline-offset-4 hover:underline"
                >
                  Go to Accounts
                </Link>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Balance owed</TableHead>
                    <TableHead className="text-right">Credit limit</TableHead>
                    <TableHead className="text-right">Utilization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {creditCards.map((c) => {
                    const owed = Math.abs(c.balance);
                    const utilization = getCreditUtilization(owed, c.creditLimit ?? 0);
                    return (
                      <TableRow key={c.id}>
                        <TableCell>{c.name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatAmount(owed)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatAmount(c.creditLimit ?? 0)}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${utilization > 100 ? "text-destructive" : ""}`}
                        >
                          {utilization.toFixed(0)}%
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <p className="text-muted-foreground mt-4 text-sm">
                Overall utilization across all cards:{" "}
                <span className="text-foreground tabular-nums font-medium">
                  {overallUtilization.toFixed(0)}%
                </span>
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-medium">Loans</CardTitle>
        </CardHeader>
        <CardContent>
          {loans.length === 0 ? (
            <EmptyState
              title="No loans"
              description="Add an account with type Loan to see it here."
              action={
                <Link
                  href="/finance/accounts"
                  className="text-primary text-sm underline-offset-4 hover:underline"
                >
                  Go to Accounts
                </Link>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Original amount</TableHead>
                  <TableHead className="text-right">Payoff progress</TableHead>
                  <TableHead className="text-right">EMI</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.map((l) => {
                  const outstanding = Math.abs(l.balance);
                  const progress = l.originalAmount
                    ? ((l.originalAmount - outstanding) / l.originalAmount) * 100
                    : 0;
                  return (
                    <TableRow key={l.id}>
                      <TableCell>{l.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatAmount(outstanding)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatAmount(l.originalAmount ?? 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {progress.toFixed(0)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatAmount(l.emiAmount ?? 0)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {amortizableLoans.length > 0 && <LoanAmortization loans={amortizableLoans} />}
    </>
  );
}
