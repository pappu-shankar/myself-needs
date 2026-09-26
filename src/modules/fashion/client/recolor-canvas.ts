// lab-color.ts is pure math (no fs/DB imports) — safe to share between
// service/ and client/ despite the general "client/ never imports
// service/" boundary, which exists specifically to keep the native SQLite
// binding out of the client bundle. See docs/prd/fashion.md.
import { hexToRgb } from "../service/lab-color";

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;

  return { h: h / 6, s, l };
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) {
    const v = Math.round(l * 255);
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, h) * 255),
    b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  };
}

/**
 * Recolors every masked pixel to targetHex's hue+saturation while keeping
 * that pixel's own HSL lightness untouched — the classic "colorize"
 * technique. Lightness is where shading/folds/highlights live, so leaving
 * it alone is what makes the result read as fabric under the original
 * lighting rather than a flat color fill. Pure: takes/returns a plain RGBA
 * byte array, no Canvas/DOM dependency, so it's directly unit-testable —
 * see recolorCanvas() below for the thin DOM wrapper.
 */
export function applyHueShift(
  pixels: Uint8ClampedArray,
  mask: Uint8Array,
  targetHex: string,
): Uint8ClampedArray<ArrayBuffer> {
  const target = hexToRgb(targetHex);
  const { h: targetH, s: targetS } = rgbToHsl(target.r, target.g, target.b);
  // Allocated by length (not copy-constructed from `pixels`) so the result
  // is a plain ArrayBuffer-backed Uint8ClampedArray regardless of what
  // buffer type the input happens to carry (e.g. canvas ImageData.data can
  // be typed against the broader ArrayBufferLike) — ImageData's constructor
  // requires the former.
  const result = new Uint8ClampedArray(pixels.length);
  result.set(pixels);

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const offset = i * 4;
    const { l } = rgbToHsl(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    const { r, g, b } = hslToRgb(targetH, targetS, l);
    result[offset] = r;
    result[offset + 1] = g;
    result[offset + 2] = b;
    // alpha (offset + 3) is left untouched
  }

  return result;
}

/** Reads pixels from the canvas, recolors the shirt then pants regions, and
 * writes the result back — the only DOM-touching piece of this module. */
export function recolorCanvas(
  canvas: HTMLCanvasElement,
  shirtMask: Uint8Array,
  shirtHex: string,
  pantsMask: Uint8Array,
  pantsHex: string,
): void {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const afterShirt = applyHueShift(imageData.data, shirtMask, shirtHex);
  const afterPants = applyHueShift(afterShirt, pantsMask, pantsHex);
  ctx.putImageData(new ImageData(afterPants, canvas.width, canvas.height), 0, 0);
}
