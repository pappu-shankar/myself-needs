import type { Metadata } from "next";
import Link from "next/link";
import { get80cUtilization, get80dUtilization } from "@/modules/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Deductions — Personal Life OS",
};

function formatAmount(amount: number) {
  return amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TaxDeductionsPage() {
  const eightyC = get80cUtilization();
  const eightyD = get80dUtilization();

  return (
    <>
      <PageHeader
        title="Deductions"
        description="80C and 80D utilization for the current financial year."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/finance/tax" />}>
            Back to Tax planning
          </Button>
        }
      />

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
              {formatAmount(eightyC.used)}{" "}
              <span className="text-muted-foreground text-base font-normal">
                / {formatAmount(eightyC.limit)}
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
              Health insurance premiums paid this year
            </p>
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold">
              {formatAmount(eightyD.used)}{" "}
              <span className="text-muted-foreground text-base font-normal">
                / {formatAmount(eightyD.limit)}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
