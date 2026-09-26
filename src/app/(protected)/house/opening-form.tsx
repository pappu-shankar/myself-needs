"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  addOpeningAction,
  updateOpeningAction,
  type AddOpeningState,
} from "@/modules/house/actions";
import {
  WALL_SIDES,
  OPENING_TYPES,
  DOOR_STYLES,
  WINDOW_STYLES,
  type WallSide,
  type OpeningType,
  type DoorStyle,
  type WindowStyle,
} from "@/modules/house/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";

const initialState: AddOpeningState = {};

const WALL_LABELS: Record<WallSide, string> = {
  north: "North",
  south: "South",
  east: "East",
  west: "West",
};

const TYPE_LABELS: Record<OpeningType, string> = {
  door: "Door",
  window: "Window",
};

const DOOR_STYLE_LABELS: Record<DoorStyle, string> = {
  hinged: "Hinged",
  sliding: "Sliding",
  french: "French",
  flush: "Flush",
  louvered: "Louvered",
};

const WINDOW_STYLE_LABELS: Record<WindowStyle, string> = {
  fixed: "Fixed",
  casement: "Casement",
  sliding: "Sliding",
  awning: "Awning",
  louvered: "Louvered",
};

export interface OpeningFormValues {
  id: number;
  wall: WallSide;
  type: OpeningType;
  /** Loosely typed to match the DB column (no enum constraint there — valid values depend on `type`, see openings.ts schema). */
  style: string | null;
  offset: number;
  width: number;
  height: number | null;
  sillHeight: number | null;
  notes: string | null;
}

export function OpeningForm({
  roomId,
  opening,
  onSuccess,
}: {
  roomId: number;
  opening?: OpeningFormValues;
  onSuccess?: () => void;
}) {
  const action = opening ? updateOpeningAction : addOpeningAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  // Captured once on mount — see room-form.tsx for why.
  const [initial] = useState(opening);
  const [type, setType] = useState<OpeningType>(initial?.type ?? "door");
  const styleOptions = type === "door" ? DOOR_STYLES : WINDOW_STYLES;
  const styleLabels: Record<string, string> =
    type === "door" ? DOOR_STYLE_LABELS : WINDOW_STYLE_LABELS;

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) onSuccess?.();
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess]);

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="roomId" value={roomId} />
      <FormField label="Wall" htmlFor="openingWall">
        <select
          name="wall"
          id="openingWall"
          defaultValue={initial?.wall ?? "north"}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {WALL_SIDES.map((w) => (
            <option key={w} value={w}>
              {WALL_LABELS[w]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Type" htmlFor="openingType">
        <select
          name="type"
          id="openingType"
          value={type}
          onChange={(e) => setType(e.target.value as OpeningType)}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {OPENING_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Style" htmlFor="openingStyle" hint="Optional">
        <select
          name="style"
          id="openingStyle"
          defaultValue={
            initial?.style && (styleOptions as readonly string[]).includes(initial.style)
              ? initial.style
              : ""
          }
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          <option value="">—</option>
          {styleOptions.map((s) => (
            <option key={s} value={s}>
              {styleLabels[s]}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Offset (m)" htmlFor="openingOffset" hint="From the wall's start corner">
        <Input
          type="number"
          step="any"
          name="offset"
          id="openingOffset"
          defaultValue={initial?.offset ?? 0}
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Width (m)" htmlFor="openingWidth">
        <Input
          type="number"
          step="any"
          name="width"
          id="openingWidth"
          defaultValue={initial?.width}
          className="tabular-nums"
          required
        />
      </FormField>
      <FormField label="Height (m)" htmlFor="openingHeight" hint="Optional">
        <Input
          type="number"
          step="any"
          name="height"
          id="openingHeight"
          defaultValue={initial?.height ?? undefined}
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Sill height (m)" htmlFor="openingSillHeight" hint="Optional — windows only">
        <Input
          type="number"
          step="any"
          name="sillHeight"
          id="openingSillHeight"
          defaultValue={initial?.sillHeight ?? undefined}
          className="tabular-nums"
        />
      </FormField>
      <FormField label="Notes" htmlFor="openingNotes" hint="Optional" className="sm:col-span-3">
        <Input
          type="text"
          name="notes"
          id="openingNotes"
          defaultValue={initial?.notes ?? undefined}
        />
      </FormField>
      <FormFieldAction label={opening ? "Save changes" : "Add opening"}>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : opening ? "Save changes" : "Add opening"}
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
