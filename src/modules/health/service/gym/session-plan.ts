import { nowLocalDateTime, todayIso } from "@/lib/dates";
import { DomainError } from "@/modules/core/errors";
import type {
  EntryTarget,
  ExercisePlan,
  ExerciseSession,
  PlannedSet,
  Prescription,
  WeekModifiers,
} from "../../engine/types";
import {
  applyPrescription,
  nextPrescription,
  plannedSetsFor,
} from "../../engine/progression";
import { autoregulatedPrescription } from "../../engine/rpe";
import {
  effectiveTrainingMax,
  tmIncrementKg,
  wendlerCycleWeek,
  wendlerSets,
} from "../../engine/wendler";
import { applyWeekModifiers, blockModifiers, programWeek } from "../../engine/periodization";
import { warmupSets } from "../../engine/warmup";
import { formatWeight, smallestStepKg } from "../../engine/units";
import type { WeightUnit } from "../../gym-types";
import { insertWarmupSets, getWorkoutEntryWithSets } from "../../db/queries/gym/session";
import { getRoutine, type RoutineEntry } from "./routines";
import { getGymSettings, type GymSettings } from "./settings";
import { getActiveProgram, type Program } from "./programs";
import { latestTrainingMaxes, type TrainingMax } from "./training-maxes";
import { getRecentSessionsByExercise } from "./history";
import { createWorkout, type NewWorkoutEntryInput, type WorkoutDetail } from "./workouts";
import { logBodyweight } from "./vitals";

/**
 * Composition: turns a routine into a ready-to-log session. Each entry's loads
 * come from exactly one source, in this order —
 *   1. a 5/3/1 scheme, when a 5/3/1 program is active and the lift has a training max;
 *   2. target-RPE autoregulation, when the entry has a target RPE;
 *   3. the entry's progression policy;
 * then an active training block's weekly modifiers (set ramp / deload) apply on
 * top of standard entries. Everything is derived from history at the moment
 * it's needed, so editing a routine or fixing a mistyped set immediately
 * changes the next prescription. See docs/prd/health/gym.md.
 */

/** How many past sessions per exercise feed a prescription (enough for stall counts and TM bumps). */
const HISTORY_PER_EXERCISE = 30;

export interface ProgramContext {
  program: Program;
  /** 1-based week since the program started. */
  week: number;
  /** Block modifiers for this week (block programs only). */
  modifiers: WeekModifiers | null;
  /** 5/3/1 position (wendler programs only). */
  wendler: { cycle: number; week: number } | null;
  label: string;
}

export interface PlannedEntry {
  entry: RoutineEntry;
  plan: ExercisePlan;
  prescription: Prescription;
  sets: PlannedSet[];
  target: EntryTarget;
  restSec: number;
}

export interface SessionPlan {
  routineId: number;
  routineName: string;
  date: string;
  program: ProgramContext | null;
  entries: PlannedEntry[];
}

export function programContext(program: Program | null, date: string): ProgramContext | null {
  if (!program || program.status !== "active") return null;
  const week = programWeek(program.startDate, date);
  if (week < 1) return null;
  if (program.kind === "block") {
    const modifiers = blockModifiers({
      week,
      weeks: program.weeks,
      setRampPerWeek: program.setRampPerWeek,
      deloadFinalWeek: program.deloadFinalWeek,
    });
    return {
      program,
      week,
      modifiers,
      wendler: null,
      label: `${program.name}: ${modifiers.label}`,
    };
  }
  const wendler = wendlerCycleWeek(program.startDate, date);
  if (!wendler) return null;
  const deload = wendler.week === 4 ? " (deload)" : "";
  return {
    program,
    week,
    modifiers: null,
    wendler,
    label: `${program.name}: cycle ${wendler.cycle}, week ${wendler.week}${deload}`,
  };
}

function toPlan(entry: RoutineEntry, weightUnit: WeightUnit): ExercisePlan {
  return {
    weightUnit,
    exerciseId: entry.exerciseId,
    bodyPart: entry.exercise.bodyPart,
    mode: entry.mode,
    sets: entry.sets,
    reps: entry.reps,
    repsMin: entry.repsMin,
    weightKg: entry.weightKg,
    durationSec: entry.durationSec,
    distanceKm: entry.distanceKm,
    perSide: entry.perSide,
    isBodyweight: entry.isBodyweight,
    policy: entry.effectivePolicy,
    incrementKg: entry.incrementKg,
    targetRpe: entry.targetRpe,
    scheme: entry.scheme,
  };
}

/** Percentage-based loads (5/3/1, deloads) round to the smallest plate jump: 2.5 kg or 5 lb. */
function roundingStep(plan: ExercisePlan): number {
  return smallestStepKg(plan.weightUnit ?? "kg");
}

/** The AMRAP results 5/3/1 bumps the training max from — derived from history, never stored. */
function amrapResults(
  history: readonly ExerciseSession[],
  programStart: string,
  sinceDate: string,
) {
  const results: Array<{
    date: string;
    week: number;
    weightKg: number;
    reps: number;
    requiredReps: number;
  }> = [];
  for (const session of history) {
    if (session.date < programStart || session.date < sinceDate) continue;
    const position = wendlerCycleWeek(programStart, session.date);
    const amrap = [...session.sets].reverse().find((s) => s.kind === "amrap" && s.completed);
    if (!position || !amrap || amrap.weightKg === null || amrap.reps === null) continue;
    results.push({
      date: session.date,
      week: position.week,
      weightKg: amrap.weightKg,
      reps: amrap.reps,
      requiredReps: session.target?.reps ?? 1,
    });
  }
  return results;
}

function wendlerEntry(
  plan: ExercisePlan,
  history: readonly ExerciseSession[],
  context: ProgramContext,
  tm: TrainingMax,
  date: string,
): { sets: PlannedSet[]; prescription: Prescription } {
  const step = roundingStep(plan);
  const unit = plan.weightUnit ?? "kg";
  const position = context.wendler!;
  const { tmKg, changes } = effectiveTrainingMax({
    baseTmKg: tm.trainingMaxKg,
    effectiveFrom: tm.effectiveFrom,
    programStart: context.program.startDate,
    today: date,
    bodyPart: plan.bodyPart,
    stepKg: step,
    weightUnit: unit,
    amrapResults: amrapResults(history, context.program.startDate, tm.effectiveFrom),
  });
  const sets = wendlerSets(plan.scheme, tmKg, position.week, step);
  const lastChange = changes[changes.length - 1];
  const tmNote = lastChange ? ` ${lastChange.reason}` : "";
  return {
    sets,
    prescription: {
      policy: plan.policy,
      kind: "program",
      reason: `5/3/1 cycle ${position.cycle}, week ${position.week} — training max ${formatWeight(tmKg, unit)} (+${formatWeight(tmIncrementKg(plan.bodyPart, unit), unit)} per cycle when the AMRAP is made).${tmNote}`,
    },
  };
}

function targetOf(
  plan: ExercisePlan,
  sets: readonly PlannedSet[],
  prescription: Prescription,
  targetRpe: number | null,
): EntryTarget {
  const working = sets.filter((s) => s.kind !== "warmup");
  const top = working.reduce<PlannedSet | null>(
    (best, s) => (best === null || (s.weightKg ?? 0) > (best.weightKg ?? 0) ? s : best),
    null,
  );
  const amrap = working.find((s) => s.kind === "amrap");
  return {
    mode: plan.mode,
    sets: working.length,
    // A session is judged against the reps it asked for: the AMRAP's minimum
    // for 5/3/1, the prescribed aim otherwise.
    reps:
      plan.scheme !== "standard"
        ? (amrap?.reps ?? top?.reps ?? null)
        : (prescription.reps ?? working[0]?.reps ?? plan.reps),
    repsMin: plan.repsMin,
    weightKg: top?.weightKg ?? plan.weightKg,
    durationSec: working[0]?.durationSec ?? plan.durationSec,
    distanceKm: working[0]?.distanceKm ?? plan.distanceKm,
    targetRpe,
  };
}

export function planEntry(
  entry: RoutineEntry,
  history: readonly ExerciseSession[],
  context: ProgramContext | null,
  trainingMaxes: ReadonlyMap<number, TrainingMax>,
  settings: GymSettings,
  date: string,
): PlannedEntry {
  const plan = toPlan(entry, settings.weightUnit);
  const last = history[history.length - 1] ?? null;
  let sets: PlannedSet[];
  let prescription: Prescription;
  let targetRpe = plan.targetRpe;

  const tm = trainingMaxes.get(plan.exerciseId);
  if (plan.scheme !== "standard" && context?.wendler && tm) {
    ({ sets, prescription } = wendlerEntry(plan, history, context, tm, date));
  } else {
    prescription =
      plan.targetRpe !== null
        ? autoregulatedPrescription(plan, history, { today: date, formula: settings.e1rmFormula })
        : nextPrescription(plan, history);
    sets = applyPrescription(plannedSetsFor(plan, last), prescription);
    if (plan.scheme !== "standard") {
      const why = !context?.wendler
        ? "No 5/3/1 program is active"
        : `Set a training max for ${entry.exercise.name}`;
      prescription = {
        ...prescription,
        reason: `${why}, so this uses its normal targets. ${prescription.reason}`,
      };
    }
  }

  if (context?.modifiers && plan.scheme === "standard" && plan.mode !== "cardio") {
    const m = context.modifiers;
    sets = applyWeekModifiers(sets, m, roundingStep(plan));
    if (targetRpe !== null) targetRpe = Math.min(10, Math.max(5, targetRpe + m.rpeDelta));
    if (m.isDeload || m.setDelta !== 0) {
      prescription = { ...prescription, reason: `${prescription.reason} ${m.label}.` };
    }
  }

  return {
    entry,
    plan,
    prescription,
    sets,
    target: targetOf(plan, sets, prescription, targetRpe),
    restSec: entry.restSec ?? settings.defaultRestSec,
  };
}

/** What a routine would ask of you on `date` — the hub's preview and the start of every session. */
export function buildSessionPlan(routineId: number, date: string = todayIso()): SessionPlan {
  const routine = getRoutine(routineId);
  if (routine.archivedAt)
    throw new DomainError("That routine is archived — restore it to train it.");
  const settings = getGymSettings();
  const context = programContext(getActiveProgram(), date);
  const trainingMaxes = new Map(latestTrainingMaxes(date).map((tm) => [tm.exerciseId, tm]));
  const histories = getRecentSessionsByExercise(
    routine.entries.map((e) => e.exerciseId),
    HISTORY_PER_EXERCISE,
  );
  return {
    routineId: routine.id,
    routineName: routine.name,
    date,
    program: context,
    entries: routine.entries.map((entry) =>
      planEntry(
        entry,
        histories.get(entry.exerciseId) ?? [],
        context,
        trainingMaxes,
        settings,
        date,
      ),
    ),
  };
}

export interface StartWorkoutInput {
  /** Null/undefined = an empty "Quick workout". */
  routineId?: number | null;
  date?: string;
  /** Optional weigh-in, saved as a regular body-weight entry. */
  bodyweightKg?: number | null;
}

/** Opens a session from a routine's prescriptions (or empty), optionally logging a weigh-in first. */
export function startWorkout(input: StartWorkoutInput = {}): WorkoutDetail {
  const date = input.date ?? todayIso();
  const plan = input.routineId ? buildSessionPlan(input.routineId, date) : null;
  const entries: NewWorkoutEntryInput[] = (plan?.entries ?? []).map((p) => ({
    exerciseId: p.plan.exerciseId,
    routineExerciseId: p.entry.id,
    mode: p.plan.mode,
    supersetGroup: p.entry.supersetGroup,
    perSide: p.plan.perSide,
    isBodyweight: p.plan.isBodyweight,
    target: p.target,
    restSec: p.restSec,
    progressionPolicy: p.plan.policy,
    prescriptionKind: p.prescription.kind,
    prescriptionReason: p.prescription.reason,
    notes: p.entry.notes,
    sets: p.sets,
  }));
  const workout = createWorkout({
    date,
    startedAt: nowLocalDateTime(),
    routineId: plan?.routineId ?? null,
    name: plan?.routineName ?? "Quick workout",
    programId: plan?.program?.program.id ?? null,
    programWeek: plan?.program?.week ?? null,
    entries,
  });
  // After the workout exists, so a rejected start (another session open) logs nothing.
  if (input.bodyweightKg != null) logBodyweight(date, input.bodyweightKg);
  return workout;
}

/** Adds a warm-up ramp before an entry's first working set, from its working load and the bar. */
export function addWarmupSets(workoutExerciseId: number): number {
  const entry = getWorkoutEntryWithSets(workoutExerciseId);
  if (!entry) throw new DomainError("That exercise isn't in the workout anymore.");
  if (entry.sets.some((s) => s.kind === "warmup")) {
    throw new DomainError("This exercise already has warm-up sets.");
  }
  const working = entry.sets.find((s) => s.kind !== "warmup");
  if (!working || !working.weightKg) {
    throw new DomainError("Set a working weight first — warm-ups ramp up to it.");
  }
  const settings = getGymSettings();
  const sets = warmupSets({
    workingKg: working.weightKg,
    workingReps: working.reps ?? 5,
    barKg: settings.barWeightKg,
    stepKg: smallestStepKg(settings.weightUnit),
    isBodyweight: entry.isBodyweight,
  });
  if (sets.length === 0)
    throw new DomainError("This load is light enough that warm-ups aren't needed.");
  insertWarmupSets(workoutExerciseId, sets);
  return sets.length;
}
