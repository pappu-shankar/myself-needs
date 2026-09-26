"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addFloorAction, updateFloorAction, type AddFloorState } from "@/modules/house/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";

const initialState: AddFloorState = {};

export interface FloorFormValues {
  id: number;
  name: string;
  level: number;
  floorHeight: number;
}

export function FloorForm({
  projectId,
  floor,
  onSuccess,
}: {
  projectId: number;
  floor?: FloorFormValues;
  onSuccess?: () => void;
}) {
  const action = floor ? updateFloorAction : addFloorAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  // Captured once on mount — see room-form.tsx for why.
  const [initial] = useState(floor);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) onSuccess?.();
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess]);

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="projectId" value={projectId} />
      <FormField label="Name" htmlFor="floorName">
        <Input
          type="text"
          name="name"
          id="floorName"
          defaultValue={initial?.name}
          placeholder="e.g. Ground floor"
          required
        />
      </FormField>
      <FormField
        label="Level"
        htmlFor="floorLevel"
        hint="0 = ground, negative = basement, positive = upper"
      >
        <Input
          type="number"
          name="level"
          id="floorLevel"
          defaultValue={initial?.level ?? 0}
          className="tabular-nums"
          required
        />
      </FormField>
      <FormField label="Wall height (m)" htmlFor="floorHeight">
        <Input
          type="number"
          step="any"
          name="floorHeight"
          id="floorHeight"
          defaultValue={initial?.floorHeight ?? 3}
          className="tabular-nums"
          required
        />
      </FormField>
      <FormFieldAction label={floor ? "Save changes" : "Add floor"}>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : floor ? "Save changes" : "Add floor"}
        </Button>
      </FormFieldAction>
      {state.error && (
        <p role="alert" className="text-destructive text-sm sm:col-span-3">
          {state.error}
        </p>
      )}
    </form>
  );
}
