"use client";

import { useActionState, useTransition } from "react";
import {
  clearLandmarkOverrideAction,
  setLandmarkOverrideAction,
} from "@/modules/health/actions/gym/landmarks";
import type { ActionState } from "@/modules/core/action/types";
import type { VolumeLandmark } from "@/modules/health/engine/types";
import { MUSCLES, MUSCLE_LABELS, type Muscle } from "@/modules/health/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const FIELDS = [
  ["mev", "MEV"],
  ["mavLow", "MAV from"],
  ["mavHigh", "MAV to"],
  ["mrv", "MRV"],
] as const;

const initialState: ActionState = {};

function LandmarkRow({
  muscle,
  value,
  overridden,
}: {
  muscle: Muscle;
  value: VolumeLandmark;
  overridden: boolean;
}) {
  const [state, formAction, isPending] = useActionState(setLandmarkOverrideAction, initialState);
  const [resetting, startReset] = useTransition();
  const label = MUSCLE_LABELS[muscle];

  return (
    <li className="border-border border-b py-3 last:border-0">
      <form
        key={`${value.mev}-${value.mavLow}-${value.mavHigh}-${value.mrv}`}
        action={formAction}
        className="flex flex-wrap items-end gap-2"
      >
        <input type="hidden" name="muscle" value={muscle} />
        <span className="w-28 text-sm font-medium">
          {label}
          {overridden && <span className="text-muted-foreground block text-xs">custom</span>}
        </span>
        {FIELDS.map(([name, short]) => (
          <label key={name} className="flex flex-col gap-1 text-xs">
            <span className="text-muted-foreground">{short}</span>
            <Input
              type="number"
              name={name}
              min={0}
              max={60}
              defaultValue={value[name]}
              aria-label={`${label} ${short}`}
              className="w-16 tabular-nums"
            />
          </label>
        ))}
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          Save
        </Button>
        {overridden && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={resetting}
            onClick={() => startReset(() => void clearLandmarkOverrideAction({ muscle }))}
          >
            Reset
          </Button>
        )}
        {state.error && (
          <p role="alert" className="text-destructive w-full text-sm">
            {state.error}
          </p>
        )}
      </form>
    </li>
  );
}

/** One editable row per muscle: the override when set, else the default. */
export function LandmarkOverrides({
  defaults,
  overrides,
}: {
  defaults: Record<Muscle, VolumeLandmark>;
  overrides: Partial<Record<Muscle, VolumeLandmark>>;
}) {
  return (
    <ul>
      {MUSCLES.map((muscle) => (
        <LandmarkRow
          key={muscle}
          muscle={muscle}
          value={overrides[muscle] ?? defaults[muscle]}
          overridden={overrides[muscle] !== undefined}
        />
      ))}
    </ul>
  );
}
