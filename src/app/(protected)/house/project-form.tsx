"use client";

import { useActionState, useEffect, useRef, useState } from "react";
// Import directly from actions.ts, not the module's index.ts barrel — see
// docs/architecture/system-design.md.
import {
  addProjectAction,
  updateProjectAction,
  type AddProjectState,
} from "@/modules/house/actions";
import { ROOF_TYPES, type RoofType } from "@/modules/house/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";

const initialState: AddProjectState = {};

const ROOF_LABELS: Record<RoofType, string> = {
  flat: "Flat",
  gabled: "Gabled",
  hip: "Hip",
};

export interface ProjectFormValues {
  id: number;
  name: string;
  notes: string | null;
  roofType: RoofType;
  roofPitchDegrees: number | null;
}

export function ProjectForm({
  project,
  onSuccess,
}: {
  project?: ProjectFormValues;
  onSuccess?: () => void;
}) {
  const action = project ? updateProjectAction : addProjectAction;
  const [state, formAction, isPending] = useActionState(action, initialState);
  // Captured once on mount — see room-form.tsx for why.
  const [initial] = useState(project);
  const [roofType, setRoofType] = useState<RoofType>(initial?.roofType ?? "gabled");

  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending && !state.error) onSuccess?.();
    wasPending.current = isPending;
  }, [isPending, state.error, onSuccess]);

  return (
    <form action={formAction} className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <FormField label="Name" htmlFor="projectName">
        <Input type="text" name="name" id="projectName" defaultValue={initial?.name} required />
      </FormField>
      <FormField label="Roof type" htmlFor="roofType">
        <select
          name="roofType"
          id="roofType"
          value={roofType}
          onChange={(e) => setRoofType(e.target.value as RoofType)}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {ROOF_TYPES.map((t) => (
            <option key={t} value={t}>
              {ROOF_LABELS[t]}
            </option>
          ))}
        </select>
      </FormField>
      {roofType !== "flat" && (
        <FormField label="Roof pitch (degrees)" htmlFor="roofPitchDegrees" hint="Optional">
          <Input
            type="number"
            step="any"
            name="roofPitchDegrees"
            id="roofPitchDegrees"
            defaultValue={initial?.roofPitchDegrees ?? undefined}
            className="tabular-nums"
          />
        </FormField>
      )}
      <FormField label="Notes" htmlFor="projectNotes" hint="Optional" className="sm:col-span-2">
        <Input
          type="text"
          name="notes"
          id="projectNotes"
          defaultValue={initial?.notes ?? undefined}
        />
      </FormField>
      <FormFieldAction label={project ? "Save changes" : "Add project"}>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : project ? "Save changes" : "Add project"}
        </Button>
      </FormFieldAction>
      {state.error && (
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          {state.error}
        </p>
      )}
    </form>
  );
}
