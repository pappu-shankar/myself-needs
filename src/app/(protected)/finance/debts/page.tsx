import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import Link from "next/link";
import { getAccounts, getDebtTermsByAccount } from "@/modules/finance";
import { getCreditUtilization } from "@/modules/finance/service/utility/loans";
import { Money } from "../_components/money";
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

export default async function DebtsPage() {
  await requireUser();
  const accounts = getAccounts();
  // Rate and limit moved off the account row into the terms satellites in
  // migration 0028, so they are read once for the whole page rather than per
  // row. See db/queries/domain/accounts.ts.
  const terms = getDebtTermsByAccount();
  const creditCards = accounts.filter(
    (a) => a.type === "credit_card" || a.type === "revolving_credit",
  );
  const loans = accounts.filter((a) => a.type === "loan");

  /**
   * A utilization figure is only produced when the balance and the limit are in
   * the same currency. A limit recorded in one currency against a balance in
   * another would need a rate this page was never given, and a percentage is
   * exactly the kind of number that looks authoritative while being nonsense.
   */
  const utilizationOf = (accountCurrency: string, owedMinor: number, accountId: number) => {
    const t = terms.get(accountId);
    if (!t?.creditLimitMinor || t.limitCurrency !== accountCurrency) return null;
    return getCreditUtilization(owedMinor, t.creditLimitMinor);
  };

  // Overall utilization is per currency for the same reason: summing limits
  // across currencies would invent a total nobody holds.
  const owedByCurrency = new Map<string, number>();
  const limitByCurrency = new Map<string, number>();
  for (const card of creditCards) {
    const owed = Math.abs(card.balanceMinor);
    owedByCurrency.set(card.currency, (owedByCurrency.get(card.currency) ?? 0) + owed);
    const t = terms.get(card.id);
    if (t?.creditLimitMinor && t.limitCurrency === card.currency) {
      limitByCurrency.set(
        card.currency,
        (limitByCurrency.get(card.currency) ?? 0) + t.creditLimitMinor,
      );
    }
  }
  const overallUtilization = [...limitByCurrency.entries()]
    .map(([currency, limitMinor]) => ({
      currency,
      percent: getCreditUtilization(owedByCurrency.get(currency) ?? 0, limitMinor),
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  const amortizableLoans = loans.flatMap((loan) => {
    const t = terms.get(loan.id);
    if (!t?.rateBps || !t.emiMinor || Math.abs(loan.balanceMinor) === 0) return [];
    return [
      {
        id: loan.id,
        name: loan.name,
        currency: loan.currency,
        outstandingBalanceMinor: Math.abs(loan.balanceMinor),
        rateBps: t.rateBps,
        emiMinor: t.emiMinor,
      },
    ];
  });

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
                    const owed = Math.abs(c.balanceMinor);
                    const limitMinor = terms.get(c.id)?.creditLimitMinor ?? null;
                    const utilization = utilizationOf(c.currency, owed, c.id);
                    return (
                      <TableRow key={c.id}>
                        <TableCell>{c.name}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          <Money minor={owed} currency={c.currency} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {limitMinor === null ? (
                            <span className="text-muted-foreground">Not set</span>
                          ) : (
                            <Money
                              minor={limitMinor}
                              currency={terms.get(c.id)?.limitCurrency ?? c.currency}
                            />
                          )}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${
                            utilization !== null && utilization > 100 ? "text-destructive" : ""
                          }`}
                        >
                          {utilization === null ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            `${utilization.toFixed(0)}%`
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {overallUtilization.length > 0 && (
                <p className="text-muted-foreground mt-4 text-sm">
                  Overall utilization across all cards:{" "}
                  {overallUtilization.map(({ currency, percent }, i) => (
                    <span key={currency}>
                      {i > 0 && ", "}
                      <span className="text-foreground tabular-nums font-medium">
                        {percent.toFixed(0)}%
                      </span>
                      {overallUtilization.length > 1 && ` (${currency})`}
                    </span>
                  ))}
                </p>
              )}
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
                  const outstanding = Math.abs(l.balanceMinor);
                  const t = terms.get(l.id);
                  // Progress needs the original amount; without it there is
                  // nothing to measure against, so it shows as unknown rather
                  // than as 0% paid off.
                  const progress =
                    t?.originalAmountMinor && t.originalAmountMinor > 0
                      ? ((t.originalAmountMinor - outstanding) / t.originalAmountMinor) * 100
                      : null;
                  return (
                    <TableRow key={l.id}>
                      <TableCell>{l.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        <Money minor={outstanding} currency={l.currency} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t?.originalAmountMinor == null ? (
                          <span className="text-muted-foreground">Not set</span>
                        ) : (
                          <Money minor={t.originalAmountMinor} currency={l.currency} />
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {progress === null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          `${progress.toFixed(0)}%`
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {t?.emiMinor == null ? (
                          <span className="text-muted-foreground">Not set</span>
                        ) : (
                          <Money minor={t.emiMinor} currency={l.currency} />
                        )}
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
