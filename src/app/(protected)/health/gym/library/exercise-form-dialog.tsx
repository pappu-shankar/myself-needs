"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import {
  createCustomExerciseAction,
  updateCustomExerciseAction,
  type CreateCustomExerciseState,
} from "@/modules/health/actions/gym/exercises";
import {
  BODY_PARTS,
  EXERCISE_MODES,
  EXERCISE_MODE_LABELS,
  type ExerciseMode,
} from "@/modules/health/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useActionSuccess } from "@/lib/use-action-success";
import { capitalize } from "./library-params";

/** Primary-muscle choices, in the exercise dataset's vocabulary. */
const TARGET_OPTIONS: Array<[value: string, label: string]> = [
  ["pectorals", "Chest"],
  ["upper back", "Upper back"],
  ["lats", "Lats"],
  ["delts", "Shoulders"],
  ["traps", "Traps"],
  ["biceps", "Biceps"],
  ["triceps", "Triceps"],
  ["forearms", "Forearms"],
  ["abs", "Abs"],
  ["obliques", "Obliques"],
  ["spine", "Lower back"],
  ["glutes", "Glutes"],
  ["quads", "Quads"],
  ["hamstrings", "Hamstrings"],
  ["adductors", "Adductors"],
  ["hip flexors", "Hip flexors"],
  ["calves", "Calves"],
  ["shins", "Shins"],
];

export interface ExerciseFormValues {
  id: number;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  defaultMode: ExerciseMode;
  isBodyweight: boolean;
  isUnilateral: boolean;
  instructions: string[];
  notes: string | null;
}

const selectClass = "border-input bg-background h-8 w-full rounded-md border px-3 text-sm";
const textareaClass =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 w-full rounded-lg border px-2.5 py-1.5 text-base outline-none focus-visible:ring-3 md:text-sm";

function ExerciseForm({
  exercise,
  equipmentOptions,
  onDone,
}: {
  exercise?: ExerciseFormValues;
  equipmentOptions: string[];
  onDone: (id: number | undefined) => void;
}) {
  const [state, formAction, isPending] = useActionState<CreateCustomExerciseState, FormData>(
    (exercise ? updateCustomExerciseAction : createCustomExerciseAction) as (
      prev: CreateCustomExerciseState,
      formData: FormData,
    ) => Promise<CreateCustomExerciseState>,
    {},
  );
  useActionSuccess(state, (data) => onDone(data?.id));

  const echoed = state.values;
  const text = (key: string, initial: string) => echoed?.[key] ?? initial;
  const checked = (key: string, initial: boolean) => (echoed ? key in echoed : initial);
  const fe = (key: string) => state.fieldErrors?.[key]?.[0];
  const target = text("target", exercise?.target ?? "");
  const targetKnown = !target || TARGET_OPTIONS.some(([value]) => value === target);

  return (
    <form action={formAction} className="grid gap-4">
      {exercise && <input type="hidden" name="id" value={exercise.id} />}
      <FormField label="Name" htmlFor="ex-name" error={fe("name")}>
        <Input
          name="name"
          required
          maxLength={100}
          defaultValue={text("name", exercise?.name ?? "")}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Body part" htmlFor="ex-bodyPart" error={fe("bodyPart")}>
          <select
            name="bodyPart"
            required
            className={selectClass}
            defaultValue={text("bodyPart", exercise?.bodyPart ?? "")}
          >
            <option value="" disabled>
              Choose…
            </option>
            {BODY_PARTS.map((part) => (
              <option key={part} value={part}>
                {capitalize(part)}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Equipment" htmlFor="ex-equipment" hint="Blank = body weight or other">
          <Input
            name="equipment"
            list="ex-equipment-options"
            maxLength={60}
            defaultValue={text("equipment", exercise?.equipment ?? "")}
          />
        </FormField>
        <datalist id="ex-equipment-options">
          {equipmentOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
        <FormField label="Primary muscle" htmlFor="ex-target">
          <select name="target" className={selectClass} defaultValue={target}>
            <option value="">Default for body part</option>
            {!targetKnown && <option value={target}>{capitalize(target)}</option>}
            {TARGET_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="How it's logged" htmlFor="ex-defaultMode" error={fe("defaultMode")}>
          <select
            name="defaultMode"
            className={selectClass}
            defaultValue={text("defaultMode", exercise?.defaultMode ?? "reps")}
          >
            {EXERCISE_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {EXERCISE_MODE_LABELS[mode]}
              </option>
            ))}
          </select>
        </FormField>
      </div>
      <FormField
        label="Secondary muscles"
        htmlFor="ex-secondaryMuscles"
        hint="Comma-separated, e.g. triceps, delts"
      >
        <Input
          name="secondaryMuscles"
          defaultValue={text("secondaryMuscles", exercise?.secondaryMuscles.join(", ") ?? "")}
        />
      </FormField>
      <fieldset className="flex flex-col gap-2 text-sm">
        <legend className="sr-only">Options</legend>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isBodyweight"
            className="size-4"
            defaultChecked={checked("isBodyweight", exercise?.isBodyweight ?? false)}
          />
          Bodyweight (logged weight means added load)
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="isUnilateral"
            className="size-4"
            defaultChecked={checked("isUnilateral", exercise?.isUnilateral ?? false)}
          />
          One side at a time
        </label>
      </fieldset>
      <FormField
        label="Instructions"
        htmlFor="ex-instructions"
        hint="One step per line"
        error={fe("instructions")}
      >
        <textarea
          name="instructions"
          rows={4}
          className={textareaClass}
          defaultValue={text("instructions", exercise?.instructions.join("\n") ?? "")}
        />
      </FormField>
      <FormField label="Notes" htmlFor="ex-notes" error={fe("notes")}>
        <textarea
          name="notes"
          rows={2}
          maxLength={2000}
          className={textareaClass}
          defaultValue={text("notes", exercise?.notes ?? "")}
        />
      </FormField>
      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : exercise ? "Save changes" : "Create exercise"}
      </Button>
    </form>
  );
}

export function ExerciseFormDialog({
  exercise,
  equipmentOptions,
}: {
  exercise?: ExerciseFormValues;
  equipmentOptions: string[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const label = exercise ? "Edit" : "New exercise";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={exercise ? "outline" : "default"} />}>
        {exercise ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}
        {label}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{exercise ? "Edit exercise" : "New exercise"}</DialogTitle>
          <DialogDescription>
            {exercise
              ? "Changes apply to your history too, since it points at this exercise."
              : "Name and body part are enough; everything else has a sensible default."}
          </DialogDescription>
        </DialogHeader>
        <ExerciseForm
          exercise={exercise}
          equipmentOptions={equipmentOptions}
          onDone={(id) => {
            setOpen(false);
            if (!exercise && id !== undefined) router.push(`/health/gym/library/${id}`);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
