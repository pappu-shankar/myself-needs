import type { Metadata } from "next";
import { requireUnlocked } from "@/modules/core/session/guard";
import { getTotalBalance } from "@/modules/finance";
import { getLatestMetricSummary } from "@/modules/health";
import { getActiveMedicationsCount } from "@/modules/mental";
import { getActiveGoalsCount } from "@/modules/plans";
import { todayIso } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Dashboard — Personal Life OS",
};

export default async function DashboardPage() {
  await requireUnlocked();
  const totalBalance = getTotalBalance();
  const latestMetric = getLatestMetricSummary();
  const today = todayIso();
  const activeMedicationsCount = getActiveMedicationsCount(today);
  const activeGoalsCount = getActiveGoalsCount();

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="A cross-module overview — finance, health, mental, and plans."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Total balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold">
              {totalBalance.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Latest health metric
            </CardTitle>
          </CardHeader>
          <CardContent>
            {latestMetric ? (
              <p className="tabular-nums">
                {latestMetric.label}: {latestMetric.value ?? "—"}{" "}
                <span className="text-muted-foreground text-sm">({latestMetric.date})</span>
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">No entries yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Mental health medications
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold">{activeMedicationsCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Active goals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold">{activeGoalsCount}</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
