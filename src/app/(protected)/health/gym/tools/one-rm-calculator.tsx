"use client";

import { useState } from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { estimate1rm, REP_CAP, repMaxTable } from "@/modules/health/engine/e1rm";
import { formatWeight } from "@/modules/health/engine/units";
import { E1RM_FORMULAS, type E1rmFormula, type WeightUnit } from "@/modules/health/types";
import { parsePositive, typedToKg } from "./tool-utils";

const FORMULA_LABELS: Record<E1rmFormula, string> = {
  epley: "Epley",
  brzycki: "Brzycki",
  lombardi: "Lombardi",
};

export function OneRmCalculator({
  formula: initialFormula,
  unit,
}: {
  formula: E1rmFormula;
  unit: WeightUnit;
}) {
  const [weight, setWeight] = useState(unit === "lb" ? "225" : "100");
  const [reps, setReps] = useState("5");
  const [formula, setFormula] = useState<E1rmFormula>(initialFormula);

  const weightKg = typedToKg(parsePositive(weight), unit);
  const repCount = parsePositive(reps);
  const repsError =
    repCount !== null && (!Number.isInteger(repCount) || repCount > REP_CAP)
      ? `Use a whole number of reps, ${REP_CAP} or fewer. Beyond that the formulas disagree too much to trust.`
      : undefined;
  const estimates =
    weightKg !== null && repCount !== null && !repsError
      ? E1RM_FORMULAS.map((f) => ({ formula: f, kg: estimate1rm(weightKg, repCount, f) }))
      : null;
  const chosen = estimates?.find((e) => e.formula === formula)?.kg ?? null;
  const table = chosen !== null ? repMaxTable(chosen, formula) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:max-w-md">
        <FormField label={`Weight lifted (${unit})`} htmlFor="ormWeight">
          <Input
            type="number"
            step="any"
            inputMode="decimal"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="tabular-nums"
          />
        </FormField>
        <FormField label="Reps" htmlFor="ormReps" error={repsError}>
          <Input
            type="number"
            step="1"
            min="1"
            max={REP_CAP}
            inputMode="numeric"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="tabular-nums"
          />
        </FormField>
      </div>

      {estimates ? (
        <div aria-live="polite" className="flex flex-col gap-4">
          <dl className="m-0 grid grid-cols-3 gap-3">
            {estimates.map((e) => (
              <div key={e.formula} className="rounded-lg border p-3">
                <dt className="text-muted-foreground text-sm">{FORMULA_LABELS[e.formula]}</dt>
                <dd className="m-0 mt-1 text-lg font-semibold tabular-nums">
                  {e.kg === null ? "—" : formatWeight(e.kg, unit)}
                </dd>
              </div>
            ))}
          </dl>
          <FormField label="Rep-max table from" htmlFor="ormFormula" className="sm:w-48">
            <select
              value={formula}
              onChange={(e) => setFormula(e.target.value as E1rmFormula)}
              className="border-input bg-background h-8 rounded-md border px-3 text-sm"
            >
              {E1RM_FORMULAS.map((f) => (
                <option key={f} value={f}>
                  {FORMULA_LABELS[f]}
                </option>
              ))}
            </select>
          </FormField>
          {table.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reps</TableHead>
                  <TableHead className="text-right">Weight ({unit})</TableHead>
                  <TableHead className="text-right">% of 1RM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.map((row) => (
                  <TableRow key={row.reps}>
                    <TableCell className="tabular-nums">{row.reps}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatWeight(row.weightKg, unit)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {chosen ? Math.round((row.weightKg / chosen) * 100) : "—"}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      ) : (
        !repsError && (
          <p className="text-muted-foreground text-sm">Enter the weight and reps of a hard set.</p>
        )
      )}
      <p className="text-muted-foreground text-xs">
        An estimate, not a test: the formulas agree closely for 1–5 reps and drift apart as reps
        rise. Epley (1985), Brzycki (1993) and Lombardi (1989).
      </p>
    </div>
  );
}
