// lab-color.ts is pure math (no fs/DB imports) — safe to share between
// service/ and client/ despite the general "client/ never imports
// service/" boundary — see the same note in recolor-canvas.ts.
import { rgbToLab, type LabColor } from "../service/lab-color";

/**
 * Averages the RGB of every non-transparent pixel — i.e. excludes
 * whatever background removeSolidBackground() already cleared — and
 * converts the result to LAB. Pure: takes a plain RGBA byte array, no
 * Canvas/DOM dependency. Falls back to a neutral gray if every pixel is
 * transparent (a degenerate upload with no detected foreground).
 */
export function extractGarmentColor(pixels: Uint8ClampedArray): LabColor {
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let count = 0;

  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    rSum += pixels[i];
    gSum += pixels[i + 1];
    bSum += pixels[i + 2];
    count++;
  }

  if (count === 0) return rgbToLab(128, 128, 128);
  return rgbToLab(rSum / count, gSum / count, bSum / count);
}
