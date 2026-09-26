import type { Metadata } from "next";
import Link from "next/link";
import { getRegimeComparison } from "@/modules/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Regime comparison — Personal Life OS",
};

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function RegimeComparisonPage() {
  const regime = getRegimeComparison();

  return (
    <>
      <PageHeader
        title="Regime comparison"
        description="Old vs. new regime, estimated for the current financial year."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/finance/tax" />}>
            Back to Tax planning
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Old vs. new regime</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg">
            <span className="font-semibold capitalize">{regime.betterRegime} regime</span> saves you{" "}
            <span className="tabular-nums font-semibold">{formatAmount(regime.savings)}</span> this
            year.
          </p>
          <p className="text-muted-foreground mt-1 text-sm">{regime.reason}</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground text-sm">Old regime tax (including cess)</p>
              <p className="tabular-nums text-xl font-semibold">
                {formatAmount(regime.oldRegimeTax)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">New regime tax (including cess)</p>
              <p className="tabular-nums text-xl font-semibold">
                {formatAmount(regime.newRegimeTax)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
