import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import { getNetWorth } from "@/modules/finance";
import { getGymDashboardSummary, getLatestMetricSummary } from "@/modules/health";
import { getActiveMedicationsCount } from "@/modules/mental";
import { getActiveGoalsCount } from "@/modules/plans";
import Link from "next/link";
import { MoneyFigure } from "../finance/_components/money";
import { todayIso } from "@/lib/dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Dashboard — Personal Life OS",
};

export default async function DashboardPage() {
  await requireUser();
  const totalBalance = getNetWorth();
  const latestMetric = getLatestMetricSummary();
  const today = todayIso();
  const activeMedicationsCount = getActiveMedicationsCount(today);
  const activeGoalsCount = getActiveGoalsCount();
  const gym = getGymDashboardSummary(today);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="A cross-module overview — finance, health, training, mental, and plans."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Total balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold">
              <MoneyFigure aggregate={totalBalance} />
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
              Training this week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="tabular-nums text-2xl font-semibold">
              {gym.sessionsThisWeek}
              <span className="text-muted-foreground text-base font-normal">
                {" "}
                / {gym.weeklyGoal}
              </span>
            </p>
            <p className="text-muted-foreground text-sm">
              {gym.activeWorkoutName ? (
                <Link href="/health/gym/workout" className="text-primary hover:underline">
                  {gym.activeWorkoutName} in progress
                </Link>
              ) : gym.trainedToday ? (
                "Trained today"
              ) : gym.todayRoutineName ? (
                <Link href="/health/gym/workout" className="text-primary hover:underline">
                  Today: {gym.todayRoutineName}
                </Link>
              ) : (
                "Nothing planned today"
              )}
            </p>
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
