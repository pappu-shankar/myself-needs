import { formatDuration, formatWeight } from "@/modules/health/engine/units";
import { SET_KIND_LABELS, type ExerciseMode, type SetKind } from "@/modules/health/types";
import type { WeightUnit } from "@/modules/health/gym-types";
import { Badge } from "@/components/ui/badge";

export interface PreviewSet {
  kind: SetKind;
  weightKg: number | null;
  reps: number | null;
  durationSec: number | null;
  distanceKm: number | null;
}

export interface PreviewEntry {
  id: number;
  name: string;
  mode: ExerciseMode;
  isBodyweight: boolean;
  sets: PreviewSet[];
  reason: string;
}

/** "60 kg × 8", "45 s hold"-style text for one planned set. */
export function formatPlannedSet(
  set: PreviewSet,
  mode: ExerciseMode,
  isBodyweight = false,
  unit: WeightUnit = "kg",
): string {
  if (mode === "cardio") {
    const parts: string[] = [];
    if (set.durationSec) parts.push(formatDuration(set.durationSec));
    if (set.distanceKm) parts.push(`${set.distanceKm} km`);
    return parts.join(" · ") || "Cardio";
  }
  if (mode === "time") {
    const time = set.durationSec ? formatDuration(set.durationSec) : "?";
    return set.weightKg ? `${time} @ ${formatWeight(set.weightKg, unit)}` : time;
  }
  if (isBodyweight) {
    return set.weightKg
      ? `+${formatWeight(set.weightKg, unit)} × ${set.reps ?? "?"}`
      : `${set.reps ?? "?"} reps`;
  }
  // No load yet (a fresh template): the reason line asks for a starting weight.
  return set.weightKg
    ? `${formatWeight(set.weightKg, unit)} × ${set.reps ?? "?"}`
    : `${set.reps ?? "?"} reps`;
}

/** What the next session will ask for, per exercise, with the reason for each number. */
export function SessionPreview({
  entries,
  weightUnit = "kg",
}: {
  entries: PreviewEntry[];
  weightUnit?: WeightUnit;
}) {
  if (entries.length === 0) {
    return <p className="text-muted-foreground text-sm">Add exercises to see the next session.</p>;
  }
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      {entries.map((entry) => (
        <li key={entry.id} className="border-border border-b pb-3 last:border-b-0 last:pb-0">
          <p className="font-medium">{entry.name}</p>
          <ul className="m-0 mt-1 flex list-none flex-wrap gap-1.5 p-0">
            {entry.sets.map((set, i) => (
              <li key={i}>
                <Badge variant="secondary" className="tabular-nums">
                  {set.kind === "warmup" && (
                    <span className="text-muted-foreground">{SET_KIND_LABELS.warmup}</span>
                  )}
                  {set.kind === "amrap" && <span>{SET_KIND_LABELS.amrap}</span>}
                  {formatPlannedSet(set, entry.mode, entry.isBodyweight, weightUnit)}
                  {set.kind === "amrap" && "+"}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-1 text-sm">{entry.reason}</p>
        </li>
      ))}
    </ol>
  );
}
