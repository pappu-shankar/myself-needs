"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { importWorkoutsAction } from "@/modules/health/actions/gym/import";
import { parseWorkoutCsv } from "@/modules/health/importers/detect";
import { ImportFormatError } from "@/modules/health/importers/validate";
import type { ParseResult } from "@/modules/health/importers/types";
import { IMPORT_SOURCE_LABELS } from "@/modules/health/gym-types";
import { dateRange, errorMessage, nf } from "./download";
import { Collapsible, ErrorLine, ProgressStatus, Stats, SummaryBox } from "./shared";

const CHUNK = 200;

interface Totals {
  created: number;
  skipped: number;
  exercisesCreated: number;
  unmatched: string[];
  matched: Map<string, string>;
}

export function WorkoutImport() {
  const [unit, setUnit] = React.useState<"kg" | "lb">("kg");
  const [file, setFile] = React.useState<File | null>(null);
  const [text, setText] = React.useState<string | null>(null);
  const [parsed, setParsed] = React.useState<ParseResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(0);
  const [totals, setTotals] = React.useState<Totals | null>(null);
  const [finished, setFinished] = React.useState(false);

  function parse(content: string, u: "kg" | "lb") {
    try {
      setParsed(parseWorkoutCsv(content, { weightUnit: u }));
      setError(null);
    } catch (err) {
      setParsed(null);
      setError(err instanceof ImportFormatError ? err.message : errorMessage(err));
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setParsed(null);
    setText(null);
    setTotals(null);
    setFinished(false);
    setError(null);
    if (!f) return;
    try {
      const content = await f.text();
      setText(content);
      parse(content, unit);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function onUnit(e: React.ChangeEvent<HTMLSelectElement>) {
    const u = e.target.value === "lb" ? "lb" : "kg";
    setUnit(u);
    if (text !== null) parse(text, u);
  }

  async function run() {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    setFinished(false);
    setDone(0);
    const acc: Totals = {
      created: 0,
      skipped: 0,
      exercisesCreated: 0,
      unmatched: [],
      matched: new Map(),
    };
    setTotals(acc);
    const source =
      parsed.source === "hevy" || parsed.source === "fitnotes" ? parsed.source : "strong";
    try {
      for (let i = 0; i < parsed.workouts.length; i += CHUNK) {
        const res = await importWorkoutsAction({
          source,
          workouts: parsed.workouts.slice(i, i + CHUNK),
        });
        if (!res.ok || !res.data) {
          setError(
            `${res.error ?? "Import failed."} Imported ${nf.format(acc.created)} workouts before it stopped; re-running is safe.`,
          );
          return;
        }
        const d = res.data;
        acc.created += d.created;
        acc.skipped += d.skipped;
        acc.exercisesCreated += d.exercisesCreated;
        for (const n of d.unmatched) if (!acc.unmatched.includes(n)) acc.unmatched.push(n);
        for (const m of d.matched) acc.matched.set(m.from, m.to);
        setDone(Math.min(i + CHUNK, parsed.workouts.length));
        setTotals({ ...acc, matched: new Map(acc.matched), unmatched: [...acc.unmatched] });
      }
      setFinished(true);
    } catch (err) {
      setError(
        `${errorMessage(err)} Imported ${nf.format(acc.created)} workouts before it stopped; re-running is safe.`,
      );
    } finally {
      setBusy(false);
    }
  }

  const total = parsed?.workouts.length ?? 0;
  const sets = parsed
    ? parsed.workouts.reduce((n, w) => n + w.exercises.reduce((m, ex) => m + ex.sets.length, 0), 0)
    : 0;
  const names = parsed
    ? new Set(parsed.workouts.flatMap((w) => w.exercises.map((ex) => ex.name))).size
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workout history</CardTitle>
        <CardDescription>
          Import a CSV export from Strong, Hevy or FitNotes. The file is read in your browser;
          re-importing the same file never creates duplicates.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Workout CSV file" htmlFor="workout-csv-file">
            <Input type="file" accept=".csv,text/csv" onChange={onFile} disabled={busy} />
          </FormField>
          <FormField
            label="Weights in this file are"
            htmlFor="workout-csv-unit"
            hint="Only matters for Strong, whose Weight column has no unit."
          >
            <select
              value={unit}
              onChange={onUnit}
              disabled={busy}
              className="border-input bg-background h-8 rounded-lg border px-2 text-sm"
            >
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </FormField>
        </div>
        <ErrorLine message={error} />
        {parsed && file ? (
          <div className="flex flex-col gap-3">
            <Stats
              items={[
                ["Detected", IMPORT_SOURCE_LABELS[parsed.source]],
                ["Workouts", nf.format(total)],
                ["Date range", dateRange(parsed.workouts.map((w) => w.date))],
                ["Sets", nf.format(sets)],
                ["Distinct exercises", nf.format(names)],
              ]}
            />
            <Collapsible
              summary={`${nf.format(parsed.warnings.length)} warnings`}
              items={parsed.warnings}
            />
            <div>
              <Button onClick={run} disabled={busy || total === 0}>
                {busy ? "Importing…" : `Import ${nf.format(total)} workouts`}
              </Button>
            </div>
          </div>
        ) : null}
        {busy || (totals && !finished) ? (
          <ProgressStatus
            label="Workout import progress"
            value={done}
            max={Math.max(total, 1)}
            status={`Importing ${nf.format(done)} / ${nf.format(total)}…`}
          />
        ) : null}
        {totals && finished ? (
          <SummaryBox title="Import finished">
            <Stats
              items={[
                ["Created", nf.format(totals.created)],
                ["Already imported", nf.format(totals.skipped)],
                ["New custom exercises", nf.format(totals.exercisesCreated)],
                ["Matched names", nf.format(totals.matched.size)],
              ]}
            />
            <Collapsible
              summary={`${nf.format(totals.unmatched.length)} unmatched names (added as custom exercises)`}
              items={totals.unmatched}
            />
          </SummaryBox>
        ) : null}
      </CardContent>
    </Card>
  );
}
