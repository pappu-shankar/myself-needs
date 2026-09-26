"use client";

import { useActionState, useEffect, useRef, useState } from "react";
// Import directly from actions.ts, not the module's index.ts barrel — see
// docs/architecture/system-design.md.
import {
  updateSkinToneAction,
  saveOutfitAction,
  type SaveOutfitState,
} from "@/modules/fashion/actions";
import type { getPhoto } from "@/modules/fashion";
// lab-color.ts is pure math, safe to import directly in client code — see
// the note in recolor-canvas.ts.
import { scoreContrast, type LabColor } from "@/modules/fashion/service/lab-color";
import {
  analyzePhoto,
  type PoseSegmentationResult,
} from "@/modules/fashion/client/pose-segmentation";
import {
  estimateSkinSampleRegion,
  sampleSkinToneLab,
} from "@/modules/fashion/client/skin-sampling";
import { recolorCanvas } from "@/modules/fashion/client/recolor-canvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField, FormFieldAction } from "@/components/ui/form-field";
import { ContrastBadge } from "./contrast-badge";

type Photo = NonNullable<ReturnType<typeof getPhoto>>;

const DEFAULT_SHIRT_HEX = "#3b5f8a";
const DEFAULT_PANTS_HEX = "#38414a";

const saveInitialState: SaveOutfitState = {};

type AnalysisStatus = "loading" | "ready" | "error";

export function EditorWorkspace({ photo }: { photo: Photo }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [shirtHex, setShirtHex] = useState(DEFAULT_SHIRT_HEX);
  const [pantsHex, setPantsHex] = useState(DEFAULT_PANTS_HEX);
  const [analysis, setAnalysis] = useState<PoseSegmentationResult | null>(null);
  const [status, setStatus] = useState<AnalysisStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [skinTone, setSkinTone] = useState<LabColor | null>(
    photo.skinToneLabL !== null && photo.skinToneLabA !== null && photo.skinToneLabB !== null
      ? { l: photo.skinToneLabL, a: photo.skinToneLabA, b: photo.skinToneLabB }
      : null,
  );

  const [saveState, saveFormAction, isSaving] = useActionState(saveOutfitAction, saveInitialState);

  // Guards against running analysis twice: the <img>'s onLoad only fires if
  // the image wasn't already loaded at mount time. A previously-cached
  // photo (revisiting the same editor) can finish loading before React
  // attaches the listener, so onLoad never fires at all — the mount effect
  // below covers that case by checking img.complete directly.
  const analysisStartedRef = useRef(false);

  async function handleImageLoad() {
    if (analysisStartedRef.current) return;
    analysisStartedRef.current = true;

    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    // willReadFrequently: true here since this is the first (and thus
    // context-defining) getContext("2d") call for this canvas, and both
    // this component and recolor-canvas.ts call getImageData on it
    // repeatedly (skin sampling once, recoloring on every color change).
    const drawCtx = canvas.getContext("2d", { willReadFrequently: true });
    drawCtx?.drawImage(img, 0, 0);

    try {
      const result = await analyzePhoto(img);
      setAnalysis(result);

      if (skinTone === null) {
        const imageData = drawCtx?.getImageData(0, 0, canvas.width, canvas.height);
        if (imageData) {
          const region = estimateSkinSampleRegion(result.landmarks, result.width, result.height);
          const sampledLab = sampleSkinToneLab(imageData.data, result.width, result.height, region);
          setSkinTone(sampledLab);

          const formData = new FormData();
          formData.set("photoId", String(photo.id));
          formData.set("labL", String(sampledLab.l));
          formData.set("labA", String(sampledLab.a));
          formData.set("labB", String(sampledLab.b));
          void updateSkinToneAction({}, formData);
        }
      }

      setStatus("ready");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Couldn't analyze this photo");
      setStatus("error");
    }
  }

  // Covers the cached-image race described above handleImageLoad: if the
  // image already finished loading before this effect runs, kick off
  // analysis directly instead of waiting for an onLoad that will never fire.
  useEffect(() => {
    if (imgRef.current?.complete) {
      void handleImageLoad();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount; handleImageLoad is guarded by analysisStartedRef, not meant to re-run on every render
  }, []);

  // Re-recolors the canvas whenever a color changes. Safe to reapply
  // directly on top of the currently displayed (possibly already
  // recolored) pixels rather than redrawing from the original each time —
  // applyHueShift always replaces hue/saturation from the target color
  // while keeping whatever lightness is currently in the canvas, and
  // lightness is never touched by a previous recolor, so it stays correct
  // across repeated calls.
  useEffect(() => {
    if (status !== "ready" || !analysis || !canvasRef.current) return;
    recolorCanvas(canvasRef.current, analysis.shirtMask, shirtHex, analysis.pantsMask, pantsHex);
  }, [status, analysis, shirtHex, pantsHex]);

  const shirtContrast = skinTone ? scoreContrast(shirtHex, skinTone) : null;
  const pantsContrast = skinTone ? scoreContrast(pantsHex, skinTone) : null;

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element -- source for
            in-browser MediaPipe analysis + canvas draw, not a displayed asset */}
        <img
          ref={imgRef}
          src={`/api/fashion/photos/${photo.filename}`}
          alt=""
          onLoad={handleImageLoad}
          className="hidden"
        />
        <canvas ref={canvasRef} className="border-border max-w-full rounded-lg border" />
        {status === "loading" && (
          <p className="text-muted-foreground mt-2 text-sm">Analyzing photo…</p>
        )}
        {status === "error" && (
          <p role="alert" className="text-destructive mt-2 text-sm">
            {errorMessage}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="shirtColor" className="text-sm font-medium">
              Shirt color
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="color"
                id="shirtColor"
                value={shirtHex}
                onChange={(e) => setShirtHex(e.target.value)}
                disabled={status !== "ready"}
                className="border-input h-9 w-14 rounded border"
              />
              {shirtContrast && <ContrastBadge verdict={shirtContrast} />}
            </div>
          </div>

          <div>
            <label htmlFor="pantsColor" className="text-sm font-medium">
              Pants color
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="color"
                id="pantsColor"
                value={pantsHex}
                onChange={(e) => setPantsHex(e.target.value)}
                disabled={status !== "ready"}
                className="border-input h-9 w-14 rounded border"
              />
              {pantsContrast && <ContrastBadge verdict={pantsContrast} />}
            </div>
          </div>
        </div>

        <form
          action={saveFormAction}
          className="flex flex-col items-start gap-3 sm:flex-row sm:items-end"
        >
          <input type="hidden" name="photoId" value={photo.id} />
          <input type="hidden" name="shirtColorHex" value={shirtHex} />
          <input type="hidden" name="pantsColorHex" value={pantsHex} />

          <FormField label="Outfit name" htmlFor="name">
            <Input type="text" name="name" id="name" required />
          </FormField>

          <FormFieldAction label="Save outfit">
            <Button type="submit" disabled={isSaving || status !== "ready"}>
              {isSaving ? "Saving…" : "Save outfit"}
            </Button>
          </FormFieldAction>

          {saveState.error && (
            <p role="alert" className="text-destructive text-sm">
              {saveState.error}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
