import type { ContrastVerdict } from "../types";

/**
 * Pure LAB color-space math — no fs/DB imports, safe to import from
 * anywhere including client-side code. Used both to sample a photo's skin
 * tone (client/skin-sampling.ts) and to score a chosen garment color
 * against it (here, and again server-side in actions.ts so a saved
 * contrast badge can't drift from what the client displayed live). See
 * docs/prd/fashion.md.
 */

export interface LabColor {
  l: number;
  a: number;
  b: number;
}

function srgbChannelToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Converts sRGB (0-255 per channel) to CIE LAB (D65 reference white). */
export function rgbToLab(r: number, g: number, b: number): LabColor {
  const rl = srgbChannelToLinear(r);
  const gl = srgbChannelToLinear(g);
  const bl = srgbChannelToLinear(b);

  // sRGB -> XYZ (D65)
  const x = rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375;
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
  const z = rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041;

  // Normalize against the D65 white point, then to LAB.
  const xn = x / 0.95047;
  const yn = y / 1.0;
  const zn = z / 1.08883;

  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(xn);
  const fy = f(yn);
  const fz = f(zn);

  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = hex.replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

export function hexToLab(hex: string): LabColor {
  const { r, g, b } = hexToRgb(hex);
  return rgbToLab(r, g, b);
}

export function rgbToHex(r: number, g: number, b: number): string {
  const channel = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function linearChannelToSrgb(v: number): number {
  const clamped = Math.min(1, Math.max(0, v));
  return clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

/** Inverse of rgbToLab: CIE LAB (D65) back to sRGB (0-255 per channel). */
export function labToRgb(lab: LabColor): { r: number; g: number; b: number } {
  const fy = (lab.l + 16) / 116;
  const fx = fy + lab.a / 500;
  const fz = fy - lab.b / 200;

  const finv = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const xn = finv(fx) * 0.95047;
  const yn = finv(fy) * 1.0;
  const zn = finv(fz) * 1.08883;

  // XYZ -> linear sRGB (D65)
  const rl = xn * 3.2404542 + yn * -1.5371385 + zn * -0.4985314;
  const gl = xn * -0.969266 + yn * 1.8760108 + zn * 0.041556;
  const bl = xn * 0.0556434 + yn * -0.2040259 + zn * 1.0572252;

  return {
    r: linearChannelToSrgb(rl) * 255,
    g: linearChannelToSrgb(gl) * 255,
    b: linearChannelToSrgb(bl) * 255,
  };
}

export function labToHex(lab: LabColor): string {
  const { r, g, b } = labToRgb(lab);
  return rgbToHex(r, g, b);
}

/** Euclidean distance in LAB space (CIE76 delta-E) — good enough for a
 * "pops"/"washed out" badge, not intended as a print-accurate delta-E. */
export function labDistance(a: LabColor, b: LabColor): number {
  return Math.sqrt((a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
}

const POPS_DISTANCE_THRESHOLD = 35;
const WASHED_OUT_LIGHTNESS_DELTA = 12;

/**
 * A garment "pops" when it's meaningfully distant from the skin tone in LAB
 * space; it reads as "washed out" when it's both not a pop and close in
 * lightness to the skin tone (low tonal contrast, the classic
 * washed-out-against-skin look); otherwise "neutral". These thresholds are
 * a starting point, not derived from a color-science standard — expect to
 * tune them against real photos.
 */
export function scoreContrast(garmentHex: string, skinTone: LabColor): ContrastVerdict {
  const garmentLab = hexToLab(garmentHex);
  const distance = labDistance(garmentLab, skinTone);

  if (distance >= POPS_DISTANCE_THRESHOLD) return "pops";
  if (Math.abs(garmentLab.l - skinTone.l) < WASHED_OUT_LIGHTNESS_DELTA) return "washed_out";
  return "neutral";
}
