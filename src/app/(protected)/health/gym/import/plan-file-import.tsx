"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { exportPlanFileAction, importPlanFileAction } from "@/modules/health/actions/gym/import";
import { parsePlanFile } from "@/modules/health/importers/plan-file";
import { ImportFormatError } from "@/modules/health/importers/validate";
import type { PlanFileV1 } from "@/modules/health/importers/types";
import { downloadJson, errorMessage, nf } from "./download";
import { ErrorLine, Stats, SummaryBox } from "./shared";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function printableHtml(plan: PlanFileV1): string {
  const routines = plan.routines
    .map((r) => {
      const rows = r.entries
        .map((e) => {
          const reps =
            e.reps === null ? "" : e.repsMin !== null ? `${e.repsMin}-${e.reps}` : `${e.reps}`;
          const load = e.weightKg === null ? "" : `${e.weightKg} kg`;
          const rest = e.restSec === null ? "" : `${e.restSec}s`;
          return `<tr><td>${esc(e.exercise.name)}</td><td>${e.sets}</td><td>${esc(reps)}</td><td>${esc(load)}</td><td>${esc(rest)}</td></tr>`;
        })
        .join("");
      return `<h2>${esc(r.name)}</h2>${r.notes ? `<p>${esc(r.notes)}</p>` : ""}<table><thead><tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>Load</th><th>Rest</th></tr></thead><tbody>${rows}</tbody></table>`;
    })
    .join("");
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const week = days
    .map((d, i) => {
      const idx = plan.week[String(i)];
      const name =
        idx === null || idx === undefined ? "Rest" : (plan.routines[idx]?.name ?? "Rest");
      return `<li>${d}: ${esc(name)}</li>`;
    })
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Gym plan</title><style>body{font-family:system-ui,sans-serif;margin:2rem;color:#000}table{border-collapse:collapse;width:100%;margin-bottom:1rem}th,td{border:1px solid #888;padding:4px 8px;text-align:left}</style></head><body><h1>Gym plan</h1><h2>Week</h2><ul>${week}</ul>${routines}</body></html>`;
}

export function PlanFileImport() {
  const [busy, setBusy] = React.useState<"download" | "print" | "import" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [plan, setPlan] = React.useState<PlanFileV1 | null>(null);
  const [result, setResult] = React.useState<{
    routinesCreated: number;
    exercisesCreated: number;
  } | null>(null);

  async function download() {
    setBusy("download");
    setError(null);
    setNote(null);
    try {
      const res = await exportPlanFileAction({});
      if (!res.ok || !res.data) return setError(res.error ?? "Couldn't export the plan.");
      setNote(`Downloaded ${downloadJson("gym-plan", res.data)}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function print() {
    // Open synchronously so the popup isn't blocked after the await.
    const win = window.open("", "_blank");
    if (!win) return setError("Your browser blocked the print window. Allow pop-ups and retry.");
    setBusy("print");
    setError(null);
    setNote(null);
    try {
      const res = await exportPlanFileAction({});
      if (!res.ok || !res.data) {
        win.close();
        return setError(res.error ?? "Couldn't export the plan.");
      }
      win.document.open();
      win.document.write(printableHtml(res.data));
      win.document.close();
      win.focus();
      win.print();
    } catch (err) {
      win.close();
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setPlan(null);
    setResult(null);
    setError(null);
    setNote(null);
    if (!f) return;
    try {
      setPlan(parsePlanFile(JSON.parse(await f.text())));
    } catch (err) {
      setError(
        err instanceof ImportFormatError
          ? err.message
          : err instanceof SyntaxError
            ? "That file isn't valid JSON."
            : errorMessage(err),
      );
    }
  }

  async function run() {
    if (!plan) return;
    setBusy("import");
    setError(null);
    try {
      const res = await importPlanFileAction({ plan });
      if (!res.ok || !res.data) return setError(res.error ?? "Import failed.");
      setResult(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const entries = plan ? plan.routines.reduce((n, r) => n + r.entries.length, 0) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Share a plan</CardTitle>
        <CardDescription>
          A plan file holds your routines and weekly schedule, with no workout history or body data.
          Importing a plan merges it in: new routines are added and nothing is ever overwritten.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={download} disabled={busy !== null}>
            {busy === "download" ? "Preparing…" : "Download plan file"}
          </Button>
          <Button variant="secondary" onClick={print} disabled={busy !== null}>
            {busy === "print" ? "Preparing…" : "Print plan"}
          </Button>
        </div>
        <FormField label="Import a plan file" htmlFor="plan-file-input" hint="A .json plan file.">
          <Input
            type="file"
            accept=".json,application/json"
            onChange={onFile}
            disabled={busy !== null}
          />
        </FormField>
        <ErrorLine message={error} />
        {note ? (
          <p role="status" className="text-sm">
            {note}
          </p>
        ) : null}
        {plan ? (
          <div className="flex flex-col gap-3">
            <Stats
              items={[
                ["Routines", nf.format(plan.routines.length)],
                ["Exercise entries", nf.format(entries)],
              ]}
            />
            {plan.routines.length > 0 ? (
              <ul className="text-muted-foreground list-disc pl-5 text-sm break-words">
                {plan.routines.map((r, i) => (
                  <li key={i}>
                    {r.name} ({nf.format(r.entries.length)} exercises)
                  </li>
                ))}
              </ul>
            ) : null}
            <div>
              <Button onClick={run} disabled={busy !== null || plan.routines.length === 0}>
                {busy === "import" ? "Importing…" : "Import plan"}
              </Button>
            </div>
          </div>
        ) : null}
        {result ? (
          <SummaryBox title="Plan imported">
            <Stats
              items={[
                ["Routines added", nf.format(result.routinesCreated)],
                ["New custom exercises", nf.format(result.exercisesCreated)],
              ]}
            />
          </SummaryBox>
        ) : null}
      </CardContent>
    </Card>
  );
}
