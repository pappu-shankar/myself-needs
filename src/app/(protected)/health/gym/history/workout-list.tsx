import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { WorkoutListRow } from "@/modules/health";
import type { WeightUnit } from "@/modules/health/types";
import { formatWeight } from "@/modules/health/engine/units";
import { formatLongDate, formatMinutes } from "../workout/_lib/format";

type Row = Pick<
  WorkoutListRow,
  "id" | "name" | "date" | "durationMin" | "setsCompleted" | "tonnageKg" | "exerciseCount"
>;

/** Finished workouts, newest first; each row opens its summary. Stacks cleanly at phone width. */
export function WorkoutList({ rows, weightUnit = "kg" }: { rows: Row[]; weightUnit?: WeightUnit }) {
  return (
    <ul className="bg-card ring-foreground/10 divide-border flex flex-col divide-y overflow-hidden rounded-xl ring-1">
      {rows.map((row) => (
        <li key={row.id}>
          <Link
            href={`/health/gym/history/${row.id}`}
            className="hover:bg-muted/60 focus-visible:bg-muted/60 flex items-center gap-3 px-4 py-3 outline-none"
          >
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="truncate font-medium">{row.name}</span>
                <time dateTime={row.date} className="text-muted-foreground text-sm tabular-nums">
                  {formatLongDate(row.date)}
                </time>
              </span>
              <span className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-sm tabular-nums">
                <span>{formatMinutes(row.durationMin)}</span>
                <span>
                  {row.setsCompleted} {row.setsCompleted === 1 ? "set" : "sets"}
                </span>
                <span>{formatWeight(row.tonnageKg, weightUnit)}</span>
                <span>
                  {row.exerciseCount} {row.exerciseCount === 1 ? "exercise" : "exercises"}
                </span>
              </span>
            </span>
            <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
