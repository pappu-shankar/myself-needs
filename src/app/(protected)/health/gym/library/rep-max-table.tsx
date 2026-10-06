import { formatWeight } from "@/modules/health/engine/units";
import type { WeightUnit } from "@/modules/health/gym-types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface RepMaxRow {
  reps: number;
  weightKg: number;
}

/** Load you could manage for 1…n reps, with each as a share of the one-rep max. */
export function RepMaxTable({
  rows,
  caption,
  weightUnit = "kg",
}: {
  rows: RepMaxRow[];
  caption: string;
  weightUnit?: WeightUnit;
}) {
  const oneRep = rows.find((r) => r.reps === 1)?.weightKg ?? rows[0]?.weightKg ?? 0;
  return (
    <Table>
      <caption className="sr-only">{caption}</caption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Reps</TableHead>
          <TableHead scope="col" className="text-right">
            Weight
          </TableHead>
          <TableHead scope="col" className="text-right">
            % of 1RM
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.reps}>
            <TableCell className="tabular-nums">{row.reps}</TableCell>
            <TableCell className="text-right tabular-nums">
              {formatWeight(row.weightKg, weightUnit)}
            </TableCell>
            <TableCell className="text-muted-foreground text-right tabular-nums">
              {oneRep > 0 ? `${Math.round((row.weightKg / oneRep) * 100)}%` : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
