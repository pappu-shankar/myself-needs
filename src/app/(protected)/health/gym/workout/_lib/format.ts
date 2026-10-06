import type { CameraMovement, ExerciseMode, WeightUnit } from "@/modules/health/types";
import type { EntryTarget, PersonalRecord, PlannedSet } from "@/modules/health/engine/types";
import {
  formatDuration,
  formatPace,
  formatWeight,
  paceSecPerKm,
  roundTo,
  speedKmh,
} from "@/modules/health/engine/units";
import { parseIsoDate } from "@/lib/dates";

/** Display helpers shared by the live workout and history pages. */

/** Catalog names are lower case ("barbell bench press"). */
export function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

const speedFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

/**
 * Average speed and pace of a cardio effort: "12 km/h · 5:00 /km". Null
 * unless both a distance and a duration are known.
 */
export function speedAndPace(distanceKm: number | null, durationSec: number | null): string | null {
  const speed = speedKmh(distanceKm, durationSec);
  const pace = paceSecPerKm(distanceKm, durationSec);
  if (speed === null || pace === null) return null;
  return `${speedFormat.format(speed)} km/h · ${formatPace(pace)}`;
}

/**
 * PR badge text: "e1RM 105 kg", "Most reps: 100 kg × 6", "Longest hold 1:30".
 * Record values are stored in kg; `context` already comes in the user's unit.
 */
export function recordLabel(
  record: Pick<PersonalRecord, "type" | "value" | "context">,
  unit: WeightUnit = "kg",
): string {
  switch (record.type) {
    case "e1rm":
      return `e1RM ${formatWeight(record.value, unit)}`;
    case "heaviest":
      return `Heaviest ${formatWeight(record.value, unit)}`;
    case "best_set_volume":
      return `Best set ${formatWeight(record.value, unit)}`;
    case "most_reps_at_weight":
      return `Most reps: ${record.context}`;
    case "longest_hold":
      return `Longest hold ${formatDuration(record.value)}`;
    case "longest_distance":
      return `Longest distance ${roundTo(record.value, 2)} km`;
  }
}

function load(weightKg: number | null, isBodyweight: boolean, unit: WeightUnit): string {
  if (isBodyweight) return weightKg ? `+${formatWeight(weightKg, unit)}` : "";
  return weightKg ? formatWeight(weightKg, unit) : "";
}

/**
 * "3 × 5 @ 100 kg", "3 × 8 per side · +10 lb", "3 × 0:45",
 * "30:00 · 5 km · 10 km/h · 6:00 /km".
 */
export function targetSummary(
  target: EntryTarget,
  {
    perSide,
    isBodyweight,
    weightUnit = "kg",
  }: { perSide: boolean; isBodyweight: boolean; weightUnit?: WeightUnit },
): string | null {
  const sets = target.sets ? `${target.sets} × ` : "";
  const extra = target.targetRpe !== null ? ` · RPE ${target.targetRpe}` : "";
  const side = perSide ? " per side" : "";
  if (target.mode === "cardio") {
    const parts = [
      target.durationSec !== null ? formatDuration(target.durationSec) : null,
      target.distanceKm !== null ? `${roundTo(target.distanceKm, 2)} km` : null,
      speedAndPace(target.distanceKm, target.durationSec),
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }
  const weight = load(target.weightKg, isBodyweight, weightUnit);
  const sep = isBodyweight ? " · " : " @ ";
  if (target.mode === "time") {
    if (target.durationSec === null) return null;
    return `${sets}${formatDuration(target.durationSec)}${side}${weight ? `${sep}${weight}` : ""}${extra}`;
  }
  if (target.reps === null) return weight ? `${sets}${weight}`.trim() : null;
  const reps =
    target.repsMin !== null && target.repsMin < target.reps
      ? `${target.repsMin}–${target.reps}`
      : String(target.reps);
  return `${sets}${reps}${side}${weight ? `${sep}${weight}` : ""}${extra}`;
}

function plannedOne(
  set: PlannedSet,
  mode: ExerciseMode,
  isBodyweight: boolean,
  unit: WeightUnit,
): string {
  if (mode === "cardio") {
    return (
      [
        set.durationSec !== null ? formatDuration(set.durationSec) : null,
        set.distanceKm !== null ? `${roundTo(set.distanceKm, 2)} km` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "—"
    );
  }
  const amount =
    mode === "time"
      ? set.durationSec !== null
        ? formatDuration(set.durationSec)
        : "—"
      : `${set.reps ?? "—"}${set.kind === "amrap" ? "+" : ""}`;
  const weight = load(set.weightKg, isBodyweight, unit);
  return weight ? `${amount} ${isBodyweight ? weight : `@ ${weight}`}` : amount;
}

/**
 * A planned session's sets in one line: "3 × 5 @ 100 kg" when the work sets
 * match, else each one ("5 @ 65 kg, 5 @ 75 kg, 5+ @ 85 kg"); warm-ups noted.
 */
export function describePlannedSets(
  sets: readonly PlannedSet[],
  mode: ExerciseMode,
  isBodyweight: boolean,
  unit: WeightUnit = "kg",
): string {
  const work = sets.filter((s) => s.kind !== "warmup");
  const warmups = sets.length - work.length;
  const each = work.map((s) => plannedOne(s, mode, isBodyweight, unit));
  const body =
    each.length === 0
      ? "No work sets"
      : each.every((text) => text === each[0])
        ? `${each.length} × ${each[0]}`
        : each.join(", ");
  return warmups ? `${body} (+${warmups} warm-up${warmups === 1 ? "" : "s"})` : body;
}

/** Local `YYYY-MM-DDTHH:mm:ss` → epoch ms, or null if malformed. */
export function parseLocalDateTime(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const [y, mo, d, h, mi, s] = match.slice(1).map((part) => Number(part ?? 0));
  const time = new Date(y, mo - 1, d, h, mi, s).getTime();
  return Number.isFinite(time) ? time : null;
}

/** Whole seconds since a local start time (0 before it or when unknown). */
export function elapsedSec(startedAt: string, now: number): number {
  const start = parseLocalDateTime(startedAt);
  return start === null ? 0 : Math.max(0, Math.floor((now - start) / 1000));
}

/** "45 min", "1 h 05 min", "—". */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes) || minutes < 0) {
    return "—";
  }
  const total = Math.round(minutes);
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)} h ${String(total % 60).padStart(2, "0")} min`;
}

/** "HH:mm" of a local date-time. */
export function clockTime(value: string | null): string | null {
  return value && value.length >= 16 ? value.slice(11, 16) : null;
}

const RULES: Array<[RegExp, CameraMovement]> = [
  [/jumping jack/, "jumping_jack"],
  [/lateral raise/, "lateral_raise"],
  [/pull[- ]?up|chin[- ]?up/, "pullup"],
  [/push[- ]?up|press[- ]?up/, "pushup"],
  [/lunge|split squat|step[- ]?up/, "lunge"],
  [/squat/, "squat"],
  [/deadlift|romanian|\brdl\b|good morning|hip hinge|kettlebell swing/, "hinge"],
  [/(overhead|shoulder|military|push) press/, "overhead_press"],
  [/curl/, "curl"],
];

/** The camera movement an exercise most likely is, from its name; undefined when unsure. */
export function guessMovement(exerciseName: string): CameraMovement | undefined {
  const name = exerciseName.toLowerCase();
  if (/leg curl|hamstring curl|nordic|wrist curl/.test(name)) return undefined;
  return RULES.find(([pattern]) => pattern.test(name))?.[1];
}

/** Row labels: work sets numbered 1, 2, …; warm-ups "W" (named "Warm-up 1" for screen readers). */
export function setLabels(
  sets: ReadonlyArray<{ kind: string }>,
): Array<{ label: string; name: string }> {
  return sets.map((set, index) => {
    const warm = set.kind === "warmup";
    const n = sets.slice(0, index + 1).filter((s) => (s.kind === "warmup") === warm).length;
    return warm ? { label: "W", name: `Warm-up ${n}` } : { label: String(n), name: `Set ${n}` };
  });
}

const longDate = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** "Sat, 4 Oct 2026" — the raw ISO string if it isn't a real date. */
export function formatLongDate(iso: string): string {
  try {
    return longDate.format(parseIsoDate(iso));
  } catch {
    return iso;
  }
}
