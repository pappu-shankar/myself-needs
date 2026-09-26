"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addStairAction, updateStairAction, type AddStairState } from "@/modules/house/actions";
import { STAIR_RAILING_SIDES, type StairRailingSide } from "@/modules/house/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";
import type { FloorFormValues } from "./floor-form";

const initialState: AddStairState = {};

const RAILING_SIDE_LABELS: Record<StairRailingSide, string> = {
  none: "None",
  left: "Left only",
  right: "Right only",
  both: "Both sides",
};

export interface StairFormValues {
  id: number;
  fromFloorId: number;
  toFloorId: number;
  name: string;
  x: number;
  z: number;
  width: number;
  run: number;
  rotationDegrees: number;
  railingSide: StairRailingSide;
  railingHeight: number | null;
  notes: string | null;
}

export function StairForm({
  projectId,
  floors,
  stair,
  onSuccess,
}: {
  projectId: number;
  floors: FloorFormValues[];
  stair?: StairFormValues;
  onSuccess?: () => void;
}) {
  const action = stair ? updateStairAction : addStairAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  // Captured once on mount — see room-form.tsx for why.
  const [initial] = useState(stair);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) onSuccess?.();
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess]);

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="projectId" value={projectId} />
      <FormField label="Name" htmlFor="stairName" className="sm:col-span-3">
        <Input
          type="text"
          name="name"
          id="stairName"
          defaultValue={initial?.name}
          placeholder="e.g. Ground to first flight"
          required
        />
      </FormField>
      <FormField label="From floor" htmlFor="stairFromFloor">
        <select
          name="fromFloorId"
          id="stairFromFloor"
          defaultValue={initial?.fromFloorId ?? floors[0]?.id}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {floors.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="To floor" htmlFor="stairToFloor">
        <select
          name="toFloorId"
          id="stairToFloor"
          defaultValue={initial?.toFloorId ?? floors[1]?.id ?? floors[0]?.id}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {floors.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Rotation (degrees)" htmlFor="stairRotation" hint="0 = runs along +x">
        <Input
          type="number"
          step="any"
          name="rotationDegrees"
          id="stairRotation"
          defaultValue={initial?.rotationDegrees ?? 0}
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Position X (m)" htmlFor="stairX" hint="Flight's starting corner">
        <Input
          type="number"
          step="any"
          name="x"
          id="stairX"
          defaultValue={initial?.x ?? 0}
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Position Z (m)" htmlFor="stairZ" hint="Flight's starting corner">
        <Input
          type="number"
          step="any"
          name="z"
          id="stairZ"
          defaultValue={initial?.z ?? 0}
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Width (m)" htmlFor="stairWidth">
        <Input
          type="number"
          step="any"
          name="width"
          id="stairWidth"
          defaultValue={initial?.width}
          className="tabular-nums"
          required
        />
      </FormField>
      <FormField label="Run (m)" htmlFor="stairRun" hint="Horizontal length of this flight">
        <Input
          type="number"
          step="any"
          name="run"
          id="stairRun"
          defaultValue={initial?.run}
          className="tabular-nums"
          required
        />
      </FormField>
      <FormField label="Railing" htmlFor="stairRailingSide">
        <select
          name="railingSide"
          id="stairRailingSide"
          defaultValue={initial?.railingSide ?? "both"}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {STAIR_RAILING_SIDES.map((s) => (
            <option key={s} value={s}>
              {RAILING_SIDE_LABELS[s]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField
        label="Railing height (m)"
        htmlFor="stairRailingHeight"
        hint="Optional — default ~0.9m"
      >
        <Input
          type="number"
          step="any"
          name="railingHeight"
          id="stairRailingHeight"
          defaultValue={initial?.railingHeight ?? undefined}
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Notes" htmlFor="stairNotes" hint="Optional" className="sm:col-span-3">
        <Input
          type="text"
          name="notes"
          id="stairNotes"
          defaultValue={initial?.notes ?? undefined}
        />
      </FormField>
      <FormFieldAction label={stair ? "Save changes" : "Add stair"}>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : stair ? "Save changes" : "Add stair"}
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
