"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  addFurnitureAction,
  updateFurnitureAction,
  type AddFurnitureState,
} from "@/modules/house/actions";
import {
  FURNITURE_CATEGORIES,
  MATERIAL_FINISHES,
  type FurnitureCategory,
  type MaterialFinish,
} from "@/modules/house/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";
import { ColorSwatchPicker } from "@/components/ui/color-swatch-picker";

const initialState: AddFurnitureState = {};

const CATEGORY_LABELS: Record<FurnitureCategory, string> = {
  bed: "Bed",
  sofa: "Sofa",
  table: "Table",
  chair: "Chair",
  wardrobe: "Wardrobe",
  desk: "Desk",
  tv_unit: "TV unit",
  other: "Other",
};

const MATERIAL_LABELS: Record<MaterialFinish, string> = {
  matte: "Matte",
  satin: "Satin",
  gloss: "Gloss",
  metal: "Metal",
};

export interface FurnitureFormValues {
  id: number;
  name: string;
  category: FurnitureCategory;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotationDegrees: number;
  color: string | null;
  material: MaterialFinish | null;
  notes: string | null;
}

export function FurnitureForm({
  roomId,
  furniture,
  onSuccess,
}: {
  roomId: number;
  furniture?: FurnitureFormValues;
  onSuccess?: () => void;
}) {
  const action = furniture ? updateFurnitureAction : addFurnitureAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  // Captured once on mount — see room-form.tsx for why.
  const [initial] = useState(furniture);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) onSuccess?.();
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess]);

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="roomId" value={roomId} />
      <FormField label="Name" htmlFor="furnitureName">
        <Input type="text" name="name" id="furnitureName" defaultValue={initial?.name} required />
      </FormField>
      <FormField label="Category" htmlFor="furnitureCategory">
        <select
          name="category"
          id="furnitureCategory"
          defaultValue={initial?.category ?? "bed"}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {FURNITURE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Rotation (degrees)" htmlFor="furnitureRotation" hint="0 = width along +x">
        <Input
          type="number"
          step="any"
          name="rotationDegrees"
          id="furnitureRotation"
          defaultValue={initial?.rotationDegrees ?? 0}
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Position X (m)" htmlFor="furnitureX" hint="From the room's origin corner">
        <Input
          type="number"
          step="any"
          name="x"
          id="furnitureX"
          defaultValue={initial?.x ?? 0}
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Position Z (m)" htmlFor="furnitureZ" hint="From the room's origin corner">
        <Input
          type="number"
          step="any"
          name="z"
          id="furnitureZ"
          defaultValue={initial?.z ?? 0}
          className="tabular-nums"
        />
      </FormField>
      <div />
      <FormField label="Width (m)" htmlFor="furnitureWidth">
        <Input
          type="number"
          step="any"
          name="width"
          id="furnitureWidth"
          defaultValue={initial?.width}
          className="tabular-nums"
          required
        />
      </FormField>
      <FormField label="Depth (m)" htmlFor="furnitureDepth">
        <Input
          type="number"
          step="any"
          name="depth"
          id="furnitureDepth"
          defaultValue={initial?.depth}
          className="tabular-nums"
          required
        />
      </FormField>
      <FormField label="Height (m)" htmlFor="furnitureHeight">
        <Input
          type="number"
          step="any"
          name="height"
          id="furnitureHeight"
          defaultValue={initial?.height}
          className="tabular-nums"
          required
        />
      </FormField>
      <FormField label="Color" htmlFor="furnitureColor" hint="Optional">
        <ColorSwatchPicker
          name="color"
          id="furnitureColor"
          defaultValue={initial?.color ?? undefined}
        />
      </FormField>
      <FormField label="Material" htmlFor="furnitureMaterial" hint="Optional">
        <select
          name="material"
          id="furnitureMaterial"
          defaultValue={initial?.material ?? ""}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          <option value="">Default</option>
          {MATERIAL_FINISHES.map((m) => (
            <option key={m} value={m}>
              {MATERIAL_LABELS[m]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Notes" htmlFor="furnitureNotes" hint="Optional" className="sm:col-span-2">
        <Input
          type="text"
          name="notes"
          id="furnitureNotes"
          defaultValue={initial?.notes ?? undefined}
        />
      </FormField>
      <FormFieldAction label={furniture ? "Save changes" : "Add furniture"}>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : furniture ? "Save changes" : "Add furniture"}
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
