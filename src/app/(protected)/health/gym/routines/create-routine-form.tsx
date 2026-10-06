"use client";

import { useActionState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  createRoutineAction,
  type CreateRoutineState,
} from "@/modules/health/actions/gym/routines";
import { PROGRESSION_POLICIES, POLICY_LABELS } from "@/modules/health/types";
import { useActionSuccess } from "@/lib/use-action-success";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";

const initialState: CreateRoutineState = {};

/** Creates an empty routine and opens its editor. */
export function CreateRoutineForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(createRoutineAction, initialState);

  useActionSuccess(state, (data) => {
    formRef.current?.reset();
    if (data) router.push(`/health/gym/routines/${data.id}`);
  });

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid grid-cols-1 items-start gap-4 sm:grid-cols-[1fr_1fr_auto]"
    >
      <FormField
        label="Routine name"
        htmlFor="new-routine-name"
        error={state.fieldErrors?.name?.[0]}
      >
        <Input
          name="name"
          required
          maxLength={100}
          placeholder="Push day"
          defaultValue={state.values?.name}
        />
      </FormField>
      <FormField label="Default progression rule" htmlFor="new-routine-policy">
        <select
          name="progressionPolicy"
          defaultValue={state.values?.progressionPolicy ?? "double"}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {PROGRESSION_POLICIES.filter((p) => p !== "time").map((p) => (
            <option key={p} value={p}>
              {POLICY_LABELS[p]}
            </option>
          ))}
        </select>
      </FormField>
      <FormFieldAction label="Create routine">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create routine"}
        </Button>
      </FormFieldAction>
      {state.error && !state.fieldErrors?.name && (
        <p role="alert" className="text-destructive text-sm sm:col-span-3">
          {state.error}
        </p>
      )}
    </form>
  );
}
