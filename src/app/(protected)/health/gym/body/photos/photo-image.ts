import type { Pose } from "@/modules/health/client/pose/geometry";
import { fitWithin, toLandmarkTuples, type LandmarkTuple } from "./photo-helpers";

/**
 * Browser-only image plumbing for progress photos: downscale onto a canvas,
 * encode (WebP when the browser can, else JPEG), base64 for the Server
 * Action, and pose detection on a still image. Not unit-tested (Canvas);
 * the size math it relies on lives in photo-helpers.ts, which is.
 */

export type PhotoMimeType = "image/jpeg" | "image/webp";

/** A downscaled, encoded photo ready for review and saving. */
export interface CapturedPhoto {
  base64: string;
  mimeType: PhotoMimeType;
  width: number;
  height: number;
  landmarks: LandmarkTuple[] | null;
  /** `data:` URL of the same bytes, for the review preview. */
  previewUrl: string;
  source: "camera" | "upload";
  /** Pose detection couldn't run (model missing/failed), as opposed to "no one found". */
  poseUnavailable: boolean;
}

const QUALITY = 0.85;

export class PhotoError extends Error {}

/** Draws `source` onto a new canvas at most 1080 px on the long side. */
export function drawDownscaled(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): HTMLCanvasElement {
  const size = fitWithin(sourceWidth, sourceHeight);
  if (!size) throw new PhotoError("That image is too small — use one at least 64 px on each side.");
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoError("This browser can't process images.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, size.width, size.height);
  return canvas;
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new PhotoError("Couldn't read the encoded photo."));
    reader.readAsDataURL(blob);
  });
}

/** WebP where supported (browsers that can't encode it silently return PNG), else JPEG. */
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
): Promise<{ base64: string; mimeType: PhotoMimeType; previewUrl: string }> {
  let blob = await toBlob(canvas, "image/webp");
  let mimeType: PhotoMimeType = "image/webp";
  if (!blob || blob.type !== "image/webp") {
    blob = await toBlob(canvas, "image/jpeg");
    mimeType = "image/jpeg";
  }
  if (!blob) throw new PhotoError("Couldn't encode the photo.");
  const previewUrl = await blobToDataUrl(blob);
  return { base64: previewUrl.slice(previewUrl.indexOf(",") + 1), mimeType, previewUrl };
}

/** Decodes an image file honouring its EXIF orientation (phone photos). */
export async function decodeFile(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (!file.type.startsWith("image/")) throw new PhotoError("That file isn't an image.");
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  } catch {
    // Formats createImageBitmap can't take (or older browsers): an <img> decode.
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return {
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        close: () => URL.revokeObjectURL(url),
      };
    } catch {
      URL.revokeObjectURL(url);
      throw new PhotoError(
        "Couldn't open that image. Try a JPEG or PNG (HEIC needs converting first).",
      );
    }
  }
}

/**
 * Pose landmarks for a still image. The shared landmarker runs in VIDEO
 * mode; MediaPipe's `detectForVideo` accepts any image source, so a canvas
 * is passed as a one-frame "video". Callers use a fresh landmarker (the
 * upload flow never shares one with a live camera), so no tracking state
 * from another stream carries over. Returns `unavailable` when the model
 * couldn't load or run.
 */
export async function detectStill(
  canvas: HTMLCanvasElement,
): Promise<{ landmarks: LandmarkTuple[] | null; unavailable: boolean }> {
  try {
    const mod = await import("@/modules/health/client/pose/landmarker");
    await mod.loadLandmarker();
    const pose: Pose | null = mod.detect(canvas as unknown as HTMLVideoElement, performance.now());
    return { landmarks: toLandmarkTuples(pose), unavailable: false };
  } catch {
    return { landmarks: null, unavailable: true };
  }
}

/** Frees the shared landmarker (after an upload's one-off detection). */
export async function releaseLandmarker(): Promise<void> {
  try {
    const mod = await import("@/modules/health/client/pose/landmarker");
    await mod.closeLandmarker();
  } catch {
    // Nothing loaded.
  }
}

/** File → downscaled, encoded photo with pose landmarks (when found). */
export async function processUpload(file: File): Promise<CapturedPhoto> {
  const decoded = await decodeFile(file);
  let canvas: HTMLCanvasElement;
  try {
    canvas = drawDownscaled(decoded.source, decoded.width, decoded.height);
  } finally {
    decoded.close();
  }
  const [encoded, pose] = await Promise.all([encodeCanvas(canvas), detectStill(canvas)]);
  void releaseLandmarker();
  return {
    ...encoded,
    width: canvas.width,
    height: canvas.height,
    landmarks: pose.landmarks,
    poseUnavailable: pose.unavailable,
    source: "upload",
  };
}
