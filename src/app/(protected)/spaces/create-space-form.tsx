"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { createSpaceAction } from "@/modules/core/spaces/actions";
import type { SpaceModule } from "@/modules/core/auth/spaces-store";
import type { ActionState } from "@/modules/core/action/types";
import { useActionSuccess } from "@/lib/use-action-success";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ModuleCheckboxes } from "./module-checkboxes";

const initialState: ActionState<{ id: string }> = {};

export function CreateSpaceForm({ modules }: { modules: readonly SpaceModule[] }) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createSpaceAction, initialState);
  useActionSuccess(state, (data) => {
    if (data) router.push(`/spaces/${data.id}`);
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormField
        label="Name"
        htmlFor="spaceName"
        hint="For example “Household” or “Flat 4B”."
        error={state.fieldErrors?.name?.[0]}
      >
        <Input name="name" required maxLength={60} defaultValue={state.values?.name ?? ""} />
      </FormField>
      <ModuleCheckboxes
        modules={modules}
        defaultChecked={["finance", "house"]}
        legend="Modules to share"
        idPrefix="new-space-module"
      />
      {state.error && !state.fieldErrors && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={isPending} className="self-start">
        {isPending ? "Creating…" : "Create space"}
      </Button>
    </form>
  );
}
