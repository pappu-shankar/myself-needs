import Link from "next/link";
import { formatWeight } from "@/modules/health/engine/units";
import type { ExerciseHistoryRow } from "@/modules/health";
import type { WeightUnit } from "@/modules/health/gym-types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatSetsSummary } from "./set-summary";

export function HistoryTable({
  rows,
  isBodyweight,
  weightUnit = "kg",
}: {
  rows: ExerciseHistoryRow[];
  isBodyweight: boolean;
  weightUnit?: WeightUnit;
}) {
  return (
    <Table>
      <caption className="sr-only">Sessions with this exercise, newest first</caption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Date</TableHead>
          <TableHead scope="col">Sets</TableHead>
          <TableHead scope="col" className="text-right">
            Top set
          </TableHead>
          <TableHead scope="col" className="text-right">
            Tonnage
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.workoutId}>
            <TableCell className="whitespace-nowrap tabular-nums">
              <Link
                href={`/health/gym/history/${row.workoutId}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                {row.date}
              </Link>
            </TableCell>
            <TableCell className="min-w-48 whitespace-normal tabular-nums">
              {formatSetsSummary(row.sets, isBodyweight, weightUnit)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.topWeightKg ? formatWeight(row.topWeightKg, weightUnit) : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.tonnageKg > 0 ? formatWeight(row.tonnageKg, weightUnit) : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
