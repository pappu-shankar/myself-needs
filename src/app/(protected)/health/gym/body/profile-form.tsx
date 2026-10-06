"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FormField, FormFieldAction } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { patchGymSettingsAction } from "@/modules/health/actions/gym/settings";
import { toDisplayWeight } from "@/modules/health/engine/units";
import { SEXES, type Sex, type WeightUnit } from "@/modules/health/types";
import { toStorageKg } from "./body-helpers";

interface ProfileFormProps {
  sex: Sex | null;
  heightCm: number | null;
  goalWeightKg: number | null;
  weightUnit: WeightUnit;
}

function parseOptional(value: FormDataEntryValue | null): number | null | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Sex, height and goal weight: the three body facts the formulas on this page need. */
export function ProfileForm({ sex, heightCm, goalWeightKg, weightUnit }: ProfileFormProps) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const sexValue = form.get("sex");
    const height = parseOptional(form.get("heightCm"));
    const goal = parseOptional(form.get("goalWeightKg"));
    if (height === undefined || goal === undefined) {
      setMessage({ ok: false, text: "Height and goal weight must be positive numbers." });
      return;
    }
    startTransition(async () => {
      const result = await patchGymSettingsAction({
        sex: SEXES.find((s) => s === sexValue) ?? null,
        heightCm: height,
        goalWeightKg: goal === null ? null : toStorageKg(goal, weightUnit),
      });
      setMessage(
        result.ok
          ? { ok: true, text: "Saved." }
          : { ok: false, text: result.error ?? "Could not save." },
      );
    });
  }

  return (
    <form
      // Remount the uncontrolled inputs when the saved values change (after a save
      // revalidates the page), instead of changing their defaultValue in place.
      key={`${sex ?? ""}|${heightCm ?? ""}|${goalWeightKg ?? ""}|${weightUnit}`}
      onSubmit={onSubmit}
      className="grid grid-cols-1 items-start gap-4 sm:grid-cols-4"
    >
      <FormField
        label="Sex"
        htmlFor="profileSex"
        hint="Picks the DOTS and strength tables, the body-fat formula and the body-map figure."
      >
        <select
          name="sex"
          defaultValue={sex ?? ""}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          <option value="">Not set</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </FormField>
      <FormField
        label="Height (cm)"
        htmlFor="profileHeight"
        hint="Needed for BMI, body fat, FFMI and waist-to-height."
      >
        <Input
          type="number"
          name="heightCm"
          step="0.1"
          min="50"
          max="272"
          inputMode="decimal"
          defaultValue={heightCm ?? ""}
          className="tabular-nums"
        />
      </FormField>
      <FormField
        label={`Goal weight (${weightUnit})`}
        htmlFor="profileGoal"
        hint="Drawn on the weight chart; progress runs from your weight 90 days ago."
      >
        <Input
          type="number"
          name="goalWeightKg"
          step="0.1"
          min={weightUnit === "lb" ? 44 : 20}
          max={weightUnit === "lb" ? 880 : 400}
          inputMode="decimal"
          defaultValue={goalWeightKg === null ? "" : toDisplayWeight(goalWeightKg, weightUnit)}
          className="tabular-nums"
        />
      </FormField>
      <FormFieldAction label="Save profile">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </FormFieldAction>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={
            message.ok
              ? "text-muted-foreground text-sm sm:col-span-4"
              : "text-destructive text-sm sm:col-span-4"
          }
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
