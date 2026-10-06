import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import Link from "next/link";
import {
  getIncomeExpenseReport,
  getEmergencyFundMonths,
  getCurrentAllocation,
} from "@/modules/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IncomeExpenseChart } from "./income-expense-chart";
import { CategoryBreakdownChart } from "./category-breakdown-chart";
import { AllocationBreakdownChart } from "./allocation-breakdown-chart";

export const metadata: Metadata = {
  title: "Reports — Personal Life OS",
};

function formatMonths(months: number | null) {
  return months === null ? "—" : `${months.toFixed(1)} months`;
}

function formatPercent(rate: number | null) {
  return rate === null ? "—" : `${(rate * 100).toFixed(1)}%`;
}

export default async function ReportsPage() {
  await requireUser();
  const { trend, categoryBreakdown, savingsRate } = getIncomeExpenseReport();
  const emergencyFundMonths = getEmergencyFundMonths();
  const allocation = getCurrentAllocation();

  return (
    <>
      <PageHeader
        title="Reports"
        description="Income, expenses, allocation, and emergency fund coverage."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/finance/settings" />}
            >
              Allocation targets
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/finance" />}>
              Back to Finance
            </Button>
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Savings rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold">{formatPercent(savingsRate)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Emergency fund
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold">
              {formatMonths(emergencyFundMonths)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6">
        <IncomeExpenseChart trend={trend} />
      </div>

      <div className="mb-6">
        <CategoryBreakdownChart categories={categoryBreakdown} />
      </div>

      <div>
        <AllocationBreakdownChart allocation={allocation} />
      </div>
    </>
  );
}
