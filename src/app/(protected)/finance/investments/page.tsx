import type { Metadata } from "next";
import Link from "next/link";
import { getHoldingsWithValue, getPortfolioXirr } from "@/modules/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NavCard } from "@/components/ui/nav-card";

export const metadata: Metadata = {
  title: "Investments — Personal Life OS",
};

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(rate: number | null) {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

export default function InvestmentsPage() {
  const holdings = getHoldingsWithValue();
  const totalValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);
  const portfolioXirr = getPortfolioXirr();

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
            <p className="tabular-nums text-2xl font-semibold">{formatAmount(totalValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Portfolio XIRR
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold">{formatPercent(portfolioXirr)}</p>
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
