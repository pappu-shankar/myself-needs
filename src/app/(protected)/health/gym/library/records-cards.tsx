import Link from "next/link";
import { formatDuration, formatWeight, roundTo } from "@/modules/health/engine/units";
import type { ExerciseOverview } from "@/modules/health";
import type { WeightUnit } from "@/modules/health/gym-types";
import { Card, CardContent } from "@/components/ui/card";

type PersonalRecord = ExerciseOverview["records"][number];

const LABELS: Record<PersonalRecord["type"], string> = {
  e1rm: "Estimated 1RM",
  heaviest: "Heaviest set",
  best_set_volume: "Best set volume",
  most_reps_at_weight: "Most reps",
  longest_hold: "Longest hold",
  longest_distance: "Longest distance",
};

export function formatRecordValue(
  record: Pick<PersonalRecord, "type" | "value">,
  unit: WeightUnit = "kg",
): string {
  switch (record.type) {
    case "most_reps_at_weight":
      return `${record.value} ${record.value === 1 ? "rep" : "reps"}`;
    case "longest_hold":
      return formatDuration(record.value);
    case "longest_distance":
      return `${roundTo(record.value, 2)} km`;
    default:
      return formatWeight(record.value, unit);
  }
}

export function RecordsCards({
  records,
  weightUnit = "kg",
}: {
  records: PersonalRecord[];
  weightUnit?: WeightUnit;
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {records.map((record) => (
        <li key={`${record.type}-${record.context}`}>
          <Card size="sm" className="h-full">
            <CardContent className="flex flex-col gap-1">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                {LABELS[record.type]}
              </p>
              <p className="text-2xl font-semibold tabular-nums">
                {formatRecordValue(record, weightUnit)}
              </p>
              <p className="text-muted-foreground text-sm">{record.context}</p>
              <Link
                href={`/health/gym/history/${record.workoutId}`}
                className="text-primary text-sm underline-offset-4 hover:underline"
              >
                <time dateTime={record.date}>{record.date}</time>
                <span className="sr-only"> — open that workout</span>
              </Link>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
