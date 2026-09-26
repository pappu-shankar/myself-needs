import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
// lab-color.ts is pure math (no fs/DB imports) — see the same note in
// recolor-canvas.ts.
import { rgbToLab, type LabColor } from "../service/lab-color";

const NOSE = 0;
const LEFT_EAR = 7;
const RIGHT_EAR = 8;

export interface SkinSampleRegion {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
}

/**
 * Estimates a small elliptical sample region on the cheek/upper-lip area —
 * below the nose (avoiding eyes) and inset from the ear-to-ear width
 * (avoiding hair/background at the face's edge). A coarse heuristic, not a
 * proper face-parsing model; tune the constants below against real photos.
 */
export function estimateSkinSampleRegion(
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
): SkinSampleRegion {
  const nose = landmarks[NOSE];
  const faceWidthPx = Math.abs(landmarks[LEFT_EAR].x - landmarks[RIGHT_EAR].x) * width;

  return {
    centerX: nose.x * width,
    centerY: nose.y * height + faceWidthPx * 0.15,
    radiusX: faceWidthPx * 0.22,
    radiusY: faceWidthPx * 0.16,
  };
}

/**
 * Averages the RGB of every pixel inside the elliptical region and
 * converts it to LAB. Pure: takes a plain RGBA byte array, no
 * Canvas/DOM dependency. Falls back to the single center pixel if the
 * region is degenerate (e.g. zero radius) or lands entirely off-image.
 */
export function sampleSkinToneLab(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  region: SkinSampleRegion,
): LabColor {
  const { centerX, centerY, radiusX, radiusY } = region;
  const xStart = Math.max(0, Math.floor(centerX - radiusX));
  const xEnd = Math.min(width, Math.ceil(centerX + radiusX));
  const yStart = Math.max(0, Math.floor(centerY - radiusY));
  const yEnd = Math.min(height, Math.ceil(centerY + radiusY));

  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      const dx = (x - centerX) / (radiusX || 1);
      const dy = (y - centerY) / (radiusY || 1);
      if (dx * dx + dy * dy > 1) continue;

      const offset = (y * width + x) * 4;
      rSum += pixels[offset];
      gSum += pixels[offset + 1];
      bSum += pixels[offset + 2];
      count++;
    }
  }

  if (count === 0) {
    const cx = Math.min(width - 1, Math.max(0, Math.round(centerX)));
    const cy = Math.min(height - 1, Math.max(0, Math.round(centerY)));
    const offset = (cy * width + cx) * 4;
    return rgbToLab(pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0);
  }

  return rgbToLab(rSum / count, gSum / count, bSum / count);
}
