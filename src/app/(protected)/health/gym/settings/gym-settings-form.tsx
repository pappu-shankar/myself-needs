"use client";

import { useActionState } from "react";
import { updateGymSettingsAction } from "@/modules/health/actions/gym/settings";
import type { GymSettings } from "@/modules/health";
import type { ActionState } from "@/modules/core/action/types";
import { E1RM_FORMULAS, EFFORT_SCALES, SEXES } from "@/modules/health/types";
import { toDisplayWeight } from "@/modules/health/engine/units";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";

const initialState: ActionState = {};

const EFFORT_LABELS = {
  none: "Don't rate sets",
  rir: "RIR — reps left in the tank",
  rpe: "RPE — effort out of 10",
} as const;

const FORMULA_LABELS = { epley: "Epley", brzycki: "Brzycki", lombardi: "Lombardi" } as const;

const selectClass = "border-input bg-background h-8 w-full rounded-md border px-2 text-sm";

function Toggle({
  name,
  label,
  hint,
  defaultChecked,
}: {
  name: keyof GymSettings;
  label: string;
  hint: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1" />
      <span>
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground block">{hint}</span>
      </span>
    </label>
  );
}

export function GymSettingsForm({
  settings,
  equipment,
}: {
  settings: GymSettings;
  equipment: string[];
}) {
  const [state, formAction, isPending] = useActionState(updateGymSettingsAction, initialState);
  const owned = new Set(settings.ownedEquipment);
  const unit = settings.weightUnit;
  const shown = (kg: number) => toDisplayWeight(kg, unit);
  // Remount the uncontrolled inputs whenever the saved values change.
  const formKey = `${settings.updatedAt ?? ""}:${state.error ? JSON.stringify(state.values) : ""}`;

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-6">
      {/* Weight fields are typed in the display unit; the action converts to kg. */}
      <input type="hidden" name="inputUnit" value={unit} />
      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">You</legend>
        <FormField label="Sex" htmlFor="sex" hint="For DOTS, body-fat estimates and the body map.">
          <select name="sex" defaultValue={settings.sex ?? ""} className={selectClass}>
            <option value="">Not set</option>
            {SEXES.map((s) => (
              <option key={s} value={s}>
                {s === "male" ? "Male" : "Female"}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Height (cm)" htmlFor="heightCm">
          <Input
            type="number"
            step="any"
            name="heightCm"
            defaultValue={settings.heightCm ?? ""}
            className="tabular-nums"
          />
        </FormField>
        <FormField label={`Goal weight (${unit})`} htmlFor="goalWeightKg">
          <Input
            type="number"
            step="any"
            name="goalWeightKg"
            defaultValue={settings.goalWeightKg === null ? "" : shown(settings.goalWeightKg)}
            className="tabular-nums"
          />
        </FormField>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">Logging</legend>
        <FormField label="Effort per set" htmlFor="effortScale">
          <select name="effortScale" defaultValue={settings.effortScale} className={selectClass}>
            {EFFORT_SCALES.map((s) => (
              <option key={s} value={s}>
                {EFFORT_LABELS[s]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Default rest (seconds)" htmlFor="defaultRestSec">
          <Input
            type="number"
            name="defaultRestSec"
            defaultValue={settings.defaultRestSec}
            className="tabular-nums"
          />
        </FormField>
        <FormField
          label="1RM formula"
          htmlFor="e1rmFormula"
          hint="Used for estimated 1RM, PRs and autoregulation."
        >
          <select name="e1rmFormula" defaultValue={settings.e1rmFormula} className={selectClass}>
            {E1RM_FORMULAS.map((f) => (
              <option key={f} value={f}>
                {FORMULA_LABELS[f]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Weekly session goal" htmlFor="weeklySessionGoal">
          <Input
            type="number"
            name="weeklySessionGoal"
            defaultValue={settings.weeklySessionGoal}
            className="tabular-nums"
          />
        </FormField>
        <FormField
          label="Sleep target (hours)"
          htmlFor="sleepTargetHours"
          hint="Readiness compares last night's sleep with this."
        >
          <Input
            type="number"
            step="any"
            name="sleepTargetHours"
            defaultValue={settings.sleepTargetHours}
            className="tabular-nums"
          />
        </FormField>
      </fieldset>

      <fieldset className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">Barbell</legend>
        <FormField label={`Bar weight (${unit})`} htmlFor="barWeightKg">
          <Input
            type="number"
            step="any"
            name="barWeightKg"
            defaultValue={shown(settings.barWeightKg)}
            className="tabular-nums"
          />
        </FormField>
        <FormField
          label={`Plates you have (${unit})`}
          htmlFor="platesKg"
          hint="Comma-separated, pairs assumed."
          className="sm:col-span-2"
        >
          <Input
            type="text"
            name="platesKg"
            defaultValue={settings.platesKg.map(shown).join(", ")}
            className="tabular-nums"
          />
        </FormField>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-sm font-medium">Equipment you have</legend>
        <p className="text-muted-foreground mb-3 text-sm">
          Used by the &ldquo;only equipment I have&rdquo; filter. Tick nothing to mean everything.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {equipment.map((name) => (
            <label key={name} className="flex items-center gap-2 text-sm capitalize">
              <input
                type="checkbox"
                name="ownedEquipment"
                value={name}
                defaultChecked={owned.has(name)}
              />
              {name}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">During a workout</legend>
        <Toggle
          name="askBodyweightOnStart"
          label="Ask for body weight when starting"
          hint="Saved as a normal weigh-in."
          defaultChecked={settings.askBodyweightOnStart}
        />
        <Toggle
          name="keepAwake"
          label="Keep the screen awake"
          hint="Only while a workout is open, where the browser supports it."
          defaultChecked={settings.keepAwake}
        />
        <Toggle
          name="restSound"
          label="Beep when rest is over"
          hint="A short tone at the end of the rest timer."
          defaultChecked={settings.restSound}
        />
        <Toggle
          name="restNotifications"
          label="Notify when rest is over"
          hint="A browser notification if the tab is in the background (asks permission once)."
          defaultChecked={settings.restNotifications}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-medium">Camera rep counter</legend>
        <Toggle
          name="voiceCoach"
          label="Voice coach"
          hint="Speaks each rep and form cues aloud, using your browser's built-in voice."
          defaultChecked={settings.voiceCoach}
        />
        <Toggle
          name="cameraAutoLog"
          label="Log the set when I stop"
          hint="During a workout, the counted reps are saved a few seconds after you stop moving (you can cancel)."
          defaultChecked={settings.cameraAutoLog}
        />
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save settings"}
        </Button>
        {state.ok && (
          <p className="text-muted-foreground text-sm" role="status">
            Saved.
          </p>
        )}
        {state.error && (
          <p className="text-destructive text-sm" role="alert">
            {state.error}
          </p>
        )}
      </div>
    </form>
  );
}
