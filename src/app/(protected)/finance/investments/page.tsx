import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import Link from "next/link";
import { getHoldingsWithValue, getPortfolioXirrByCurrency } from "@/modules/finance";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NavCard } from "@/components/ui/nav-card";

export const metadata: Metadata = {
  title: "Investments — Personal Life OS",
};

function formatPercent(rate: number | null) {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

export default async function InvestmentsPage() {
  await requireUser();
  const holdings = getHoldingsWithValue();
  // Per currency, not one total: a portfolio holding both rupee and dollar
  // positions has no single value without a rate, and an XIRR is a rate of
  // return on one currency's cash flows.
  const totalsByCurrency = new Map<string, number>();
  for (const h of holdings) {
    totalsByCurrency.set(h.currency, (totalsByCurrency.get(h.currency) ?? 0) + h.currentValueMinor);
  }
  const totals = [...totalsByCurrency.entries()]
    .map(([currency, minor]) => ({ currency, minor }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
  const xirrByCurrency = [...getPortfolioXirrByCurrency().entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );
  const unvalued = holdings.filter((h) => h.missing !== null).length;
  const maturedUnpaid = holdings.filter((h) => h.maturedOn !== null).length;

  return (
    <>
      <PageHeader
        title="Investments"
        description="Holdings, cash flows, valuations, and government scheme templates."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/finance" />}>
            Back to Finance
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Total current value
            </CardTitle>
          </CardHeader>
          <CardContent>
            {totals.length === 0 ? (
              <p className="tabular-nums text-2xl font-semibold">—</p>
            ) : (
              totals.map(({ currency, minor }) => (
                <p key={currency} className="tabular-nums text-2xl font-semibold">
                  {formatMoney({ minor, currency })}
                </p>
              ))
            )}
            {unvalued > 0 && (
              <p className="text-muted-foreground mt-1 text-xs">
                {unvalued} holding{unvalued === 1 ? "" : "s"} not valued yet (missing units or
                price) — not included.
              </p>
            )}
            {maturedUnpaid > 0 && (
              <p className="text-muted-foreground mt-1 text-xs">
                {maturedUnpaid} matured deposit{maturedUnpaid === 1 ? "" : "s"} awaiting a payout
                entry.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Portfolio XIRR
            </CardTitle>
          </CardHeader>
          <CardContent>
            {xirrByCurrency.length === 0 ? (
              <p className="tabular-nums text-2xl font-semibold">—</p>
            ) : (
              xirrByCurrency.map(([currency, xirr]) => (
                <p key={currency} className="tabular-nums text-2xl font-semibold">
                  {formatPercent(xirr)}
                  {xirrByCurrency.length > 1 && (
                    <span className="text-muted-foreground ml-1 text-xs">{currency}</span>
                  )}
                </p>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">Holdings</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold">{holdings.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <NavCard
          href="/finance/investments/holdings"
          title="Holdings"
          description="Add holdings, record cash flows and valuations, refresh mutual fund NAVs."
        />
        <NavCard
          href="/finance/investments/scheme-templates"
          title="Scheme templates"
          description="Government scheme reference rates and lock-in periods."
        />
      </div>
    </>
  );
}
