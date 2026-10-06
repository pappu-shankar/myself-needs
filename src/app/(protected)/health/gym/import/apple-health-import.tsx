"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { importWeighInsAction } from "@/modules/health/actions/gym/import";
import { parseAppleHealthBlob } from "@/modules/health/importers/apple-health";
import type { ParseResult } from "@/modules/health/importers/types";
import { dateRange, errorMessage, nf } from "./download";
import { Collapsible, ErrorLine, ProgressStatus, Stats, SummaryBox } from "./shared";

const CHUNK = 5000;

export function AppleHealthImport() {
  const [parsed, setParsed] = React.useState<ParseResult | null>(null);
  const [parsing, setParsing] = React.useState(false);
  const [fraction, setFraction] = React.useState(0);
  const [found, setFound] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(0);
  const [result, setResult] = React.useState<{ created: number; skipped: number } | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setParsed(null);
    setResult(null);
    setError(null);
    setFraction(0);
    setFound(0);
    if (!f) return;
    if (/\.zip$/i.test(f.name)) {
      setError("That's the zip. Unzip it and choose apple_health_export/export.xml instead.");
      return;
    }
    setParsing(true);
    try {
      setParsed(
        await parseAppleHealthBlob(f, (p, n) => {
          setFraction(p);
          setFound(n);
        }),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setParsing(false);
    }
  }

  async function run() {
    if (!parsed) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setDone(0);
    let created = 0;
    let skipped = 0;
    try {
      for (let i = 0; i < parsed.weighIns.length; i += CHUNK) {
        const res = await importWeighInsAction({ weighIns: parsed.weighIns.slice(i, i + CHUNK) });
        if (!res.ok || !res.data) {
          setError(
            `${res.error ?? "Import failed."} Imported ${nf.format(created)} weigh-ins before it stopped; re-running is safe.`,
          );
          return;
        }
        created += res.data.created;
        skipped += res.data.skipped;
        setDone(Math.min(i + CHUNK, parsed.weighIns.length));
      }
      setResult({ created, skipped });
    } catch (err) {
      setError(
        `${errorMessage(err)} Imported ${nf.format(created)} weigh-ins before it stopped; re-running is safe.`,
      );
    } finally {
      setBusy(false);
    }
  }

  const total = parsed?.weighIns.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Body weight from Apple Health</CardTitle>
        <CardDescription>
          On your iPhone open Health, tap your profile picture, then Export All Health Data. Unzip
          the file and choose <code>apple_health_export/export.xml</code> below. It is read in your
          browser, so large exports are fine; only body weight is kept.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FormField label="Apple Health export.xml" htmlFor="apple-health-file">
          <Input
            type="file"
            accept=".xml,text/xml,application/xml"
            onChange={onFile}
            disabled={parsing || busy}
          />
        </FormField>
        <ErrorLine message={error} />
        {parsing ? (
          <ProgressStatus
            label="Reading export.xml"
            value={Math.round(fraction * 100)}
            max={100}
            status={`Reading… ${Math.round(fraction * 100)}% (${nf.format(found)} weight records found)`}
          />
        ) : null}
        {parsed ? (
          <div className="flex flex-col gap-3">
            <Stats
              items={[
                ["Weigh-ins", nf.format(total)],
                ["Date range", dateRange(parsed.weighIns.map((w) => w.date))],
              ]}
            />
            <Collapsible
              summary={`${nf.format(parsed.warnings.length)} notes`}
              items={parsed.warnings}
            />
            <div>
              <Button onClick={run} disabled={busy || total === 0}>
                {busy ? "Importing…" : `Import ${nf.format(total)} weigh-ins`}
              </Button>
            </div>
          </div>
        ) : null}
        {busy ? (
          <ProgressStatus
            label="Weigh-in import progress"
            value={done}
            max={Math.max(total, 1)}
            status={`Importing ${nf.format(done)} / ${nf.format(total)}…`}
          />
        ) : null}
        {result ? (
          <SummaryBox title="Import finished">
            <Stats
              items={[
                ["Created", nf.format(result.created)],
                ["Already present", nf.format(result.skipped)],
              ]}
            />
          </SummaryBox>
        ) : null}
      </CardContent>
    </Card>
  );
}
