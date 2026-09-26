"use client";

import { useActionState, useState } from "react";
// Import directly from actions.ts, not the module's index.ts barrel — see
// docs/architecture/system-design.md.
import { uploadPhotoAction, type UploadPhotoState } from "@/modules/fashion/actions";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";

const initialState: UploadPhotoState = {};

export function UploadForm() {
  const [state, formAction, isPending] = useActionState(uploadPhotoAction, initialState);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setDimensions(null);
      return;
    }
    const bitmap = await createImageBitmap(file);
    setDimensions({ width: bitmap.width, height: bitmap.height });
    bitmap.close();
  }

  return (
    <form action={formAction} className="flex flex-col items-start gap-4 sm:flex-row sm:items-end">
      <FormField label="Photo" htmlFor="photo" hint="A full-body, front-facing photo works best">
        <input
          type="file"
          name="photo"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          required
          className="border-input bg-background file:border-input file:bg-secondary block w-full rounded-md border text-sm file:mr-3 file:rounded-sm file:border file:px-2 file:py-1"
        />
      </FormField>
      <input type="hidden" name="widthPx" value={dimensions?.width ?? ""} />
      <input type="hidden" name="heightPx" value={dimensions?.height ?? ""} />

      <Button type="submit" disabled={isPending || !dimensions}>
        {isPending ? "Uploading…" : "Upload photo"}
      </Button>

      {state.error && (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}
