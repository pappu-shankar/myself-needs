"use client";

import { useRef, useState } from "react";
// Import directly from actions.ts, not the module's index.ts barrel — see
// docs/architecture/system-design.md.
import { uploadGarmentAction } from "@/modules/fashion/actions";
import { removeSolidBackground } from "@/modules/fashion/client/background-removal";
import { extractGarmentColor } from "@/modules/fashion/client/garment-color";
// lab-color.ts is pure math, safe to import directly in client code — see
// the note in recolor-canvas.ts.
import { labToHex } from "@/modules/fashion/service/lab-color";
import { GARMENT_CATEGORIES, type GarmentCategory } from "@/modules/fashion/types";
import { FormField } from "@/components/ui/form-field";

const CATEGORY_LABELS: Record<GarmentCategory, string> = { shirt: "Shirt", pants: "Pants" };

export function GarmentUploadForm() {
  const [category, setCategory] = useState<GarmentCategory>("shirt");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setError(null);

    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas not supported in this browser");
      ctx.drawImage(bitmap, 0, 0);
      bitmap.close();

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const cleaned = removeSolidBackground(imageData.data, canvas.width, canvas.height);
      const lab = extractGarmentColor(cleaned);
      const hex = labToHex(lab);

      // Write the background-removed pixels back before exporting, so the
      // stored file itself has the transparent background, not just this
      // in-memory analysis.
      ctx.putImageData(new ImageData(cleaned, canvas.width, canvas.height), 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Couldn't process this photo");

      const formData = new FormData();
      formData.set("photo", blob, file.name);
      formData.set("category", category);
      formData.set("representativeColorLabL", String(lab.l));
      formData.set("representativeColorLabA", String(lab.a));
      formData.set("representativeColorLabB", String(lab.b));
      formData.set("representativeColorHex", hex);

      const result = await uploadGarmentAction({}, formData);
      if (result.error) setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't process this photo");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end">
      <FormField label="Category" htmlFor="garmentCategory">
        <select
          id="garmentCategory"
          value={category}
          onChange={(e) => setCategory(e.target.value as GarmentCategory)}
          disabled={isUploading}
          className="border-input bg-background h-8 rounded-md border px-3 text-sm"
        >
          {GARMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </FormField>

      <FormField
        label="Photo"
        htmlFor="garmentPhoto"
        hint="A plain background (bed, wall, table) works best — it's removed automatically"
      >
        <input
          ref={fileInputRef}
          type="file"
          id="garmentPhoto"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          disabled={isUploading}
          className="border-input bg-background file:border-input file:bg-secondary block w-full rounded-md border text-sm file:mr-3 file:rounded-sm file:border file:px-2 file:py-1"
        />
      </FormField>

      {isUploading && <p className="text-muted-foreground text-sm">Processing…</p>}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
