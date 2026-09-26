"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  addWallStyleAction,
  updateWallStyleAction,
  type AddWallStyleState,
} from "@/modules/house/actions";
import { WALL_SIDES, WALL_STYLES, type WallSide, type WallStyleValue } from "@/modules/house/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";
import { ColorSwatchPicker } from "@/components/ui/color-swatch-picker";

const initialState: AddWallStyleState = {};

const WALL_LABELS: Record<WallSide, string> = {
  north: "North",
  south: "South",
  east: "East",
  west: "West",
};

const STYLE_LABELS: Record<WallStyleValue, string> = {
  open: "Open (no wall)",
  railing: "Railing",
  painted: "Painted (solid, different color)",
};

export interface WallStyleFormValues {
  id: number;
  wall: WallSide;
  style: WallStyleValue;
  railingHeight: number | null;
  color: string | null;
  notes: string | null;
}

export function WallStyleForm({
  roomId,
  wallStyle,
  onSuccess,
}: {
  roomId: number;
  wallStyle?: WallStyleFormValues;
  onSuccess?: () => void;
}) {
  const action = wallStyle ? updateWallStyleAction : addWallStyleAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  // Captured once on mount — see room-form.tsx for why.
  const [initial] = useState(wallStyle);
  const [style, setStyle] = useState<WallStyleValue>(initial?.style ?? "railing");

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) onSuccess?.();
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess]);

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-3">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <input type="hidden" name="roomId" value={roomId} />
      <FormField label="Wall" htmlFor="wallStyleWall">
        <select
          name="wall"
          id="wallStyleWall"
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
      <FormField
        label="Style"
        htmlFor="wallStyleStyle"
        hint="The default (no override) is a solid wall"
      >
        <select
          name="style"
          id="wallStyleStyle"
          value={style}
          onChange={(e) => setStyle(e.target.value as WallStyleValue)}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {WALL_STYLES.map((s) => (
            <option key={s} value={s}>
              {STYLE_LABELS[s]}
            </option>
          ))}
        </select>
      </FormField>
      {style === "railing" && (
        <FormField
          label="Railing height (m)"
          htmlFor="wallStyleRailingHeight"
          hint="Optional — default ~1m"
        >
          <Input
            type="number"
            step="any"
            name="railingHeight"
            id="wallStyleRailingHeight"
            defaultValue={initial?.railingHeight ?? undefined}
            className="tabular-nums"
          />
        </FormField>
      )}
      {style === "painted" && (
        <FormField label="Color" htmlFor="wallStyleColor">
          <ColorSwatchPicker
            name="color"
            id="wallStyleColor"
            defaultValue={initial?.color ?? undefined}
          />
        </FormField>
      )}
      <FormField label="Notes" htmlFor="wallStyleNotes" hint="Optional" className="sm:col-span-3">
        <Input
          type="text"
          name="notes"
          id="wallStyleNotes"
          defaultValue={initial?.notes ?? undefined}
        />
      </FormField>
      <FormFieldAction label={wallStyle ? "Save changes" : "Add wall style"}>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : wallStyle ? "Save changes" : "Add wall style"}
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
