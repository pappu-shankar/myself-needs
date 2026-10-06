import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Play, Trophy } from "lucide-react";
import { requireUser } from "@/modules/core/session/guard";
import { DomainError } from "@/modules/core/errors";
import { getGymSettings, getWorkoutSummary, type WorkoutSummary } from "@/modules/health";
import type { Muscle } from "@/modules/health/types";
import { formatWeight, roundTo } from "@/modules/health/engine/units";
import { toScale } from "@/modules/health/engine/effort";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BodyMap, MuscleChips } from "../../_components/body-map";
import {
  capitalize,
  clockTime,
  formatLongDate,
  formatMinutes,
  recordLabel,
} from "../../workout/_lib/format";
import { HistoryEntries } from "./history-entries";
import { WorkoutActions } from "./workout-actions";

export const metadata: Metadata = {
  title: "Workout summary — Gym — Personal Life OS",
};

function parseId(raw: string): number | null {
  return /^\d{1,9}$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
}

function loadSummary(id: number): WorkoutSummary | null {
  try {
    return getWorkoutSummary(id);
  } catch (err) {
    if (err instanceof DomainError) return null;
    throw err;
  }
}

export default async function WorkoutSummaryPage({
  params,
}: {
  params: Promise<{ workoutId: string }>;
}) {
  await requireUser();
  const id = parseId((await params).workoutId);
  if (id === null) notFound();
  const summary = loadSummary(id);
  if (!summary) notFound();
  const settings = getGymSettings();
  const { workout, effort, muscles } = summary;

  const start = clockTime(workout.startedAt);
  const end = clockTime(workout.finishedAt);
  const withRecords = summary.entries.filter((entry) => entry.records.length > 0);
  const firstTimers = summary.entries.filter((entry) => entry.firstTime && entry.setsCompleted > 0);
  const effortScale = settings.effortScale === "rpe" ? "rpe" : "rir";
  const avgEffort = toScale(effortScale, effort.avgRir);
  const values: Partial<Record<Muscle, number>> = {};
  for (const [muscle, load] of Object.entries(muscles.load) as [Muscle, number][]) {
    values[muscle] = roundTo(load, 1);
  }

  const stats = [
    {
      label: "Duration",
      value: workout.finishedAt ? formatMinutes(summary.minutes) : "In progress",
    },
    { label: "Sets", value: String(summary.setsCompleted) },
    { label: "Volume", value: formatWeight(summary.tonnageKg, settings.weightUnit) },
    {
      label: "Session effort",
      value: workout.sessionRpe !== null ? `${workout.sessionRpe}/10` : "Not rated",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/health/gym/history"
          className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          History
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{workout.name}</h1>
            <p className="text-muted-foreground mt-1 text-sm tabular-nums">
              <time dateTime={workout.date}>{formatLongDate(workout.date)}</time>
              {start && ` · ${start}${end ? `–${end}` : ""}`}
            </p>
          </div>
          <WorkoutActions
            workout={{
              id: workout.id,
              name: workout.name,
              date: workout.date,
              notes: workout.notes,
              sessionRpe: workout.sessionRpe,
            }}
          />
        </div>
      </div>

      {!workout.finishedAt && (
        <Link
          href="/health/gym/workout"
          className="bg-primary/10 hover:bg-primary/15 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium"
        >
          <Play className="size-4" aria-hidden="true" />
          This workout is still in progress — open the logger
        </Link>
      )}

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-card ring-foreground/10 rounded-xl p-3 ring-1">
            <dt className="text-muted-foreground text-xs font-medium">{stat.label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{stat.value}</dd>
          </div>
        ))}
      </dl>

      {workout.notes && (
        <p className="text-muted-foreground text-sm whitespace-pre-line">{workout.notes}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="flex items-center gap-2 text-base font-medium">
              <Trophy className="text-primary size-4" aria-hidden="true" />
              Personal records
            </h2>
          </CardTitle>
          <CardDescription>
            {summary.recordCount > 0
              ? `${summary.recordCount} new ${summary.recordCount === 1 ? "record" : "records"}, against everything logged before this session.`
              : "No new records this time — consistency counts too."}
          </CardDescription>
        </CardHeader>
        {(withRecords.length > 0 || firstTimers.length > 0) && (
          <CardContent className="flex flex-col gap-3">
            {withRecords.length > 0 && (
              <ul className="flex flex-col gap-3">
                {withRecords.map((entry) => (
                  <li key={entry.entryId} className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">{capitalize(entry.exerciseName)}</span>
                    <ul
                      className="flex flex-wrap gap-1.5"
                      aria-label={`${capitalize(entry.exerciseName)} records`}
                    >
                      {entry.records.map((record) => (
                        <li key={`${record.type}-${record.context}`}>
                          <Badge className="h-6 tabular-nums">
                            {recordLabel(record, settings.weightUnit)}
                            {record.type !== "most_reps_at_weight" && (
                              <span className="opacity-80"> · {record.context}</span>
                            )}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            {firstTimers.length > 0 && (
              <p className="text-muted-foreground text-sm">
                First time logging{" "}
                {firstTimers.map((entry) => capitalize(entry.exerciseName)).join(", ")} — this
                session is the baseline future records are measured against.
              </p>
            )}
          </CardContent>
        )}
      </Card>

      {muscles.worked.length > 0 && (
        <div className="flex flex-col gap-3">
          <BodyMap
            title="Muscles worked"
            description="Shaded by working sets, counting supporting muscles at half."
            levels={muscles.levels}
            figure={settings.sex ?? "male"}
            values={values}
            valueLabel="sets"
          />
          <MuscleChips muscles={muscles.missed} label="Not trained this session:" />
        </div>
      )}

      {effort.rated > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2 className="text-base font-medium">Effort</h2>
            </CardTitle>
            <CardDescription className="tabular-nums">
              {effort.rated} of {effort.done} working sets rated.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Average {effortScale.toUpperCase()}</dt>
                <dd className="text-lg font-semibold tabular-nums">{avgEffort ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Hard sets (≤ 3 in reserve)</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {effort.hard} of {effort.rated}
                </dd>
              </div>
            </dl>
            {avgEffort === null && (
              <p className="text-muted-foreground mt-2 text-xs">
                The average shows once at least 5 sets are rated.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <HistoryEntries
        entries={workout.entries}
        effortScale={settings.effortScale}
        weightUnit={settings.weightUnit}
      />
    </div>
  );
}
