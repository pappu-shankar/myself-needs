import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import { DomainError } from "@/modules/core/errors";
import { todayIso } from "@/lib/dates";
import {
  buildSessionPlan,
  getActiveWorkout,
  getGymSettings,
  getLatestBodyweight,
  getPlannedRoutineForDate,
  getRecentSessionsByExercise,
  listRoutines,
  type SessionPlan,
} from "@/modules/health";
import type { ExerciseSession } from "@/modules/health/engine/types";
import { PageHeader } from "@/components/ui/page-header";
import { condenseHistory } from "./_lib/history";
import { SessionPreview, type PreviewPlan } from "./session-preview";
import { StartWorkoutForm } from "./start-workout-form";
import { WorkoutLogger } from "./workout-logger";

export const metadata: Metadata = {
  title: "Workout — Gym — Personal Life OS",
};

/** How many past sessions per exercise feed "Last: …" and the live PR check. */
const HISTORY_SESSIONS = 200;

function toPreview(plan: SessionPlan): PreviewPlan {
  return {
    routineName: plan.routineName,
    programLabel: plan.program?.label ?? null,
    entries: plan.entries.map((p) => ({
      id: p.entry.id,
      name: p.entry.exercise.name,
      mode: p.plan.mode,
      isBodyweight: p.plan.isBodyweight,
      perSide: p.plan.perSide,
      supersetGroup: p.entry.supersetGroup,
      sets: p.sets,
      restSec: p.restSec,
      reason: p.prescription.reason,
    })),
  };
}

export default async function WorkoutPage() {
  await requireUser();
  const settings = getGymSettings();
  const active = getActiveWorkout();

  if (active) {
    const ids = [...new Set(active.entries.map((entry) => entry.exerciseId))];
    const histories: Record<number, ExerciseSession[]> = {};
    for (const [id, sessions] of getRecentSessionsByExercise(ids, HISTORY_SESSIONS)) {
      histories[id] = condenseHistory(sessions, settings.e1rmFormula);
    }
    return <WorkoutLogger workout={active} histories={histories} settings={settings} />;
  }

  const today = todayIso();
  const planned = getPlannedRoutineForDate(today);
  const routines = listRoutines().map((routine) => ({ id: routine.id, name: routine.name }));
  let preview: PreviewPlan | null = null;
  let planProblem: string | null = null;
  if (planned.routineId !== null) {
    try {
      preview = toPreview(buildSessionPlan(planned.routineId, today));
    } catch (err) {
      if (!(err instanceof DomainError)) throw err;
      planProblem = err.message;
    }
  }

  const description = planned.isRestOverride
    ? `Today is planned as a rest day${planned.note ? ` (${planned.note})` : ""} — you can still train.`
    : planned.routineName
      ? `Today's plan: ${planned.routineName}.`
      : "Nothing planned today — pick a routine or start an empty workout.";

  return (
    <>
      <PageHeader title="Workout" description={description} />
      {planProblem && <p className="text-muted-foreground mb-4 text-sm">{planProblem}</p>}
      <StartWorkoutForm
        routines={routines}
        plannedRoutineId={preview ? planned.routineId : null}
        askBodyweight={settings.askBodyweightOnStart}
        weightUnit={settings.weightUnit}
        latestBodyweight={settings.askBodyweightOnStart ? getLatestBodyweight() : null}
        preview={
          preview ? <SessionPreview plan={preview} weightUnit={settings.weightUnit} /> : null
        }
      />
    </>
  );
}
