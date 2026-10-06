"use client";

import { useActionState, useState, useTransition } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartCard } from "@/components/ui/chart-card";
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
import {
  addMeasurementsAction,
  deleteMeasurementAction,
  type AddMeasurementsState,
} from "@/modules/health/actions/gym/body";
import {
  MEASUREMENT_LABELS,
  MEASUREMENT_SITES,
  measurementUnit,
  type MeasurementSite,
} from "@/modules/health/types";
import { AXIS_LINE, AXIS_TICK, PointTooltip, shortDate, yAxisLabel } from "../stats/chart-style";
import { formatChange, measurementRows, type SeriesPoint } from "./body-helpers";

interface MeasurementsSectionProps {
  series: Array<{ site: MeasurementSite; points: SeriesPoint[] }>;
  today: string;
}

const initialState: AddMeasurementsState = {};

function EntryForm({ today }: { today: string }) {
  const [state, formAction, pending] = useActionState(addMeasurementsAction, initialState);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Date" htmlFor="measureDate">
          <Input type="date" name="date" required defaultValue={today} max={today} />
        </FormField>
        <FormField label="Note" htmlFor="measureNote" hint="Optional">
          <Input type="text" name="note" maxLength={500} />
        </FormField>
      </div>
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-2 text-sm font-medium">Sites (fill in any you measured)</legend>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {MEASUREMENT_SITES.map((site) => (
            <FormField
              key={site}
              label={`${MEASUREMENT_LABELS[site]} (${measurementUnit(site)})`}
              htmlFor={`measure-${site}`}
              error={state.fieldErrors?.[site]?.[0]}
            >
              <Input
                type="number"
                name={site}
                step="0.1"
                min="0"
                inputMode="decimal"
                className="tabular-nums"
              />
            </FormField>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save measurements"}
        </Button>
        {state.error && (
          <p role="alert" className="text-destructive text-sm">
            {state.error}
          </p>
        )}
        {state.ok && !pending && (
          <p role="status" className="text-muted-foreground text-sm">
            Saved.
          </p>
        )}
      </div>
    </form>
  );
}

export function MeasurementsSection({ series, today }: MeasurementsSectionProps) {
  const rows = measurementRows(series);
  const [chosen, setChosen] = useState<MeasurementSite | null>(null);
  const site = chosen ?? rows[0]?.site ?? null;
  const points = series.find((s) => s.site === site)?.points ?? [];
  const unit = site ? measurementUnit(site) : "cm";
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function remove(id: number) {
    setError(null);
    startTransition(async () => {
      const result = await deleteMeasurementAction({ id });
      if (!result.ok) setError(result.error ?? "Could not delete that entry.");
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Add measurements</CardTitle>
          <p className="text-muted-foreground text-sm">
            Measure on a relaxed, unflexed body with a soft tape. Neck and waist (plus hips for
            women) also give a body-fat estimate below.
          </p>
        </CardHeader>
        <CardContent>
          <EntryForm today={today} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Latest values</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No measurements yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site</TableHead>
                  <TableHead className="text-right">Latest</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.site}>
                    <TableCell>{row.label}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.latest.value} {row.unit}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatChange(row.change)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.latest.date}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ChartCard
        title="Trend"
        tableData={points}
        tableColumns={[
          { key: "d", label: "Date", render: (p: SeriesPoint) => p.date },
          {
            key: "v",
            label: `Value (${unit})`,
            align: "right",
            render: (p: SeriesPoint) => p.value,
          },
        ]}
        emptyTitle="No measurements yet"
        emptyDescription="Add measurements above to see a trend."
      >
        <FormField label="Site" htmlFor="measureTrendSite" className="mb-4 sm:w-56">
          <select
            value={site ?? ""}
            onChange={(e) => setChosen(e.target.value as MeasurementSite)}
            className="border-input bg-background h-8 rounded-md border px-3 text-sm"
          >
            {rows.map((r) => (
              <option key={r.site} value={r.site}>
                {r.label}
              </option>
            ))}
          </select>
        </FormField>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={shortDate}
                tick={AXIS_TICK}
                axisLine={AXIS_LINE}
                tickLine={false}
                minTickGap={32}
              />
              <YAxis
                domain={["auto", "auto"]}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={48}
                label={yAxisLabel(unit)}
              />
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                content={
                  <PointTooltip<SeriesPoint>
                    render={(p) => (
                      <>
                        <p className="font-semibold">
                          {p.value} {unit}
                        </p>
                        <p className="text-muted-foreground text-xs">{p.date}</p>
                      </>
                    )}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={{ r: 3, fill: "var(--primary)" }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      {site && points.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              {MEASUREMENT_LABELS[site]} entries
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="m-0 flex list-none flex-col divide-y p-0">
              {[...points].reverse().map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="tabular-nums">
                    {p.date} · {p.value} {unit}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() => remove(p.id)}
                    aria-label={`Delete ${MEASUREMENT_LABELS[site]} ${p.value} ${unit} on ${p.date}`}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
            {error && (
              <p role="alert" className="text-destructive mt-2 text-sm">
                {error}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
