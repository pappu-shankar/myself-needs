import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// BlazePose's 33-point landmark topology (stable across MediaPipe Pose
// model variants) — indices for the joints this geometric split needs.
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const RIGHT_ELBOW = 14;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;
const RIGHT_KNEE = 26;
const LEFT_ANKLE = 27;
const RIGHT_ANKLE = 28;

const TORSO_PADDING_FRACTION = 0.18;
const LEG_PADDING_FRACTION = 0.35;

// The shoulder-to-hip trapezoid alone leaves sleeves completely uncovered —
// verified against a real photo (plaid shirt, sleeves rolled to the
// forearm): the entire upper-arm sleeve fabric sat outside the torso band
// on both arms. Each sleeve is filled separately as a band that follows the
// shoulder->elbow line rather than the body's left/right symmetry, since an
// arm at rest isn't centered on the torso. Stops at the elbow (plus a small
// extension) rather than the wrist — this shirt's sleeves were rolled up
// with bare forearms below the elbow, and MediaPipe's person mask can't
// distinguish skin from fabric, so reaching past the elbow risks recoloring
// skin. A photo with long sleeves worn all the way to the wrist will still
// have an uncovered forearm segment; that's a known limitation of this
// landmark-only heuristic, not something this fraction can fully solve.
const SLEEVE_WIDTH_FRACTION = 0.22;
const SLEEVE_LENGTH_EXTENSION_FRACTION = 0.15;

// A real shirt is very often worn untucked, hanging some distance past the
// hip landmark (a bony anatomical point, not a garment edge) before the
// pants actually start. Verified against a real photo: the hip-landmark
// split line cut straight across the middle of the shirt's hanging hem,
// leaving a visible strip of original shirt color untouched by either mask.
// This is a fixed, modest allowance, not a hem detector — an unusually long
// or uneven hem (as in that same photo) will still show a small gap; a
// tucked-in shirt will have its pants band start a bit later than the true
// waistband, which is the accepted trade-off.
const HEM_OVERHANG_FRACTION = 0.12;

// A pant leg's cuff visually extends a little past the raw ankle landmark
// (the bone position, not the fabric edge) before meeting the shoe.
// Verified against a real photo: without this, a thin strip of original
// pants color was visible right above the shoe on both legs.
const ANKLE_EXTENSION_FRACTION = 0.12;

export interface BodyRegionMasks {
  /** 1 where a pixel is estimated to be shirt, 0 otherwise. */
  shirtMask: Uint8Array;
  /** 1 where a pixel is estimated to be pants, 0 otherwise. */
  pantsMask: Uint8Array;
}

export interface XBounds {
  left: number;
  right: number;
}

export function xBoundsFromLandmarks(
  landmarks: NormalizedLandmark[],
  leftIdx: number,
  rightIdx: number,
  width: number,
): XBounds {
  const leftX = landmarks[leftIdx].x * width;
  const rightX = landmarks[rightIdx].x * width;
  return { left: Math.min(leftX, rightX), right: Math.max(leftX, rightX) };
}

function padXBounds(bounds: XBounds, paddingFraction: number): XBounds {
  const pad = (bounds.right - bounds.left) * paddingFraction;
  return { left: bounds.left - pad, right: bounds.right + pad };
}

function lerpXBounds(a: XBounds, b: XBounds, t: number): XBounds {
  return { left: a.left + (b.left - a.left) * t, right: a.right + (b.right - a.right) * t };
}

/** Fills `mask` (in place) for every row between yStart/yEnd, at the x-range
 * linearly interpolated between topBounds and bottomBounds (topBounds
 * padded outward by topPaddingFraction, bottomBounds by
 * bottomPaddingFraction — independent fractions so an adjoining band using
 * the same shared landmark bound can pass the same padding and get a
 * seamless width match rather than a visible step), restricted to pixels
 * personMask already marks as the person — trims the geometric band to the
 * actual body silhouette rather than a raw bounding box. */
function fillBand(
  mask: Uint8Array,
  personMask: Uint8Array,
  width: number,
  height: number,
  yStart: number,
  yEnd: number,
  topBounds: XBounds,
  bottomBounds: XBounds,
  topPaddingFraction: number,
  bottomPaddingFraction: number,
): void {
  const top = padXBounds(topBounds, topPaddingFraction);
  const bottom = padXBounds(bottomBounds, bottomPaddingFraction);
  // Both endpoints round the same way (nearest, not floor/ceil) so that two
  // adjoining bands sharing a boundary value (e.g. the shirt's yEnd and the
  // pants' yStart both being `waistY`) resolve to the exact same row
  // number — guaranteed no gap and no double-claimed row at the seam, even
  // when that shared boundary isn't a whole pixel.
  const rowStart = Math.max(0, Math.round(yStart));
  const rowEnd = Math.min(height, Math.round(yEnd));
  const span = yEnd - yStart;

  for (let y = rowStart; y < rowEnd; y++) {
    const t = span > 0 ? (y - yStart) / span : 0;
    const { left, right } = lerpXBounds(top, bottom, t);
    const xStart = Math.max(0, Math.round(left));
    const xEnd = Math.min(width, Math.round(right));
    const rowOffset = y * width;
    for (let x = xStart; x < xEnd; x++) {
      const i = rowOffset + x;
      if (personMask[i]) mask[i] = 1;
    }
  }
}

/** Fills `mask` (in place) with a band that follows the straight line from
 * `from` to `to` (e.g. shoulder->elbow), `halfWidth` pixels wide on either
 * side, rather than fillBand's left/right-symmetric span — an arm hanging
 * at the side isn't centered on the torso, so it can't be described as an
 * x-range the way the torso/legs are. Extends `lengthExtensionFraction`
 * past `to` (continuing the same line) to reach a little further than the
 * joint itself, clamped to `maxY` so it can never run down into the pants
 * band regardless of arm pose. Intersected with personMask like fillBand. */
function fillLimbBand(
  mask: Uint8Array,
  personMask: Uint8Array,
  width: number,
  height: number,
  from: NormalizedLandmark,
  to: NormalizedLandmark,
  maxY: number,
  halfWidth: number,
  lengthExtensionFraction: number,
): void {
  const fromX = from.x * width;
  const fromY = from.y * height;
  const toX = to.x * width;
  const toY = to.y * height;

  const span = toY - fromY;
  const rawYEnd = Math.max(fromY, toY) + Math.abs(span) * lengthExtensionFraction;
  const yStart = Math.min(fromY, toY);
  const yEnd = Math.min(rawYEnd, maxY);
  const rowStart = Math.max(0, Math.round(yStart));
  const rowEnd = Math.min(height, Math.round(yEnd));

  for (let y = rowStart; y < rowEnd; y++) {
    const t = span !== 0 ? (y - fromY) / span : 0;
    const centerX = fromX + (toX - fromX) * t;
    const xStart = Math.max(0, Math.round(centerX - halfWidth));
    const xEnd = Math.min(width, Math.round(centerX + halfWidth));
    const rowOffset = y * width;
    for (let x = xStart; x < xEnd; x++) {
      const i = rowOffset + x;
      if (personMask[i]) mask[i] = 1;
    }
  }
}

/**
 * Splits a person mask into shirt/pants regions from pose landmarks alone —
 * a geometric heuristic (shoulders-to-waist band plus a per-arm sleeve band
 * for the shirt; waist-to-knees then knees-to-ankles, plus a small cuff
 * extension, for the pants, each padded outward and intersected with the
 * segmenter's person mask), not a learned per-garment classifier. Chosen
 * over a multiclass clothing-segmentation model to avoid a second, heavier
 * ML dependency; still produces a reasonably tight, silhouette-trimmed mask
 * rather than a raw bounding box. See docs/prd/fashion.md.
 *
 * The pants band is bent at the knee rather than one straight hip-to-ankle
 * trapezoid — verified against a real photo during development, a single
 * straight trapezoid visibly missed the lower leg whenever the stance
 * wasn't a perfectly straight vertical line (feet apart, weight shifted,
 * slight turn), which is the common case, not the exception.
 *
 * The shirt/pants split sits at a "waist" line a bit below the hip
 * landmark (see HEM_OVERHANG_FRACTION) rather than exactly at it, and the
 * pants band's top padding matches the shirt band's bottom padding exactly
 * (both derived from the same hip landmarks) — both verified against a real
 * photo where a hip-landmark-exact split, with the two bands padded by
 * different fractions, left a visible strip of un-recolored original shirt
 * color at the seam.
 */
export function deriveBodyRegionMasks(
  landmarks: NormalizedLandmark[],
  personMask: Uint8Array,
  width: number,
  height: number,
): BodyRegionMasks {
  const shoulderY = Math.min(landmarks[LEFT_SHOULDER].y, landmarks[RIGHT_SHOULDER].y) * height;
  const hipY = ((landmarks[LEFT_HIP].y + landmarks[RIGHT_HIP].y) / 2) * height;
  const kneeY = ((landmarks[LEFT_KNEE].y + landmarks[RIGHT_KNEE].y) / 2) * height;
  const ankleY = Math.max(landmarks[LEFT_ANKLE].y, landmarks[RIGHT_ANKLE].y) * height;
  const waistY = hipY + (hipY - shoulderY) * HEM_OVERHANG_FRACTION;
  const ankleExtensionY = ankleY + (ankleY - kneeY) * ANKLE_EXTENSION_FRACTION;

  const shoulderBounds = xBoundsFromLandmarks(landmarks, LEFT_SHOULDER, RIGHT_SHOULDER, width);
  const hipBounds = xBoundsFromLandmarks(landmarks, LEFT_HIP, RIGHT_HIP, width);
  const kneeBounds = xBoundsFromLandmarks(landmarks, LEFT_KNEE, RIGHT_KNEE, width);
  const ankleBounds = xBoundsFromLandmarks(landmarks, LEFT_ANKLE, RIGHT_ANKLE, width);

  const shirtMask = new Uint8Array(width * height);
  const pantsMask = new Uint8Array(width * height);

  fillBand(
    shirtMask,
    personMask,
    width,
    height,
    shoulderY,
    waistY,
    shoulderBounds,
    hipBounds,
    TORSO_PADDING_FRACTION,
    TORSO_PADDING_FRACTION,
  );
  fillBand(
    pantsMask,
    personMask,
    width,
    height,
    waistY,
    kneeY,
    hipBounds,
    kneeBounds,
    TORSO_PADDING_FRACTION,
    LEG_PADDING_FRACTION,
  );
  fillBand(
    pantsMask,
    personMask,
    width,
    height,
    kneeY,
    ankleY,
    kneeBounds,
    ankleBounds,
    LEG_PADDING_FRACTION,
    LEG_PADDING_FRACTION,
  );
  fillBand(
    pantsMask,
    personMask,
    width,
    height,
    ankleY,
    ankleExtensionY,
    ankleBounds,
    ankleBounds,
    LEG_PADDING_FRACTION,
    LEG_PADDING_FRACTION,
  );

  const sleeveHalfWidth = (shoulderBounds.right - shoulderBounds.left) * SLEEVE_WIDTH_FRACTION;
  fillLimbBand(
    shirtMask,
    personMask,
    width,
    height,
    landmarks[LEFT_SHOULDER],
    landmarks[LEFT_ELBOW],
    hipY,
    sleeveHalfWidth,
    SLEEVE_LENGTH_EXTENSION_FRACTION,
  );
  fillLimbBand(
    shirtMask,
    personMask,
    width,
    height,
    landmarks[RIGHT_SHOULDER],
    landmarks[RIGHT_ELBOW],
    hipY,
    sleeveHalfWidth,
    SLEEVE_LENGTH_EXTENSION_FRACTION,
  );

  return { shirtMask, pantsMask };
}
