"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  addLightFixtureAction,
  updateLightFixtureAction,
  type AddLightFixtureState,
} from "@/modules/house/actions";
import { LIGHT_FIXTURE_TYPES, type LightFixtureType } from "@/modules/house/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";

const initialState: AddLightFixtureState = {};

const TYPE_LABELS: Record<LightFixtureType, string> = {
  ceiling: "Ceiling",
  wall: "Wall",
  pendant: "Pendant",
  floor_lamp: "Floor lamp",
};

export interface LightFixtureFormValues {
  id: number;
  name: string;
  type: LightFixtureType;
  x: number;
  z: number;
  height: number | null;
  color: string | null;
  intensity: number | null;
  notes: string | null;
}

export function LightFixtureForm({
  roomId,
  lightFixture,
  onSuccess,
}: {
  roomId: number;
  lightFixture?: LightFixtureFormValues;
  onSuccess?: () => void;
}) {
  const action = lightFixture ? updateLightFixtureAction : addLightFixtureAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  // Captured once on mount — see room-form.tsx for why.
  const [initial] = useState(lightFixture);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) onSuccess?.();
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess]);

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="roomId" value={roomId} />
      <FormField label="Name" htmlFor="lightFixtureName">
        <Input
          type="text"
          name="name"
          id="lightFixtureName"
          defaultValue={initial?.name}
          required
        />
      </FormField>
      <FormField label="Type" htmlFor="lightFixtureType">
        <select
          name="type"
          id="lightFixtureType"
          defaultValue={initial?.type ?? "ceiling"}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {LIGHT_FIXTURE_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField
        label="Height (m)"
        htmlFor="lightFixtureHeight"
        hint="Optional — mounting height, defaults per type"
      >
        <Input
          type="number"
          step="any"
          name="height"
          id="lightFixtureHeight"
          defaultValue={initial?.height ?? undefined}
          className="tabular-nums"
        />
      </FormField>
      <FormField
        label="Position X (m)"
        htmlFor="lightFixtureX"
        hint="From the room's origin corner"
      >
        <Input
          type="number"
          step="any"
          name="x"
          id="lightFixtureX"
          defaultValue={initial?.x ?? 0}
          className="tabular-nums"
        />
      </FormField>
      <FormField
        label="Position Z (m)"
        htmlFor="lightFixtureZ"
        hint="From the room's origin corner"
      >
        <Input
          type="number"
          step="any"
          name="z"
          id="lightFixtureZ"
          defaultValue={initial?.z ?? 0}
          className="tabular-nums"
        />
      </FormField>
      <div />
      <FormField label="Color" htmlFor="lightFixtureColor" hint="Optional — hex, e.g. #fff4d6">
        <Input
          type="text"
          name="color"
          id="lightFixtureColor"
          defaultValue={initial?.color ?? undefined}
          placeholder="#fff4d6"
        />
      </FormField>
      <FormField label="Intensity" htmlFor="lightFixtureIntensity" hint="Optional">
        <Input
          type="number"
          step="any"
          name="intensity"
          id="lightFixtureIntensity"
          defaultValue={initial?.intensity ?? undefined}
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Notes" htmlFor="lightFixtureNotes" hint="Optional">
        <Input
          type="text"
          name="notes"
          id="lightFixtureNotes"
          defaultValue={initial?.notes ?? undefined}
        />
      </FormField>
      <FormFieldAction label={lightFixture ? "Save changes" : "Add light fixture"}>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : lightFixture ? "Save changes" : "Add light fixture"}
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
