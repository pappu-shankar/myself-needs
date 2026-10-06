"use client";

import { useActionState } from "react";
import { updateProfileAction } from "@/modules/core/auth/account-actions";
import type { ActionState } from "@/modules/core/action/types";
import { Button } from "@/components/ui/button";
import { ColorSwatchPicker } from "@/components/ui/color-swatch-picker";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

const initialState: ActionState = {};

export function ProfileForm({
  displayName,
  color,
}: {
  displayName: string | null;
  color: string | null;
}) {
  const [state, formAction, isPending] = useActionState(updateProfileAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormField
        label="Display name"
        htmlFor="displayName"
        hint="Shown in the sidebar and to people in your spaces. Leave blank to use your username."
        error={state.fieldErrors?.displayName?.[0]}
      >
        <Input
          name="displayName"
          defaultValue={state.values?.displayName ?? displayName ?? ""}
          maxLength={200}
          autoComplete="nickname"
        />
      </FormField>
      <FormField
        label="Colour"
        htmlFor="profileColor"
        hint="Used behind your initials when you have no picture."
        error={state.fieldErrors?.color?.[0]}
      >
        <ColorSwatchPicker name="color" defaultValue={state.values?.color ?? color ?? ""} />
      </FormField>
      {state.error && !state.fieldErrors && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="text-sm">
          Profile saved.
        </p>
      )}
      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
