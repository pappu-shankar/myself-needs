"use client";

import { useState } from "react";
import Link from "next/link";
import { Moon, RotateCcw } from "lucide-react";
import {
  clearScheduleOverrideAction,
  setScheduleOverrideAction,
} from "@/modules/health/actions/gym/schedule";
import type { PlannedDay } from "@/modules/health";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { useRunAction } from "../routines/use-run-action";
import { dayKind, formatPlanDate, sourceLabel } from "./plan-format";
import type { RoutineOption } from "./weekday-plan-form";

function overrideForm(date: string, routineId: string, note?: string): FormData {
  const formData = new FormData();
  formData.set("date", date);
  formData.set("routineId", routineId);
  if (note) formData.set("note", note);
  return formData;
}

/** Reverts one date to the weekly plan. */
export function RevertButton({ date, label }: { date: string; label?: string }) {
  const { pending, error, run } = useRunAction();
  return (
    <>
      <Button
        size="sm"
        disabled={pending}
        aria-label={`Revert ${formatPlanDate(date)} to the weekly plan`}
        onClick={() => run(() => clearScheduleOverrideAction({ date }))}
      >
        <RotateCcw aria-hidden="true" /> {label ?? "Revert"}
      </Button>
      {error && (
        <span role="alert" className="text-destructive text-sm">
          {error}
        </span>
      )}
    </>
  );
}

function DayCard({
  day,
  today,
  routines,
}: {
  day: PlannedDay;
  today: string;
  routines: RoutineOption[];
}) {
  const [changing, setChanging] = useState(false);
  const [choice, setChoice] = useState(day.routineId === null ? "rest" : String(day.routineId));
  const [note, setNote] = useState("");
  const { pending, error, run } = useRunAction();
  const kind = dayKind(day);
  const isToday = day.date === today;
  const label = formatPlanDate(day.date);

  return (
    <li>
      <Card
        size="sm"
        className={`h-full px-3 ${isToday ? "ring-primary ring-2" : ""}`}
        aria-current={isToday ? "date" : undefined}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium tabular-nums">{label}</p>
          <div className="flex gap-1.5">
            {isToday && <Badge>Today</Badge>}
            {kind !== "none" && <Badge variant="secondary">{sourceLabel(day.source)}</Badge>}
          </div>
        </div>
        <p className="text-sm">
          {kind === "routine" && day.routineId !== null ? (
            <Link
              href={`/health/gym/routines/${day.routineId}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {day.routineName}
            </Link>
          ) : kind === "rest" ? (
            <span className="text-muted-foreground">Rest day</span>
          ) : (
            <span className="text-muted-foreground">Nothing planned</span>
          )}
        </p>
        {day.note && <p className="text-muted-foreground text-sm">{day.note}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            aria-expanded={changing}
            aria-label={`Move or replace ${label}`}
            onClick={() => setChanging((v) => !v)}
          >
            Move / replace
          </Button>
          {kind !== "rest" && (
            <Button
              size="sm"
              disabled={pending}
              aria-label={`Mark ${label} as a rest day`}
              onClick={() =>
                run(() => setScheduleOverrideAction({}, overrideForm(day.date, "rest")))
              }
            >
              <Moon aria-hidden="true" /> Mark rest
            </Button>
          )}
          {day.source === "override" && <RevertButton date={day.date} />}
        </div>
        {changing && (
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(
                () => setScheduleOverrideAction({}, overrideForm(day.date, choice, note.trim())),
                () => setChanging(false),
              );
            }}
          >
            <FormField label="Routine for this day" htmlFor={`override-${day.date}-routine`}>
              <select
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                className="border-input bg-background h-8 rounded-md border px-3 text-sm"
              >
                <option value="rest">Rest</option>
                {routines.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Note (optional)" htmlFor={`override-${day.date}-note`}>
              <input
                value={note}
                maxLength={200}
                onChange={(e) => setNote(e.target.value)}
                className="border-input bg-background h-8 rounded-md border px-3 text-sm"
              />
            </FormField>
            <div>
              <Button type="submit" variant="default" size="sm" disabled={pending}>
                {pending ? "Saving…" : "Save change"}
              </Button>
            </div>
          </form>
        )}
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </Card>
    </li>
  );
}

/** Seven planned days with per-day one-off changes. */
export function WeekCalendar({
  days,
  today,
  routines,
}: {
  days: PlannedDay[];
  today: string;
  routines: RoutineOption[];
}) {
  return (
    <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
      {days.map((day) => (
        <DayCard key={day.date} day={day} today={today} routines={routines} />
      ))}
    </ul>
  );
}
