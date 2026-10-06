"use client";

import { useActionState, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { addDays } from "@/lib/dates";
import { formatWeight, toDisplayWeight } from "@/modules/health/engine/units";
import type { WeightUnit } from "@/modules/health/types";
import { ChartCard } from "@/components/ui/chart-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, FormFieldAction } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { logBodyweightAction, type LogBodyweightState } from "@/modules/health/actions/gym/body";
import type { BodyOverview } from "@/modules/health";
import { AXIS_LINE, AXIS_TICK, PointTooltip, shortDate, yAxisLabel } from "../stats/chart-style";
import {
  DIRECTION_TEXT,
  formatChange,
  formatTrend,
  toStorageKg,
  WEIGHT_RANGES,
  withGoalDirection,
  type GoalDirection,
  type WeightChangePoint,
} from "./body-helpers";

type Weight = BodyOverview["weight"];
type Point = WeightChangePoint;

/** Chart colour tokens for each kind of change; neutral when there is nothing to judge. */
const DIRECTION_COLOR: Record<GoalDirection, string> = {
  toward: "var(--chart-3)",
  away: "var(--chart-8)",
  flat: "var(--muted-foreground)",
  first: "var(--muted-foreground)",
  "no-goal": "var(--muted-foreground)",
};

const initialState: LogBodyweightState = {};

function LogForm({ today, unit }: { today: string; unit: WeightUnit }) {
  const [state, formAction, pending] = useActionState(logBodyweightAction, initialState);
  const [typed, setTyped] = useState("");
  const typedNumber = Number(typed);
  // The action takes kg: the visible field is in the display unit, the posted one is converted.
  const kgValue =
    typed.trim() !== "" && Number.isFinite(typedNumber) ? toStorageKg(typedNumber, unit) : "";
  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-4">
      <FormField label="Date" htmlFor="bodyweightDate">
        <Input type="date" name="date" required defaultValue={today} max={today} />
      </FormField>
      <FormField
        label={`Weight (${unit})`}
        htmlFor="bodyweightKg"
        error={state.fieldErrors?.weightKg?.[0]}
      >
        <Input
          type="number"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          step="0.1"
          min={unit === "lb" ? 44 : 20}
          max={unit === "lb" ? 880 : 400}
          inputMode="decimal"
          required
          className="tabular-nums"
        />
        <input type="hidden" name="weightKg" value={kgValue} />
      </FormField>
      <FormField label="Note" htmlFor="bodyweightNote" hint="Optional">
        <Input type="text" name="note" maxLength={500} />
      </FormField>
      <FormFieldAction label="Log weight">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Log weight"}
        </Button>
      </FormFieldAction>
      {state.error && (
        <p role="alert" className="text-destructive text-sm sm:col-span-4">
          {state.error}
        </p>
      )}
      {state.ok && !pending && (
        <p role="status" className="text-muted-foreground text-sm sm:col-span-4">
          Saved.
        </p>
      )}
    </form>
  );
}

export function WeightSection({
  weight,
  today,
  unit,
}: {
  weight: Weight;
  today: string;
  unit: WeightUnit;
}) {
  const [rangeKey, setRangeKey] = useState<(typeof WEIGHT_RANGES)[number]["key"]>("365");
  const range = WEIGHT_RANGES.find((r) => r.key === rangeKey) ?? WEIGHT_RANGES[1];
  const from = range.days === null ? null : addDays(today, -range.days);
  const goal = weight.goalKg;
  // Direction is judged on the full series so the first point in a range still has its own change.
  const allPoints = withGoalDirection(weight.series, goal, unit);
  const points = from ? allPoints.filter((p) => p.date >= from) : allPoints;
  const values = points.map((p) => p.display);
  const goalDisplay = goal === null ? null : toDisplayWeight(goal, unit);
  const bounds = goalDisplay === null ? values : [...values, goalDisplay];
  const lo = bounds.length ? Math.floor(Math.min(...bounds)) - 1 : 0;
  const hi = bounds.length ? Math.ceil(Math.max(...bounds)) + 1 : 100;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card size="sm">
          <CardContent>
            <p className="text-muted-foreground text-sm">Current</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {weight.latest ? toDisplayWeight(weight.latest.weightKg, unit) : "—"}
              <span className="text-muted-foreground ml-1 text-sm font-normal">{unit}</span>
            </p>
            {weight.latest && (
              <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                {weight.latest.date}
              </p>
            )}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-muted-foreground text-sm">28-day trend</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {weight.trend ? formatTrend(weight.trend.perWeekKg, unit) : "—"}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {weight.trend
                ? `${weight.trend.perWeekPct > 0 ? "+" : ""}${weight.trend.perWeekPct}% of body weight per week, a straight-line fit so daily water swings average out`
                : "Needs two weigh-ins at least a week apart in the last 28 days"}
            </p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent>
            <p className="text-muted-foreground text-sm">Goal</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {goalDisplay ?? "—"}
              {goalDisplay !== null && (
                <span className="text-muted-foreground ml-1 text-sm font-normal">{unit}</span>
              )}
            </p>
            {weight.progress !== null && weight.startKg !== null ? (
              <>
                <div
                  role="progressbar"
                  aria-label="Progress toward goal weight"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(weight.progress * 100)}
                  className="bg-muted mt-2 h-2 overflow-hidden rounded-full"
                >
                  <div
                    className="bg-primary h-full"
                    style={{ width: `${Math.round(weight.progress * 100)}%` }}
                  />
                </div>
                <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                  {Math.round(weight.progress * 100)}% of the way from{" "}
                  {formatWeight(weight.startKg, unit)}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground mt-1 text-xs">
                {goal === null
                  ? "Set a goal weight in the profile below"
                  : "Log more weigh-ins to see progress"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <ChartCard
        title="Weight"
        tableData={points}
        tableColumns={[
          { key: "d", label: "Date", render: (p: Point) => p.date },
          { key: "w", label: `Weight (${unit})`, align: "right", render: (p: Point) => p.display },
          {
            key: "c",
            label: `Change (${unit})`,
            align: "right",
            render: (p: Point) => (p.change === null ? "—" : formatChange(p.change)),
          },
          {
            key: "dir",
            label: "Vs goal",
            render: (p: Point) => DIRECTION_TEXT[p.direction],
          },
        ]}
        emptyTitle="No weigh-ins yet"
        emptyDescription="Log your weight below to see the chart."
      >
        <FormField label="Range" htmlFor="weightRange" className="mb-4 sm:w-48">
          <select
            value={rangeKey}
            onChange={(e) => setRangeKey(e.target.value as typeof rangeKey)}
            className="border-input bg-background h-8 rounded-md border px-3 text-sm"
          >
            {WEIGHT_RANGES.map((r) => (
              <option key={r.key} value={r.key}>
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
                domain={[lo, hi]}
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                width={48}
                label={yAxisLabel(unit)}
              />
              {goalDisplay !== null && (
                <ReferenceLine
                  y={goalDisplay}
                  stroke="var(--chart-6)"
                  strokeDasharray="5 4"
                  label={{
                    value: `Goal ${formatWeight(goal ?? 0, unit)}`,
                    position: "insideTopRight",
                    fill: "var(--muted-foreground)",
                    fontSize: 12,
                  }}
                />
              )}
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                content={
                  <PointTooltip<Point>
                    render={(p) => (
                      <>
                        <p className="font-semibold">{formatWeight(p.weightKg, unit)}</p>
                        <p className="text-muted-foreground text-xs">{p.date}</p>
                        {p.change !== null && (
                          <p className="text-xs">
                            {formatChange(p.change)} {unit} · {DIRECTION_TEXT[p.direction]}
                          </p>
                        )}
                      </>
                    )}
                  />
                }
              />
              <Line
                type="monotone"
                dataKey="display"
                stroke="var(--muted-foreground)"
                strokeWidth={1.5}
                // Each point is coloured by whether the change INTO it moved toward the goal.
                dot={(props: { cx?: number; cy?: number; payload?: Point }) => {
                  const { cx, cy, payload } = props;
                  if (cx === undefined || cy === undefined || !payload) return <g key="none" />;
                  return (
                    <circle
                      key={payload.date}
                      cx={cx}
                      cy={cy}
                      r={points.length < 60 ? 4 : 2.5}
                      fill={DIRECTION_COLOR[payload.direction]}
                      stroke="var(--card)"
                      strokeWidth={1}
                    />
                  );
                }}
                activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {goal === null ? (
          <p className="text-muted-foreground mt-3 text-xs">
            Set a goal weight in the profile below to colour each change toward or away from it.
          </p>
        ) : (
          <ul
            aria-label="Chart legend"
            className="text-muted-foreground mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs"
          >
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block size-2.5 rounded-full"
                style={{ background: DIRECTION_COLOR.toward }}
              />
              Moved toward goal
            </li>
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block size-2.5 rounded-full"
                style={{ background: DIRECTION_COLOR.away }}
              />
              Moved away from goal
            </li>
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block size-2.5 rounded-full"
                style={{ background: DIRECTION_COLOR.flat }}
              />
              First weigh-in or no change
            </li>
          </ul>
        )}
      </ChartCard>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Log weight</CardTitle>
        </CardHeader>
        <CardContent>
          <LogForm today={today} unit={unit} />
        </CardContent>
      </Card>
    </div>
  );
}
