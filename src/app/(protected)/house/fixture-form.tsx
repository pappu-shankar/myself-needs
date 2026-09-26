"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  addFixtureAction,
  updateFixtureAction,
  type AddFixtureState,
} from "@/modules/house/actions";
import { FIXTURE_CATEGORIES, type FixtureCategory } from "@/modules/house/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";

const initialState: AddFixtureState = {};

const CATEGORY_LABELS: Record<FixtureCategory, string> = {
  water_inlet: "Water inlet",
  sump: "Sump",
  septic_tank: "Septic tank",
  overhead_tank: "Overhead tank",
  drain_outlet: "Drain outlet",
  electrical_panel: "Electrical panel",
  other: "Other",
};

export interface FixtureFormValues {
  id: number;
  name: string;
  category: FixtureCategory;
  x: number;
  z: number;
  notes: string | null;
}

export function FixtureForm({
  floorId,
  fixture,
  onSuccess,
}: {
  floorId: number;
  fixture?: FixtureFormValues;
  onSuccess?: () => void;
}) {
  const action = fixture ? updateFixtureAction : addFixtureAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  // Captured once on mount — see room-form.tsx for why.
  const [initial] = useState(fixture);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) onSuccess?.();
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess]);

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="floorId" value={floorId} />
      <FormField label="Name" htmlFor="fixtureName">
        <Input type="text" name="name" id="fixtureName" defaultValue={initial?.name} required />
      </FormField>
      <FormField label="Category" htmlFor="fixtureCategory">
        <select
          name="category"
          id="fixtureCategory"
          defaultValue={initial?.category ?? "water_inlet"}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {FIXTURE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </FormField>
      <div />
      <FormField label="Position X (m)" htmlFor="fixtureX" hint="From the floor's origin corner">
        <Input
          type="number"
          step="any"
          name="x"
          id="fixtureX"
          defaultValue={initial?.x ?? 0}
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Position Z (m)" htmlFor="fixtureZ" hint="From the floor's origin corner">
        <Input
          type="number"
          step="any"
          name="z"
          id="fixtureZ"
          defaultValue={initial?.z ?? 0}
          className="tabular-nums"
        />
      </FormField>
      <div />
      <FormField label="Notes" htmlFor="fixtureNotes" hint="Optional" className="sm:col-span-3">
        <Input
          type="text"
          name="notes"
          id="fixtureNotes"
          defaultValue={initial?.notes ?? undefined}
        />
      </FormField>
      <FormFieldAction label={fixture ? "Save changes" : "Add fixture"}>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : fixture ? "Save changes" : "Add fixture"}
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
