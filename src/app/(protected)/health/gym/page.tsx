import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/modules/core/session/guard";
import { todayIso, parseIsoDate } from "@/lib/dates";
import { getGymOverview } from "@/modules/health";
import { formatWeight } from "@/modules/health/engine/units";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SessionPreview } from "./_components/session-preview";
import { GymInsights } from "./_components/gym-insights";
import { ReadinessCard } from "./_components/readiness-card";
import { ReadinessCheckinForm } from "./_components/readiness-checkin";

export const metadata: Metadata = {
  title: "Gym — Personal Life OS",
};

const DAY = new Intl.DateTimeFormat("en-IN", { weekday: "short" });
const RECORD_LABELS = {
  e1rm: "Estimated 1RM",
  heaviest: "Heaviest",
  best_set_volume: "Best set",
  most_reps_at_weight: "Rep record",
  longest_hold: "Longest hold",
  longest_distance: "Longest distance",
} as const;

export default async function GymHubPage() {
  await requireUser();
  const today = todayIso();
  const overview = getGymOverview(today);
  const checkin = overview.readiness.checkin;
  const logged = new Set(overview.loggedThisWeek);
  const { planned, preview, active } = overview;

  return (
    <>
      <PageHeader
        title="Gym"
        description="Plan, log and understand your training."
        actions={
          <Link href="/health/gym/workout" className={buttonVariants({ variant: "default" })}>
            {active ? "Resume workout" : "Start workout"}
          </Link>
        }
      />

      {!overview.hasRoutines && !active && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base font-medium">Get started</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="mb-3">
              Pick a starter program (Push/Pull/Legs, Upper/Lower, 5×5, 5/3/1 …) or build your own
              routine, then assign it to weekdays. You can also import history from Strong, Hevy or
              FitNotes.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/health/gym/routines"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Choose a routine
              </Link>
              <Link
                href="/health/gym/import"
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                Import history
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-medium">Today</CardTitle>
            {overview.program && (
              <p className="text-muted-foreground text-sm">{overview.program.label}</p>
            )}
          </CardHeader>
          <CardContent>
            {active ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{active.name} is in progress</p>
                  <p className="text-muted-foreground text-sm tabular-nums">
                    {active.setsDone} of {active.setsTotal} sets done
                  </p>
                </div>
                <Link href="/health/gym/workout" className={buttonVariants({ variant: "default" })}>
                  Resume
                </Link>
              </div>
            ) : preview ? (
              <>
                <p className="mb-3 font-medium">
                  {preview.routineName}
                  {planned.source === "override" && (
                    <Badge variant="outline" className="ml-2">
                      moved here
                    </Badge>
                  )}
                </p>
                <SessionPreview plan={preview} unit={overview.settings.weightUnit} />
              </>
            ) : planned.isRestOverride ? (
              <p className="text-sm">Rest day{planned.note ? ` — ${planned.note}` : ""}.</p>
            ) : (
              <p className="text-muted-foreground text-sm">
                Nothing planned today. Start an empty workout or{" "}
                <Link
                  href="/health/gym/plan"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  plan your week
                </Link>
                .
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <ReadinessCard readiness={overview.readiness} />
          <Card>
            <CardContent>
              <details>
                <summary className="text-primary cursor-pointer text-sm">
                  {checkin ? "Update today's check-in" : "Do today's check-in"}
                </summary>
                <div className="mt-3">
                  <ReadinessCheckinForm date={today} existing={checkin} />
                </div>
              </details>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">This week</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm tabular-nums">
              {overview.sessionsThisWeek} of {overview.settings.weeklySessionGoal} sessions ·{" "}
              {overview.streakWeeks}-week streak
            </p>
            <ol className="grid grid-cols-7 gap-1 text-center text-xs">
              {overview.week.map((day) => {
                const done = logged.has(day.date);
                return (
                  <li
                    key={day.date}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md py-1.5",
                      day.date === today && "ring-primary ring-1",
                    )}
                    title={day.routineName ?? (day.isRestOverride ? "Rest" : "Nothing planned")}
                  >
                    <span className="text-muted-foreground">
                      {DAY.format(parseIsoDate(day.date))}
                    </span>
                    <span
                      aria-label={done ? "trained" : day.routineName ? "planned" : "free"}
                      className={cn(
                        "size-3 rounded-full",
                        done ? "bg-primary" : day.routineName ? "ring-primary ring-1" : "bg-muted",
                      )}
                    />
                  </li>
                );
              })}
            </ol>
            {overview.bodyweight && (
              <p className="text-muted-foreground mt-3 text-sm tabular-nums">
                Body weight{" "}
                {formatWeight(overview.bodyweight.weightKg, overview.settings.weightUnit)} (
                {overview.bodyweight.date})
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Insights</CardTitle>
            {overview.insights.length > 4 && (
              <span className="text-muted-foreground text-sm">
                {overview.insights.length} total
              </span>
            )}
          </CardHeader>
          <CardContent>
            <GymInsights insights={overview.insights} limit={6} />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Personal records this week</CardTitle>
          </CardHeader>
          <CardContent>
            {overview.recentRecords.length === 0 ? (
              <p className="text-muted-foreground text-sm">No new records in the last 7 days.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {overview.recentRecords.slice(0, 8).map((r) => (
                  <li
                    key={`${r.exerciseId}-${r.type}-${r.workoutId}-${r.context}`}
                    className="flex justify-between gap-3"
                  >
                    <Link href={`/health/gym/library/${r.exerciseId}`} className="hover:underline">
                      {r.exerciseName}
                    </Link>
                    <span className="text-muted-foreground tabular-nums">
                      {RECORD_LABELS[r.type]}: {r.context}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base font-medium">Recent workouts</CardTitle>
            <Link
              href="/health/gym/history"
              className="text-primary text-sm underline-offset-4 hover:underline"
            >
              All
            </Link>
          </CardHeader>
          <CardContent>
            {overview.recent.length === 0 ? (
              <p className="text-muted-foreground text-sm">No finished workouts yet.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {overview.recent.map((w) => (
                  <li key={w.id} className="flex justify-between gap-3">
                    <Link href={`/health/gym/history/${w.id}`} className="hover:underline">
                      {w.name}
                    </Link>
                    <span className="text-muted-foreground tabular-nums">
                      {w.date} · {w.setsCompleted} sets ·{" "}
                      {formatWeight(w.tonnageKg, overview.settings.weightUnit)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
