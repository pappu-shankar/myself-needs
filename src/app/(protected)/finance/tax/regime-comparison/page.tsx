import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import Link from "next/link";
import { currentFiscalYear, getRegimeComparison } from "@/modules/finance";
import { formatAmount } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FiscalYearPicker } from "../fiscal-year-picker";
import { PolicyNote } from "../policy-note";
import { fiscalYearOptions, selectedFiscalYear } from "../selected-fiscal-year";

export const metadata: Metadata = {
  title: "Regime comparison — Personal Life OS",
};

export default async function RegimeComparisonPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string | string[] }>;
}) {
  await requireUser();
  const fy = selectedFiscalYear((await searchParams).fy);
  const regime = getRegimeComparison(fy);

  return (
    <>
      <PageHeader
        title="Regime comparison"
        description={`Old vs. new regime, estimated for FY ${fy.label} from that FY's income and deductions.`}
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/finance/tax" />}>
            Back to Tax planning
          </Button>
        }
      />

      <FiscalYearPicker
        basePath="/finance/tax/regime-comparison"
        years={fiscalYearOptions(fy)}
        selected={fy.label}
        current={currentFiscalYear().label}
      />
      <PolicyNote fiscalYear={fy.label} policyFiscalYear={regime.policyFiscalYear} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Old vs. new regime</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg">
            <span className="font-semibold capitalize">{regime.betterRegime} regime</span> saves you{" "}
            <span className="tabular-nums font-semibold">{formatAmount(regime.savings)}</span> in FY{" "}
            {fy.label}.
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
