import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import {
  getActiveProgram,
  getGymSettings,
  getRoutine,
  getTrainingMaxSuggestion,
  latestTrainingMaxes,
  listPrograms,
  listRoutines,
  listTrainingMaxes,
  programContext,
  type TrainingMax,
} from "@/modules/health";
import { formatWeight } from "@/modules/health/engine/units";
import { TM_FACTOR, tmIncrementKg } from "@/modules/health/engine/wendler";
import { PROGRAM_KIND_LABELS } from "@/modules/health/types";
import { todayIso } from "@/lib/dates";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ActiveProgramActions } from "./active-program-actions";
import { DeleteProgramButton } from "./confirm-delete-button";
import { ProgramForm } from "./program-form";
import { blockWeekNotes, weekProgress, wendlerWeekLines } from "./program-helpers";
import { TrainingMaxSection, type LiftOption, type TmSuggestion } from "./training-max-section";

export const metadata: Metadata = {
  title: "Programs — Gym — Personal Life OS",
};

/** Lifts that routine entries run through a 5/3/1 scheme, by exercise. */
function wendlerLifts(): LiftOption[] {
  const lifts = new Map<number, string>();
  for (const routine of listRoutines({ includeArchived: true })) {
    for (const entry of getRoutine(routine.id).entries) {
      if (entry.scheme.startsWith("wendler")) lifts.set(entry.exerciseId, entry.exercise.name);
    }
  }
  return [...lifts]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export default async function GymProgramsPage() {
  await requireUser();
  const today = todayIso();
  const { weightUnit } = getGymSettings();
  const active = getActiveProgram();
  const context = programContext(active, today);
  const past = listPrograms().filter((p) => p.status !== "active");

  const latest = latestTrainingMaxes();
  const lifts = wendlerLifts();
  const history: Record<number, TrainingMax[]> = {};
  for (const tm of latest) history[tm.exerciseId] = listTrainingMaxes(tm.exerciseId);

  const suggestions: Record<number, TmSuggestion> = {};
  for (const id of new Set([...lifts.map((l) => l.id), ...latest.map((t) => t.exerciseId)])) {
    const suggestion = getTrainingMaxSuggestion(id);
    if (suggestion) suggestions[id] = suggestion;
  }

  const progress = active && context ? weekProgress(context.week, active.weeks) : null;

  return (
    <>
      <PageHeader
        title="Programs"
        description="Training blocks and 5/3/1 cycles laid over your weekly plan."
      />

      <div className="flex flex-col gap-8">
        <section aria-labelledby="active-heading">
          <h2 id="active-heading" className="mb-3 text-lg font-medium">
            Active program
          </h2>
          {!active ? (
            <EmptyState
              title="No program running"
              description="Your routines run as written. Start a block or 5/3/1 cycle below to periodize them."
            />
          ) : (
            <Card className="gap-3 px-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium">{active.name}</h3>
                  <p className="text-muted-foreground text-sm">
                    Started {active.startDate} · {active.weeks} weeks planned
                  </p>
                </div>
                <Badge variant="secondary">{PROGRAM_KIND_LABELS[active.kind]}</Badge>
              </div>
              {context && progress ? (
                <>
                  <p className="font-medium">{context.label}</p>
                  <div>
                    <div
                      role="progressbar"
                      aria-label="Program progress"
                      aria-valuemin={0}
                      aria-valuemax={progress.total}
                      aria-valuenow={progress.current}
                      aria-valuetext={`Week ${progress.current} of ${progress.total}`}
                      className="bg-muted h-2 overflow-hidden rounded-full"
                    >
                      <div
                        className="bg-primary h-full"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm tabular-nums">
                      Week {progress.current} of {progress.total}
                      {context.week > active.weeks ? " — past the planned end" : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">This week</p>
                    {context.modifiers ? (
                      <ul className="m-0 list-disc pl-5 text-sm">
                        {blockWeekNotes(context.modifiers).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : context.wendler ? (
                      <p className="text-sm tabular-nums">
                        Main sets: {wendlerWeekLines(context.wendler.week).join(", ")} of your
                        training max
                        {context.wendler.week === 4 ? " (deload)" : ""}.
                      </p>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Starts on {active.startDate}. Until then your routines run as written.
                </p>
              )}
              <ActiveProgramActions id={active.id} name={active.name} />
            </Card>
          )}
        </section>

        <section aria-labelledby="new-program-heading">
          <h2 id="new-program-heading" className="mb-3 text-lg font-medium">
            Start a program
          </h2>
          <Card className="px-4">
            <ProgramForm today={today} hasActive={Boolean(active)} />
          </Card>
        </section>

        <section aria-labelledby="tm-heading">
          <h2 id="tm-heading" className="mb-1 text-lg font-medium">
            Training maxes
          </h2>
          <p className="text-muted-foreground mb-3 text-sm">
            5/3/1 percentages are taken from a training max — about {Math.round(TM_FACTOR * 100)} %
            of what you could lift for one rep. After each four-week cycle the app looks at your
            AMRAP sets: hit the required reps and the max goes up (about{" "}
            {formatWeight(tmIncrementKg("legs", weightUnit), weightUnit)} lower body,{" "}
            {formatWeight(tmIncrementKg("chest", weightUnit), weightUnit)} upper body), miss them
            and it holds, and a clear miss resets it 10 % lower. Your saved value is the starting
            point; those bumps are worked out from your logged sets.
          </p>
          <TrainingMaxSection
            latest={latest}
            history={history}
            lifts={lifts}
            suggestions={suggestions}
            today={today}
            weightUnit={weightUnit}
          />
        </section>

        <section aria-labelledby="past-heading">
          <h2 id="past-heading" className="mb-3 text-lg font-medium">
            Past programs
          </h2>
          {past.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing here yet.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {past.map((p) => (
                <li
                  key={p.id}
                  className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-2"
                >
                  <div>
                    <span className="font-medium">{p.name}</span>
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {" · "}
                      {PROGRAM_KIND_LABELS[p.kind]} · {p.startDate}
                      {p.endedAt ? ` to ${p.endedAt}` : ""} · {p.status}
                    </span>
                  </div>
                  <DeleteProgramButton id={p.id} name={p.name} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
