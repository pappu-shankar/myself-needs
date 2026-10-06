"use client";

import { useActionState } from "react";
import {
  setWeekdayRoutineAction,
  type SetWeekdayRoutineState,
} from "@/modules/health/actions/gym/schedule";
import { WEEKDAY_LABELS } from "@/modules/health/types";
import type { WeekScheduleDay } from "@/modules/health";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { MONDAY_FIRST } from "./plan-format";

const initialState: SetWeekdayRoutineState = {};

export interface RoutineOption {
  id: number;
  name: string;
}

function WeekdayRow({ day, routines }: { day: WeekScheduleDay; routines: RoutineOption[] }) {
  const [state, formAction, pending] = useActionState(setWeekdayRoutineAction, initialState);
  const selectId = `weekday-${day.weekday}`;
  const hasCurrent = day.routineId !== null && routines.some((r) => r.id === day.routineId);

  return (
    <form action={formAction} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto]">
      <input type="hidden" name="weekday" value={day.weekday} />
      <FormField
        label={WEEKDAY_LABELS[day.weekday]}
        htmlFor={selectId}
        hint={
          day.routineArchived
            ? "This routine is archived — restore it for the day to plan anything."
            : undefined
        }
      >
        <select
          name="routineId"
          defaultValue={day.routineId === null ? "rest" : String(day.routineId)}
          className="border-input bg-background h-8 min-w-0 rounded-md border px-3 text-sm"
        >
          <option value="rest">Rest</option>
          {day.routineId !== null && !hasCurrent && (
            <option value={day.routineId}>
              {day.routineName ?? "Archived routine"} (archived)
            </option>
          )}
          {routines.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </FormField>
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={pending}
          aria-label={`Save ${WEEKDAY_LABELS[day.weekday]}`}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
        {state.ok && (
          <span role="status" className="text-sm">
            Saved
          </span>
        )}
      </div>
      {state.error && (
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          {state.error}
        </p>
      )}
    </form>
  );
}

/** The repeating weekly plan: one routine (or rest) per weekday, Monday first. */
export function WeekdayPlanForm({
  schedule,
  routines,
}: {
  schedule: WeekScheduleDay[];
  routines: RoutineOption[];
}) {
  const byDay = new Map(schedule.map((d) => [d.weekday, d]));
  return (
    <div className="flex flex-col gap-4">
      {MONDAY_FIRST.map((weekday) => {
        const day = byDay.get(weekday);
        return day ? <WeekdayRow key={weekday} day={day} routines={routines} /> : null;
      })}
    </div>
  );
}
