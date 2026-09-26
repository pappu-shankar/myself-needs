import {
  FilesetResolver,
  PoseLandmarker,
  ImageSegmenter,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { deriveBodyRegionMasks, type BodyRegionMasks } from "./body-region-masks";
import { resizeMask } from "./mask-resize";

// WasmFileset itself isn't exported by @mediapipe/tasks-vision (a gap in
// its own type declarations), so it's derived here instead of imported.
type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

// Served from public/models/ — see scripts/fetch-fashion-models.sh. Never a
// CDN URL: that would silently turn Track A into a network call at
// runtime, breaking the "photo never leaves the machine" requirement.
const WASM_BASE_PATH = "/models/wasm";
const POSE_MODEL_PATH = "/models/pose_landmarker_lite.task";
const SEGMENTER_MODEL_PATH = "/models/selfie_segmentation.tflite";

// out of 255, from MPMask.getAsUint8Array() on the "selfie" confidence
// mask. Deliberately lower than the "50% confidence" midpoint (127) —
// verified against a real photo during development: a shadowed leg (a
// doorway partially blocking direct light) scored well below 127 despite
// clearly being the person, causing visible gaps in the recolored pants.
// Since this mask is always intersected with the geometric shoulders/hips/
// knees/ankles band (deriveBodyRegionMasks), a lower threshold's false
// positives are already constrained to the plausible body region rather
// than leaking into the wider background.
const PERSON_CONFIDENCE_THRESHOLD = 60;

let filesetPromise: Promise<WasmFileset> | null = null;
function loadFileset(): Promise<WasmFileset> {
  if (!filesetPromise) filesetPromise = FilesetResolver.forVisionTasks(WASM_BASE_PATH);
  return filesetPromise;
}

let poseLandmarkerPromise: Promise<PoseLandmarker> | null = null;
function loadPoseLandmarker(): Promise<PoseLandmarker> {
  if (!poseLandmarkerPromise) {
    poseLandmarkerPromise = loadFileset().then((fileset) =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL_PATH },
        runningMode: "IMAGE",
      }),
    );
  }
  return poseLandmarkerPromise;
}

let imageSegmenterPromise: Promise<ImageSegmenter> | null = null;
function loadImageSegmenter(): Promise<ImageSegmenter> {
  if (!imageSegmenterPromise) {
    imageSegmenterPromise = loadFileset().then((fileset) =>
      ImageSegmenter.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: SEGMENTER_MODEL_PATH },
        runningMode: "IMAGE",
        outputCategoryMask: false,
        outputConfidenceMasks: true,
      }),
    );
  }
  return imageSegmenterPromise;
}

export interface PoseSegmentationResult extends BodyRegionMasks {
  width: number;
  height: number;
  landmarks: NormalizedLandmark[];
  /** 1 where the segmenter classified the pixel as person, 0 otherwise —
   * at full image resolution, same as shirtMask/pantsMask. */
  personMask: Uint8Array;
}

/**
 * Runs pose landmarking + person segmentation on an already-loaded <img>
 * entirely in-browser (WASM) — zero network calls once the model files
 * under public/models/ exist locally. Both models are loaded once and
 * cached for the lifetime of the page. Not unit-tested: needs a real WASM
 * runtime and DOM image element, which is exactly the kind of thing this
 * app's test suite can't exercise — see docs/prd/fashion.md's testing
 * notes for what's verified live/manually instead.
 */
export async function analyzePhoto(image: HTMLImageElement): Promise<PoseSegmentationResult> {
  const [poseLandmarker, imageSegmenter] = await Promise.all([
    loadPoseLandmarker(),
    loadImageSegmenter(),
  ]);

  const poseResult = poseLandmarker.detect(image);
  const landmarks = poseResult.landmarks[0];
  if (!landmarks) {
    throw new Error(
      "No person detected in this photo — try a clearer, front-facing full-body photo.",
    );
  }

  const width = image.naturalWidth;
  const height = image.naturalHeight;

  return new Promise((resolve, reject) => {
    imageSegmenter.segment(image, (result) => {
      const confidenceMask = result.confidenceMasks?.[0];
      if (!confidenceMask) {
        reject(new Error("Segmentation failed to produce a mask"));
        return;
      }

      // The mask is typically produced at the model's own internal
      // resolution, not the photo's — resize before applying it pixel-for-
      // pixel against the full-resolution image/canvas.
      const rawBytes = confidenceMask.getAsUint8Array();
      const rawMask = new Uint8Array(rawBytes.length);
      for (let i = 0; i < rawBytes.length; i++) {
        rawMask[i] = rawBytes[i] > PERSON_CONFIDENCE_THRESHOLD ? 1 : 0;
      }
      const personMask = resizeMask(
        rawMask,
        confidenceMask.width,
        confidenceMask.height,
        width,
        height,
      );

      const { shirtMask, pantsMask } = deriveBodyRegionMasks(landmarks, personMask, width, height);
      resolve({ width, height, landmarks, personMask, shirtMask, pantsMask });
    });
  });
}
