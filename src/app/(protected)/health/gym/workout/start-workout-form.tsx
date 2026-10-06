"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { startWorkoutAction, type StartWorkoutState } from "@/modules/health/actions/gym/session";
import type { WeightUnit } from "@/modules/health/types";
import { formatWeight, toDisplayWeight } from "@/modules/health/engine/units";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Card, CardContent } from "@/components/ui/card";
import { setRest } from "./_hooks/rest-timer-store";
import { parseWeight } from "./_lib/set-input";

interface StartWorkoutFormProps {
  routines: Array<{ id: number; name: string }>;
  /** Today's planned routine, preselected. */
  plannedRoutineId: number | null;
  askBodyweight: boolean;
  latestBodyweight: { date: string; weightKg: number } | null;
  /** The weigh-in is typed in this unit and sent as kg. */
  weightUnit: WeightUnit;
  /** Server-rendered preview of today's plan, shown while that routine is selected. */
  preview: React.ReactNode;
}

/** Pick a routine (or an empty session), optionally weigh in, go. */
export function StartWorkoutForm({
  routines,
  plannedRoutineId,
  askBodyweight,
  latestBodyweight,
  weightUnit,
  preview,
}: StartWorkoutFormProps) {
  const router = useRouter();
  const routineId = useId();
  const weightId = useId();
  const plannedAvailable =
    plannedRoutineId !== null && routines.some((r) => r.id === plannedRoutineId);
  const [selected, setSelected] = useState(plannedAvailable ? String(plannedRoutineId) : "");
  const [state, setState] = useState<StartWorkoutState>({});
  const [pending, startTransition] = useTransition();
  const defaultWeight = latestBodyweight
    ? String(toDisplayWeight(latestBodyweight.weightKg, weightUnit))
    : "";

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    // The field is in the user's unit; the action takes kg. Blank skips the
    // weigh-in; anything unparseable goes through as typed so the server's
    // validation message shows under the field.
    const typed = formData.get("bodyweight");
    formData.delete("bodyweight");
    if (typeof typed === "string" && typed.trim() !== "") {
      const parsed = parseWeight(typed, weightUnit);
      const kg =
        typed.trim() === defaultWeight && latestBodyweight
          ? latestBodyweight.weightKg // untouched: no round trip through lb
          : parsed.ok && parsed.value !== null
            ? parsed.value
            : null;
      formData.set("bodyweightKg", kg !== null ? String(kg) : typed.trim());
    }
    setState({});
    startTransition(async () => {
      let result: StartWorkoutState;
      try {
        result = await startWorkoutAction({}, formData);
      } catch {
        result = { error: "Couldn't reach the app — the workout wasn't started. Try again." };
      }
      if (result.ok) {
        setRest(null);
        router.refresh();
      } else {
        setState(result);
      }
    });
  }

  const weightHint = latestBodyweight
    ? `Last weigh-in ${formatWeight(latestBodyweight.weightKg, weightUnit)} on ${latestBodyweight.date}. Saved as today's body weight — clear it to skip.`
    : "Optional — saved as today's body weight.";

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm">
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <FormField label="Routine" htmlFor={routineId}>
              <select
                name="routineId"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-lg border px-3 text-base outline-none focus-visible:ring-3"
              >
                {routines.map((routine) => (
                  <option key={routine.id} value={routine.id}>
                    {routine.name}
                    {routine.id === plannedRoutineId ? " (today's plan)" : ""}
                  </option>
                ))}
                <option value="">Empty workout</option>
              </select>
            </FormField>
            {askBodyweight && (
              <FormField
                label={`Weigh-in (${weightUnit})`}
                htmlFor={weightId}
                hint={weightHint}
                error={state.fieldErrors?.bodyweightKg?.[0]}
              >
                <Input
                  type="text"
                  name="bodyweight"
                  inputMode="decimal"
                  autoComplete="off"
                  defaultValue={defaultWeight}
                  className="h-11 text-base tabular-nums"
                />
              </FormField>
            )}
            {state.error && !state.fieldErrors?.bodyweightKg && (
              <p role="alert" className="text-destructive text-sm">
                {state.error}
              </p>
            )}
            <Button
              type="submit"
              variant="default"
              className="h-11 w-full text-base"
              disabled={pending}
            >
              <Play aria-hidden="true" />
              {pending ? "Starting…" : "Start workout"}
            </Button>
            {routines.length === 0 && (
              <p className="text-muted-foreground text-sm">
                No routines yet — start an empty workout, or{" "}
                <Link
                  href="/health/gym/routines"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  set up a routine
                </Link>{" "}
                to get prescribed sets.
              </p>
            )}
          </form>
        </CardContent>
      </Card>
      {plannedAvailable && selected === String(plannedRoutineId) ? (
        preview
      ) : selected !== "" ? (
        <p className="text-muted-foreground text-sm">
          Sets are filled in from this routine&apos;s progression when you start.
        </p>
      ) : null}
    </div>
  );
}
