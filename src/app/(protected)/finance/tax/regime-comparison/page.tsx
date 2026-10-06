import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import Link from "next/link";
import { currentFiscalYear, getRegimeComparison } from "@/modules/finance";
import { STATUTORY_CURRENCY } from "@/modules/finance/service/config/tax";
import { Money } from "../../_components/money";
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

      {!regime.complete && (
        <p role="alert" className="text-destructive mb-4 text-sm">
          This comparison is incomplete: some income or deduction currencies had no exchange rate to
          INR, so both tax figures are computed on only what converted.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Old vs. new regime</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg">
            <span className="font-semibold capitalize">{regime.betterRegime} regime</span> saves you{" "}
            <span className="tabular-nums font-semibold">
              <Money minor={regime.savingsMinor} currency={STATUTORY_CURRENCY} />
            </span>{" "}
            in FY {fy.label}.
          </p>
          <p className="text-muted-foreground mt-1 text-sm">{regime.reason}</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground text-sm">Old regime tax (including cess)</p>
              <p className="tabular-nums text-xl font-semibold">
                <Money minor={regime.oldRegimeTaxMinor} currency={STATUTORY_CURRENCY} />
              </p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">New regime tax (including cess)</p>
              <p className="tabular-nums text-xl font-semibold">
                <Money minor={regime.newRegimeTaxMinor} currency={STATUTORY_CURRENCY} />
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
