"use client";

import { useState, useTransition } from "react";
import { patchGymSettingsAction } from "@/modules/health/actions/gym/settings";
import { WEIGHT_UNITS, type WeightUnit } from "@/modules/health/types";
import { cn } from "@/lib/utils";

/**
 * kg / lb switch. Saved on its own (not with the big form) so a fresh setup's
 * bar and plates swap to that unit's standard ones — see updateGymSettings.
 */
export function UnitSwitch({ unit }: { unit: WeightUnit }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Weight unit"
        className="inline-flex rounded-lg border p-0.5"
      >
        {WEIGHT_UNITS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={unit === option}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await patchGymSettingsAction({ weightUnit: option });
                setError(result.error ?? null);
              })
            }
            className={cn(
              "rounded-md px-4 py-1.5 text-sm",
              unit === option ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {option}
          </button>
        ))}
      </div>
      <p className="text-muted-foreground mt-2 text-sm">
        Weights are always stored in kg; this changes how they&apos;re shown and typed, and the
        default load jumps (2.5 / 5 kg or 5 / 10 lb).
      </p>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
