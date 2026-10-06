import type { E1rmFormula, ExerciseMode, WeightUnit } from "../gym-types";
import { estimate1rm, isWorkSet } from "./e1rm";
import type { ExerciseSession, PersonalRecord, PrType, SetRecord } from "./types";
import { formatDuration, formatWeight, roundTo } from "./units";

/**
 * Personal records — derived from the log every time, never stored, so fixing
 * a mistyped set fixes the record with it.
 *
 * Which records apply depends on how the exercise is logged:
 * - loaded reps: e1RM, heaviest, best set volume, most reps at a weight
 * - bodyweight reps: most reps at a weight (0 = bodyweight, else added load) —
 *   "heaviest push-up" means nothing
 * - timed holds: longest hold
 * - cardio: longest distance
 *
 * Only completed, non-warm-up sets count.
 */

export interface RecordOptions {
  formula: E1rmFormula;
  mode: ExerciseMode;
  isBodyweight: boolean;
  /** Unit for the human-readable `context`; default kg. */
  weightUnit?: WeightUnit;
}

/** One performed set, tagged with where it happened; `order` breaks date ties. */
interface SetPoint {
  set: SetRecord;
  date: string;
  workoutId: number;
  order: number;
}

function workSetsOf(sessions: readonly ExerciseSession[]): SetPoint[] {
  const points: SetPoint[] = [];
  for (const session of sessions) {
    for (const set of session.sets) {
      if (isWorkSet(set)) {
        points.push({
          set,
          date: session.date,
          workoutId: session.workoutId,
          order: points.length,
        });
      }
    }
  }
  return points;
}

function setContext(
  weightKg: number,
  reps: number,
  isBodyweight: boolean,
  unit: WeightUnit = "kg",
): string {
  if (!isBodyweight) return `${formatWeight(weightKg, unit)} × ${reps}`;
  return weightKg > 0 ? `+${formatWeight(weightKg, unit)} × ${reps}` : `${reps} reps`;
}

/** Highest `score` wins; ties keep the earliest set — that is when the record was set. */
function best(
  type: PrType,
  exerciseId: number,
  points: readonly SetPoint[],
  score: (set: SetRecord) => number | null,
  context: (set: SetRecord) => string,
): PersonalRecord | null {
  let top: { point: SetPoint; value: number } | null = null;
  for (const point of points) {
    const value = score(point.set);
    if (value !== null && value > 0 && (top === null || value > top.value)) top = { point, value };
  }
  if (!top) return null;
  return {
    type,
    exerciseId,
    value: top.value,
    context: context(top.point.set),
    date: top.point.date,
    workoutId: top.point.workoutId,
  };
}

/** Load as the records see it: bodyweight sets log added load, so a blank is 0. */
function loadOf(set: SetRecord, isBodyweight: boolean): number | null {
  if (set.weightKg === null) return isBodyweight ? 0 : null;
  return set.weightKg;
}

interface RepPoint {
  point: SetPoint;
  load: number;
  reps: number;
}

/** Sets with a usable (weight, reps) pair; loaded lifts need a real load. */
function repPoints(points: readonly SetPoint[], isBodyweight: boolean): RepPoint[] {
  const out: RepPoint[] = [];
  for (const point of points) {
    const load = loadOf(point.set, isBodyweight);
    const reps = point.set.reps;
    if (load === null || reps === null || reps < 1) continue;
    if (isBodyweight ? load >= 0 : load > 0) out.push({ point, load, reps });
  }
  return out;
}

/**
 * Rep records: every set that no other set beats on both weight and reps (the
 * Pareto frontier), heaviest first. 100 × 5, 90 × 8 and 80 × 10 are all
 * records; 85 × 7 is not once 90 × 8 exists. Same weight and reps: the earliest
 * set holds the record.
 */
function repFrontier(points: readonly SetPoint[], isBodyweight: boolean): RepPoint[] {
  const sorted = repPoints(points, isBodyweight).sort(
    (a, b) => b.load - a.load || b.reps - a.reps || a.point.order - b.point.order,
  );
  const frontier: RepPoint[] = [];
  let mostReps = 0;
  for (const candidate of sorted) {
    if (candidate.reps <= mostReps) continue;
    mostReps = candidate.reps;
    frontier.push(candidate);
  }
  return frontier;
}

function repRecord(
  exerciseId: number,
  rep: RepPoint,
  isBodyweight: boolean,
  unit: WeightUnit = "kg",
): PersonalRecord {
  return {
    type: "most_reps_at_weight",
    exerciseId,
    value: rep.reps,
    context: setContext(rep.load, rep.reps, isBodyweight, unit),
    date: rep.point.date,
    workoutId: rep.point.workoutId,
  };
}

function singleRecords(
  exerciseId: number,
  points: readonly SetPoint[],
  opts: RecordOptions,
): PersonalRecord[] {
  const out: Array<PersonalRecord | null> = [];
  if (opts.mode === "time") {
    out.push(
      best(
        "longest_hold",
        exerciseId,
        points,
        (set) => set.durationSec,
        (set) =>
          `${formatDuration(set.durationSec ?? 0)} hold` +
          (set.weightKg ? ` with ${formatWeight(set.weightKg, opts.weightUnit)}` : ""),
      ),
    );
  } else if (opts.mode === "cardio") {
    out.push(
      best(
        "longest_distance",
        exerciseId,
        points,
        (set) => (set.distanceKm === null ? null : roundTo(set.distanceKm, 2)),
        (set) =>
          `${roundTo(set.distanceKm ?? 0, 2)} km` +
          (set.durationSec ? ` in ${formatDuration(set.durationSec)}` : ""),
      ),
    );
  } else if (!opts.isBodyweight) {
    const loaded = repPoints(points, false).map((rep) => rep.point);
    const context = (set: SetRecord) =>
      setContext(set.weightKg ?? 0, set.reps ?? 0, false, opts.weightUnit);
    out.push(
      best(
        "e1rm",
        exerciseId,
        loaded,
        (set) => estimate1rm(set.weightKg ?? 0, set.reps ?? 0, opts.formula),
        context,
      ),
      best("heaviest", exerciseId, loaded, (set) => set.weightKg, context),
      best(
        "best_set_volume",
        exerciseId,
        loaded,
        (set) => roundTo((set.weightKg ?? 0) * (set.reps ?? 0), 1),
        context,
      ),
    );
  }
  return out.filter((record): record is PersonalRecord => record !== null);
}

/**
 * Current best records for one exercise across `sessions`. One record per
 * single-valued type, plus every rep record on the weight/reps frontier for
 * reps-mode work (see repFrontier).
 */
export function personalRecords(
  exerciseId: number,
  sessions: readonly ExerciseSession[],
  opts: RecordOptions,
): PersonalRecord[] {
  const points = workSetsOf(sessions);
  const records = singleRecords(exerciseId, points, opts);
  if (opts.mode === "reps") {
    for (const rep of repFrontier(points, opts.isBodyweight)) {
      records.push(repRecord(exerciseId, rep, opts.isBodyweight, opts.weightUnit));
    }
  }
  return records;
}

/**
 * Records `session` sets that strictly beat everything in `history` (which
 * must not contain `session`) — live PR badges and the finish summary. With no
 * history every best is, trivially, a record. A rep record is more reps at the
 * same or a heavier weight than ever before.
 */
export function newRecords(
  exerciseId: number,
  history: readonly ExerciseSession[],
  session: ExerciseSession,
  opts: RecordOptions,
): PersonalRecord[] {
  const before = workSetsOf(history);
  const current = workSetsOf([session]);
  const previous = new Map(singleRecords(exerciseId, before, opts).map((r) => [r.type, r.value]));
  const records = singleRecords(exerciseId, current, opts).filter((record) => {
    const prior = previous.get(record.type);
    return prior === undefined || record.value > prior;
  });
  if (opts.mode === "reps") {
    const earlier = repPoints(before, opts.isBodyweight);
    for (const rep of repFrontier(current, opts.isBodyweight)) {
      const bestBefore = Math.max(
        0,
        ...earlier.filter((e) => e.load >= rep.load).map((e) => e.reps),
      );
      if (rep.reps > bestBefore)
        records.push(repRecord(exerciseId, rep, opts.isBodyweight, opts.weightUnit));
    }
  }
  return records;
}
