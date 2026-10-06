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
import { REP_CAP } from "@/modules/health/engine/e1rm";
import {
  loadForRpe,
  percentOf1rm,
  RPE_STEPS,
  RTS_PERCENT_CHART,
} from "@/modules/health/engine/rpe";
import { formatWeight } from "@/modules/health/engine/units";
import type { WeightUnit } from "@/modules/health/types";
import { parsePositive, typedToKg } from "./tool-utils";

export function RpeTool({ stepKg, unit }: { stepKg: number; unit: WeightUnit }) {
  const [e1rm, setE1rm] = useState(unit === "lb" ? "265" : "120");
  const [reps, setReps] = useState("5");
  const [rpe, setRpe] = useState("8");

  const e1rmKg = typedToKg(parsePositive(e1rm), unit);
  const repCount = parsePositive(reps);
  const rpeValue = Number(rpe);
  const percent =
    repCount !== null && Number.isInteger(repCount) ? percentOf1rm(repCount, rpeValue) : null;
  const load =
    e1rmKg !== null && repCount !== null && percent !== null
      ? loadForRpe(e1rmKg, repCount, rpeValue, stepKg)
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-4 sm:max-w-lg">
        <FormField label={`Your e1RM (${unit})`} htmlFor="rpeE1rm">
          <Input
            type="number"
            step="any"
            inputMode="decimal"
            value={e1rm}
            onChange={(e) => setE1rm(e.target.value)}
            className="tabular-nums"
          />
        </FormField>
        <FormField label="Target reps" htmlFor="rpeReps">
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
        <FormField label="Target RPE" htmlFor="rpeRpe">
          <select
            value={rpe}
            onChange={(e) => setRpe(e.target.value)}
            className="border-input bg-background h-8 rounded-md border px-3 text-sm tabular-nums"
          >
            {RPE_STEPS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <p aria-live="polite" className="text-sm tabular-nums">
        {load !== null && percent !== null ? (
          <>
            Load <span className="text-lg font-semibold">{formatWeight(load, unit)}</span> for{" "}
            {reps} @ RPE {rpe} ({(percent * 100).toFixed(1)} % of e1RM, rounded to{" "}
            {formatWeight(stepKg, unit)}).
          </>
        ) : (
          <span className="text-muted-foreground">
            Enter your e1RM and a whole number of reps from 1 to {REP_CAP}.
          </span>
        )}
      </p>

      <div className="overflow-x-auto">
        <Table>
          <caption className="text-muted-foreground mb-2 text-left text-sm">
            % of 1RM by reps and RPE (RPE 10 = no reps left, RPE 8 = about 2 left)
          </caption>
          <TableHeader>
            <TableRow>
              <TableHead>Reps</TableHead>
              {RPE_STEPS.map((r) => (
                <TableHead key={r} className="text-right">
                  RPE {r}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {RTS_PERCENT_CHART.map((row, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium tabular-nums">{i + 1}</TableCell>
                {row.map((pct, j) => (
                  <TableCell key={j} className="text-right tabular-nums">
                    {pct}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-muted-foreground text-xs">
        Based on Mike Tuchscherer&apos;s Reactive Training Systems chart. Individuals vary and RPE
        gets harder to judge as reps go up.
      </p>
    </div>
  );
}
