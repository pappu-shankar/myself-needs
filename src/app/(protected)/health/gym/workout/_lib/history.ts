import type { E1rmFormula, ExerciseMode, SetKind, WeightUnit } from "@/modules/health/types";
import type { ExerciseSession, SetRecord } from "@/modules/health/engine/types";
import { estimate1rm, isWorkSet } from "@/modules/health/engine/e1rm";
import { formatDuration, roundTo, toDisplayWeight } from "@/modules/health/engine/units";
import { speedAndPace } from "./format";

/**
 * Past sessions as the live logger needs them: "what did I do last time" per
 * set, and enough of the past to tell a new record from an old one.
 */

/** The most recent session in which anything was actually done (oldest-first input). */
export function lastPerformedSession(sessions: readonly ExerciseSession[]): ExerciseSession | null {
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].sets.some((s) => s.completed)) return sessions[i];
  }
  return null;
}

/**
 * The previous session's set matching `sets[index]`: warm-ups line up with
 * warm-ups and work sets with work sets, by their order within that group —
 * so adding warm-ups today doesn't shift "Last: 80 × 5" onto the wrong row.
 */
export function previousSetFor(
  session: ExerciseSession | null,
  sets: ReadonlyArray<{ kind: SetKind }>,
  index: number,
): SetRecord | null {
  if (!session || index < 0 || index >= sets.length) return null;
  const warm = sets[index].kind === "warmup";
  const ordinal = sets.slice(0, index).filter((s) => (s.kind === "warmup") === warm).length;
  const candidates = session.sets.filter((s) => s.completed && (s.kind === "warmup") === warm);
  return candidates[ordinal] ?? null;
}

const numberFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

/**
 * One set in a few characters: "80 × 5", "+10 × 8", "12 reps", "0:45 @ 10",
 * "30:00 · 5 km · 10 km/h · 6:00 /km". Weights are shown in `weightUnit`
 * (stored kg); `units` adds the unit for read-only lists ("80 kg × 5").
 */
export function formatSetBrief(
  set: Pick<SetRecord, "weightKg" | "reps" | "durationSec" | "distanceKm">,
  mode: ExerciseMode,
  isBodyweight: boolean,
  { units = false, weightUnit = "kg" }: { units?: boolean; weightUnit?: WeightUnit } = {},
): string {
  const kg = (value: number) => numberFormat.format(toDisplayWeight(value, weightUnit));
  const unit = units ? ` ${weightUnit}` : "";
  const w = set.weightKg;
  if (mode === "time") {
    const hold = set.durationSec !== null ? formatDuration(set.durationSec) : "—";
    if (!w) return hold;
    return `${hold} ${isBodyweight ? `+${kg(w)}${unit}` : `@ ${kg(w)}${unit}`}`;
  }
  if (mode === "cardio") {
    const parts = [
      set.durationSec !== null ? formatDuration(set.durationSec) : null,
      set.distanceKm !== null ? `${numberFormat.format(roundTo(set.distanceKm, 2))} km` : null,
      speedAndPace(set.distanceKm, set.durationSec),
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "—";
  }
  const reps = set.reps ?? 0;
  if (isBodyweight)
    return w ? `+${kg(w)}${unit} × ${reps}` : `${reps} ${reps === 1 ? "rep" : "reps"}`;
  if (w === null) return `${reps} ${reps === 1 ? "rep" : "reps"}`;
  return `${kg(w)}${unit} × ${reps}`;
}

/**
 * Shrinks a long history to what the client needs, losslessly for
 * `newRecords`: the last performed session whole (for "Last: …"), plus one
 * synthetic session holding only the older work sets that could still be a
 * record to beat — each single best (e1RM, weight, set volume, hold,
 * distance) and every set on the weight/reps frontier. Every other set is
 * beaten on both weight and reps by one that is kept, so no record check can
 * change. Keeps the logger's payload small however long the history is.
 */
export function condenseHistory(
  sessions: readonly ExerciseSession[],
  formula: E1rmFormula,
): ExerciseSession[] {
  if (sessions.length === 0) return [];
  const last = lastPerformedSession(sessions) ?? sessions[sessions.length - 1];
  const older = sessions.filter((s) => s !== last).flatMap((s) => s.sets.filter(isWorkSet));
  if (older.length === 0) return [last];

  const keep = new Set<SetRecord>();
  const keepBest = (score: (set: SetRecord) => number | null) => {
    let top: SetRecord | null = null;
    let topScore = 0;
    for (const set of older) {
      const value = score(set);
      if (value !== null && value > topScore) {
        top = set;
        topScore = value;
      }
    }
    if (top) keep.add(top);
  };
  keepBest((s) =>
    s.weightKg !== null && s.reps !== null ? estimate1rm(s.weightKg, s.reps, formula) : null,
  );
  keepBest((s) => s.weightKg);
  keepBest((s) => (s.weightKg ?? 0) * (s.reps ?? 0));
  keepBest((s) => s.durationSec);
  keepBest((s) => s.distanceKm);

  // Weight/reps frontier: heaviest first; keep each set with more reps than any heavier one.
  const byLoad = [...older].sort(
    (a, b) => (b.weightKg ?? 0) - (a.weightKg ?? 0) || (b.reps ?? 0) - (a.reps ?? 0),
  );
  let mostReps = -1;
  for (const set of byLoad) {
    if ((set.reps ?? 0) > mostReps) {
      mostReps = set.reps ?? 0;
      keep.add(set);
    }
  }

  const summary: ExerciseSession = {
    workoutId: 0,
    date: sessions[0].date,
    target: null,
    sets: older.filter((set) => keep.has(set)),
  };
  return [summary, last];
}
