"use client";

import { useActionState, useRef, useState } from "react";
import {
  createProgramAction,
  type CreateProgramState,
} from "@/modules/health/actions/gym/programs";
import { PROGRAM_KINDS, PROGRAM_KIND_LABELS, type ProgramKind } from "@/modules/health/types";
import { useActionSuccess } from "@/lib/use-action-success";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";

const initialState: CreateProgramState = {};

const KIND_HELP: Record<ProgramKind, string> = {
  block:
    "A fixed-length block: working sets ramp up each week, and the last week can be a deload (half the sets, lighter loads, lower effort). Everything else follows each routine's own progression rules.",
  wendler:
    "Repeating four-week 5/3/1 cycles (5s, 3s, 5/3/1, deload) with loads as percentages of a training max. It only acts on routine exercises whose loading scheme is a 5/3/1 one.",
};

export function ProgramForm({ today, hasActive }: { today: string; hasActive: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(createProgramAction, initialState);
  const [kind, setKind] = useState<ProgramKind>("block");
  useActionSuccess(state, () => formRef.current?.reset());
  const err = (name: string) => state.fieldErrors?.[name]?.[0];

  return (
    <form ref={formRef} action={formAction} className="grid gap-4">
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="Name" htmlFor="program-name" error={err("name")}>
          <Input name="name" required maxLength={100} placeholder="Autumn strength block" />
        </FormField>
        <FormField label="Type" htmlFor="program-kind">
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as ProgramKind)}
            className="border-input bg-background h-8 rounded-md border px-3 text-sm"
          >
            {PROGRAM_KINDS.map((k) => (
              <option key={k} value={k}>
                {PROGRAM_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Start date" htmlFor="program-start" error={err("startDate")}>
          <Input type="date" name="startDate" required defaultValue={today} />
        </FormField>
        <FormField
          label={kind === "block" ? "Weeks" : "Planned weeks"}
          htmlFor="program-weeks"
          hint={kind === "wendler" ? "A multiple of 4 covers whole cycles." : undefined}
          error={err("weeks")}
        >
          <Input
            type="number"
            name="weeks"
            required
            min="1"
            max="52"
            step="1"
            defaultValue={kind === "block" ? 6 : 12}
            key={kind}
            className="tabular-nums"
          />
        </FormField>
        {kind === "block" && (
          <FormField
            label="Sets added per week"
            htmlFor="program-ramp"
            hint="Added to each exercise, cumulatively."
            error={err("setRampPerWeek")}
          >
            <Input
              type="number"
              name="setRampPerWeek"
              min="0"
              max="5"
              step="1"
              defaultValue={1}
              className="tabular-nums"
            />
          </FormField>
        )}
        {kind === "block" && (
          <label className="flex items-center gap-2 self-center text-sm sm:pt-5">
            <input type="checkbox" name="deloadFinalWeek" defaultChecked className="size-4" />
            Deload in the final week
          </label>
        )}
      </div>
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {KIND_HELP[kind]}
      </p>
      {hasActive && (
        <p className="text-muted-foreground text-sm">
          Starting a program completes the one that&apos;s running now.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="default" disabled={pending}>
          {pending ? "Starting…" : "Start program"}
        </Button>
        {state.ok && (
          <span role="status" className="text-sm">
            Program started.
          </span>
        )}
        {state.error && (
          <span role="alert" className="text-destructive text-sm">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
