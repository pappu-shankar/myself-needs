import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import Link from "next/link";
import { currentFiscalYear, get80cUtilization, get80dUtilization } from "@/modules/finance";
import { STATUTORY_CURRENCY } from "@/modules/finance/service/config/tax";
import { Money, MoneyFigure } from "../../_components/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FiscalYearPicker } from "../fiscal-year-picker";
import { PolicyNote } from "../policy-note";
import { fiscalYearOptions, selectedFiscalYear } from "../selected-fiscal-year";

export const metadata: Metadata = {
  title: "Deductions — Personal Life OS",
};

export default async function TaxDeductionsPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string | string[] }>;
}) {
  await requireUser();
  const fy = selectedFiscalYear((await searchParams).fy);
  const eightyC = get80cUtilization(fy);
  const eightyD = get80dUtilization(fy);

  return (
    <>
      <PageHeader
        title="Deductions"
        description={`80C and 80D utilization for FY ${fy.label} (${fy.start} to ${fy.end}).`}
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/finance/tax" />}>
            Back to Tax planning
          </Button>
        }
      />

      <FiscalYearPicker
        basePath="/finance/tax/deductions"
        years={fiscalYearOptions(fy)}
        selected={fy.label}
        current={currentFiscalYear().label}
      />
      <PolicyNote fiscalYear={fy.label} policyFiscalYear={eightyC.policyFiscalYear} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              80C utilization
            </CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              PPF, ELSS, tax-saver FDs, and eligible insurance premiums
            </p>
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold">
              <MoneyFigure aggregate={eightyC.used} />{" "}
              <span className="text-muted-foreground text-base font-normal">
                / <Money minor={eightyC.limitMinor} currency={STATUTORY_CURRENCY} />
              </span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              80D utilization
            </CardTitle>
            <p className="text-muted-foreground mt-1 text-xs">
              Health insurance premiums paid in the year
            </p>
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold">
              <MoneyFigure aggregate={eightyD.used} />{" "}
              <span className="text-muted-foreground text-base font-normal">
                / <Money minor={eightyD.limitMinor} currency={STATUTORY_CURRENCY} />
              </span>
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
