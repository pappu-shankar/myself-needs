"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  upsertReadinessCheckinAction,
  type UpsertReadinessCheckinState,
} from "@/modules/health/actions/gym/readiness";
import type { ReadinessField } from "@/modules/health/types";
import type { ReadinessCheckin } from "@/modules/health";

const SCALES: Array<{ field: ReadinessField; label: string; low: string; high: string }> = [
  { field: "sleepQuality", label: "Sleep quality", low: "Terrible", high: "Great" },
  { field: "energy", label: "Energy", low: "Drained", high: "Energetic" },
  { field: "soreness", label: "Soreness", low: "None", high: "Very sore" },
  { field: "stress", label: "Stress", low: "Calm", high: "Very stressed" },
  { field: "motivation", label: "Motivation", low: "None", high: "Fired up" },
];

const initialState: UpsertReadinessCheckinState = {};

/** The daily 1–5 check-in; prefilled with today's earlier answers when `existing`. */
export function ReadinessCheckinForm({
  date,
  existing,
}: {
  date: string;
  existing: ReadinessCheckin | null;
}) {
  const [state, formAction, pending] = useActionState(upsertReadinessCheckinAction, initialState);

  // Remount when the saved answers change so the radios pick up the new defaults.
  const formKey = existing ? SCALES.map((s) => existing[s.field]).join("-") : "new";

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="date" value={date} />
      {SCALES.map(({ field, label, low, high }) => (
        <fieldset key={field} className="m-0 border-0 p-0">
          <legend className="mb-1.5 text-sm font-medium">
            {label}
            <span className="sr-only">
              {" "}
              (1 = {low}, 5 = {high})
            </span>
          </legend>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <label
                  key={n}
                  className="has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:focus-visible]:ring-ring/50 hover:bg-muted flex size-9 cursor-pointer items-center justify-center rounded-md border text-sm tabular-nums has-[:focus-visible]:ring-3"
                >
                  <input
                    type="radio"
                    name={field}
                    value={n}
                    required
                    defaultChecked={existing?.[field] === n}
                    className="sr-only"
                  />
                  {n}
                </label>
              ))}
            </div>
            {/* End labels under the scale, so the row fits narrow columns. */}
            <div className="text-muted-foreground flex justify-between text-xs" aria-hidden="true">
              <span>{low}</span>
              <span>{high}</span>
            </div>
          </div>
        </fieldset>
      ))}
      <FormField label="Note" htmlFor={`checkin-note-${date}`} hint="Optional">
        <Input type="text" name="note" maxLength={500} defaultValue={existing?.note ?? ""} />
      </FormField>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : existing ? "Update check-in" : "Save check-in"}
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
