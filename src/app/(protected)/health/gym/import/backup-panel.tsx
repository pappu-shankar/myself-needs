"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { exportBackupAction, importBackupAction } from "@/modules/health/actions/gym/import";
import { parseBackup, splitBackup, type GymBackupV1 } from "@/modules/health/importers/backup";
import { ImportFormatError } from "@/modules/health/importers/validate";
import { downloadJson, errorMessage, nf } from "./download";
import { ErrorLine, ProgressStatus, Stats, SummaryBox } from "./shared";

interface Totals {
  workoutsCreated: number;
  workoutsSkipped: number;
  routinesCreated: number;
  routinesSkipped: number;
  exercisesCreated: number;
  weighInsCreated: number;
  measurementsCreated: number;
  readinessCreated: number;
  settingsApplied: boolean;
}

export function BackupPanel() {
  const [busy, setBusy] = React.useState<"download" | "restore" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);
  const [backup, setBackup] = React.useState<GymBackupV1 | null>(null);
  const [step, setStep] = React.useState(0);
  const [steps, setSteps] = React.useState(0);
  const [totals, setTotals] = React.useState<Totals | null>(null);

  async function download() {
    setBusy("download");
    setError(null);
    setNote(null);
    try {
      const res = await exportBackupAction({});
      if (!res.ok || !res.data) return setError(res.error ?? "Couldn't export the backup.");
      setNote(`Downloaded ${downloadJson("gym-backup", res.data)}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setBackup(null);
    setTotals(null);
    setError(null);
    setNote(null);
    if (!f) return;
    try {
      setBackup(parseBackup(JSON.parse(await f.text())));
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

  async function restore() {
    if (!backup) return;
    const pieces = splitBackup(backup, 200);
    setBusy("restore");
    setError(null);
    setTotals(null);
    setStep(0);
    setSteps(pieces.length);
    const t: Totals = {
      workoutsCreated: 0,
      workoutsSkipped: 0,
      routinesCreated: 0,
      routinesSkipped: 0,
      exercisesCreated: 0,
      weighInsCreated: 0,
      measurementsCreated: 0,
      readinessCreated: 0,
      settingsApplied: false,
    };
    try {
      for (let i = 0; i < pieces.length; i++) {
        const res = await importBackupAction({ backup: pieces[i] });
        if (!res.ok || !res.data) {
          setError(
            `${res.error ?? "Restore failed."} ${nf.format(i)} of ${nf.format(pieces.length)} pieces were restored; re-running is safe.`,
          );
          return;
        }
        const d = res.data;
        t.workoutsCreated += d.workouts.created;
        t.workoutsSkipped += d.workouts.skipped;
        t.routinesCreated += d.routinesCreated;
        t.routinesSkipped += d.routinesSkipped;
        t.exercisesCreated += d.exercisesCreated + d.workouts.exercisesCreated;
        t.weighInsCreated += d.weighIns.created;
        t.measurementsCreated += d.measurementsCreated;
        t.readinessCreated += d.readinessCreated;
        t.settingsApplied ||= d.settingsApplied;
        setStep(i + 1);
      }
      setTotals(t);
    } catch (err) {
      setError(`${errorMessage(err)} Re-running the restore is safe.`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Full gym backup</CardTitle>
        <CardDescription>
          A portable, gym-only export: workouts, routines, body data, measurements, readiness and
          settings. Restoring merges and never overwrites. Your whole encrypted vault is already
          backed up automatically before database migrations.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <Button onClick={download} disabled={busy !== null}>
            {busy === "download" ? "Preparing…" : "Download backup"}
          </Button>
        </div>
        <FormField
          label="Restore from backup"
          htmlFor="gym-backup-file"
          hint="A gym-backup .json file."
        >
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
        {backup ? (
          <div className="flex flex-col gap-3">
            <Stats
              items={[
                ["Workouts", nf.format(backup.workouts.length)],
                ["Routines", nf.format(backup.routines.length)],
                ["Weigh-ins", nf.format(backup.weighIns.length)],
                ["Measurements", nf.format(backup.measurements.length)],
                ["Readiness check-ins", nf.format(backup.readiness.length)],
                ["Custom exercises", nf.format(backup.customExercises.length)],
              ]}
            />
            <div>
              <Button onClick={restore} disabled={busy !== null}>
                {busy === "restore" ? "Restoring…" : "Restore backup"}
              </Button>
            </div>
          </div>
        ) : null}
        {busy === "restore" ? (
          <ProgressStatus
            label="Restore progress"
            value={step}
            max={Math.max(steps, 1)}
            status={`Restoring piece ${nf.format(Math.min(step + 1, steps))} / ${nf.format(steps)}…`}
          />
        ) : null}
        {totals ? (
          <SummaryBox title="Restore finished">
            <Stats
              items={[
                ["Workouts created", nf.format(totals.workoutsCreated)],
                ["Workouts already present", nf.format(totals.workoutsSkipped)],
                ["Routines created", nf.format(totals.routinesCreated)],
                ["Routines skipped", nf.format(totals.routinesSkipped)],
                ["Custom exercises created", nf.format(totals.exercisesCreated)],
                ["Weigh-ins created", nf.format(totals.weighInsCreated)],
                ["Measurements created", nf.format(totals.measurementsCreated)],
                ["Readiness created", nf.format(totals.readinessCreated)],
                ["Settings applied", totals.settingsApplied ? "Yes" : "No"],
              ]}
            />
          </SummaryBox>
        ) : null}
      </CardContent>
    </Card>
  );
}
