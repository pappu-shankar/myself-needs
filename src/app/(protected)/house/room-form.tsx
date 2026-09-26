"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addRoomAction, updateRoomAction, type AddRoomState } from "@/modules/house/actions";
import {
  ROOM_TYPES,
  MATERIAL_FINISHES,
  type RoomType,
  type MaterialFinish,
} from "@/modules/house/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";
import { ColorSwatchPicker } from "@/components/ui/color-swatch-picker";

const initialState: AddRoomState = {};

const TYPE_LABELS: Record<RoomType, string> = {
  bedroom: "Bedroom",
  bathroom: "Bathroom",
  kitchen: "Kitchen",
  living: "Living room",
  dining: "Dining room",
  hallway: "Hallway",
  garage: "Garage",
  balcony: "Balcony",
  other: "Other",
};

const MATERIAL_LABELS: Record<MaterialFinish, string> = {
  matte: "Matte",
  satin: "Satin",
  gloss: "Gloss",
  metal: "Metal",
};

export interface RoomFormValues {
  id: number;
  name: string;
  type: RoomType;
  x: number;
  z: number;
  width: number;
  depth: number;
  wallHeight: number | null;
  color: string | null;
  material: MaterialFinish | null;
  notes: string | null;
}

export function RoomForm({
  floorId,
  room,
  onSuccess,
}: {
  floorId: number;
  room?: RoomFormValues;
  onSuccess?: () => void;
}) {
  const action = room ? updateRoomAction : addRoomAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  // Captured once on mount — later `room` prop changes (e.g. a revalidation
  // landing while this dialog is mid-close after saving) must not reach back
  // into these already-initialized uncontrolled inputs' `defaultValue`.
  const [initial] = useState(room);

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) onSuccess?.();
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess]);

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-4">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="floorId" value={floorId} />
      <FormField label="Name" htmlFor="roomName">
        <Input type="text" name="name" id="roomName" defaultValue={initial?.name} required />
      </FormField>
      <FormField label="Type" htmlFor="roomType">
        <select
          name="type"
          id="roomType"
          defaultValue={initial?.type ?? "bedroom"}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {ROOM_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Width (m)" htmlFor="roomWidth">
        <Input
          type="number"
          step="any"
          name="width"
          id="roomWidth"
          defaultValue={initial?.width}
          className="tabular-nums"
          required
        />
      </FormField>
      <FormField label="Depth (m)" htmlFor="roomDepth">
        <Input
          type="number"
          step="any"
          name="depth"
          id="roomDepth"
          defaultValue={initial?.depth}
          className="tabular-nums"
          required
        />
      </FormField>
      <FormField label="Position X (m)" htmlFor="roomX" hint="From the floor's origin corner">
        <Input
          type="number"
          step="any"
          name="x"
          id="roomX"
          defaultValue={initial?.x ?? 0}
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Position Z (m)" htmlFor="roomZ" hint="From the floor's origin corner">
        <Input
          type="number"
          step="any"
          name="z"
          id="roomZ"
          defaultValue={initial?.z ?? 0}
          className="tabular-nums"
        />
      </FormField>
      <FormField
        label="Wall height (m)"
        htmlFor="roomWallHeight"
        hint="Optional — overrides the floor's default"
      >
        <Input
          type="number"
          step="any"
          name="wallHeight"
          id="roomWallHeight"
          defaultValue={initial?.wallHeight ?? undefined}
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Color" htmlFor="roomColor" hint="Optional">
        <ColorSwatchPicker name="color" id="roomColor" defaultValue={initial?.color ?? undefined} />
      </FormField>
      <FormField
        label="Material"
        htmlFor="roomMaterial"
        hint="Optional — how the walls read under light"
      >
        <select
          name="material"
          id="roomMaterial"
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
      <FormField label="Notes" htmlFor="roomNotes" hint="Optional" className="sm:col-span-4">
        <Input type="text" name="notes" id="roomNotes" defaultValue={initial?.notes ?? undefined} />
      </FormField>
      <FormFieldAction label={room ? "Save changes" : "Add room"}>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : room ? "Save changes" : "Add room"}
        </Button>
      </FormFieldAction>
      {state.error && (
        <p role="alert" className="text-destructive text-sm sm:col-span-4">
          {state.error}
        </p>
      )}
    </form>
  );
}
