import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { xBoundsFromLandmarks } from "./body-region-masks";

// BlazePose's 33-point landmark topology — redefined locally rather than
// imported from body-region-masks.ts (same choice skin-sampling.ts already
// makes for its own face landmarks) so this file stays self-contained.
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_ELBOW = 13;
const LEFT_HIP = 23;
const RIGHT_HIP = 24;
const LEFT_KNEE = 25;

export interface PhysiqueRatios {
  shoulderToHipRatio: number;
  chestToShoulderRatio: number;
  waistToShoulderRatio: number;
  torsoToShoulderRatio: number;
  limbThicknessToShoulderRatio: number;
}

export type BuildCategory = "slight" | "medium" | "solid" | "heavy";
export type ShoulderCategory = "narrow" | "average" | "broad";
export type ChestCategory = "slim" | "moderate" | "full";
export type BellyCategory = "flat" | "some_fullness" | "full";
export type LimbCategory = "slender" | "average" | "sturdy";
export type SilhouetteCategory = "tapered" | "rectangular" | "curvy" | "inverted_tapered";

export interface PhysiqueCategories {
  build: BuildCategory;
  shoulders: ShoulderCategory;
  chest: ChestCategory;
  belly: BellyCategory;
  limbs: LimbCategory;
  silhouette: SilhouetteCategory;
}

export interface PhysiqueSummary {
  ratios: PhysiqueRatios;
  categories: PhysiqueCategories;
  description: string;
}

/** Scans one row of personMask between xSearchLeft/xSearchRight (inclusive,
 * clamped to the mask bounds) for its leftmost/rightmost set pixel, and
 * returns the distance between them — 0 if no person pixel is found in
 * that window. This is how "waist width"/"chest width" are measured: pose
 * landmarks alone have no waist point, only the person-mask silhouette
 * does. */
function silhouetteWidthAtRow(
  personMask: Uint8Array,
  width: number,
  height: number,
  y: number,
  xSearchLeft: number,
  xSearchRight: number,
): number {
  const row = Math.round(y);
  if (row < 0 || row >= height) return 0;

  const left = Math.max(0, Math.round(xSearchLeft));
  const right = Math.min(width - 1, Math.round(xSearchRight));
  const rowOffset = row * width;

  let leftMost = -1;
  let rightMost = -1;
  for (let x = left; x <= right; x++) {
    if (personMask[rowOffset + x]) {
      if (leftMost === -1) leftMost = x;
      rightMost = x;
    }
  }

  return leftMost === -1 ? 0 : rightMost - leftMost;
}

/**
 * Computes a physique summary from the same landmarks + person mask
 * analyzePhoto() already produces — no new pose detection, just new math
 * over data that already exists. Pure: no DOM dependency beyond the plain
 * Uint8Array mask already produced by pose-segmentation.ts.
 *
 * Limb thickness is measured only from the LEFT arm/thigh (a simplifying
 * assumption of rough left/right symmetry, same spirit as skin-sampling.ts
 * only sampling one face region) — a single perpendicular-ish scan at the
 * shoulder->elbow / hip->knee midpoint, reusing the same "search window
 * around a landmark-derived point" technique as silhouetteWidthAtRow
 * above, not a true perpendicular-to-limb scan. This is coarser than the
 * width ratios below since it assumes a roughly straight, not-too-angled
 * limb pose — acceptable for a v1 rule-based estimate, not something to
 * over-engineer. All ratio thresholds below are starting-guess buckets,
 * not derived from an anthropometric standard — expect to tune them
 * against real photos, same caveat service/lab-color.ts's scoreContrast()
 * thresholds already carry.
 */
export function computePhysiqueSummary(
  landmarks: NormalizedLandmark[],
  personMask: Uint8Array,
  width: number,
  height: number,
): PhysiqueSummary {
  const shoulderBounds = xBoundsFromLandmarks(landmarks, LEFT_SHOULDER, RIGHT_SHOULDER, width);
  const hipBounds = xBoundsFromLandmarks(landmarks, LEFT_HIP, RIGHT_HIP, width);
  const shoulderWidthPx = shoulderBounds.right - shoulderBounds.left;
  const hipWidthPx = hipBounds.right - hipBounds.left;

  const shoulderY = ((landmarks[LEFT_SHOULDER].y + landmarks[RIGHT_SHOULDER].y) / 2) * height;
  const hipY = ((landmarks[LEFT_HIP].y + landmarks[RIGHT_HIP].y) / 2) * height;
  const torsoLengthPx = hipY - shoulderY;

  // Bounded search window for the silhouette scans — wide enough to catch
  // a looser garment than the raw shoulder/hip bounds, not so wide it
  // could pick up unrelated background noise far from the body.
  const searchLeft = Math.min(shoulderBounds.left, hipBounds.left) - shoulderWidthPx * 0.3;
  const searchRight = Math.max(shoulderBounds.right, hipBounds.right) + shoulderWidthPx * 0.3;

  const chestWidthPx = silhouetteWidthAtRow(
    personMask,
    width,
    height,
    shoulderY + torsoLengthPx * 0.3,
    searchLeft,
    searchRight,
  );
  const waistWidthPx = silhouetteWidthAtRow(
    personMask,
    width,
    height,
    shoulderY + torsoLengthPx * 0.7,
    searchLeft,
    searchRight,
  );

  const armMidX = ((landmarks[LEFT_SHOULDER].x + landmarks[LEFT_ELBOW].x) / 2) * width;
  const armMidY = ((landmarks[LEFT_SHOULDER].y + landmarks[LEFT_ELBOW].y) / 2) * height;
  const thighMidX = ((landmarks[LEFT_HIP].x + landmarks[LEFT_KNEE].x) / 2) * width;
  const thighMidY = ((landmarks[LEFT_HIP].y + landmarks[LEFT_KNEE].y) / 2) * height;
  const limbSearchRadius = shoulderWidthPx * 0.5;
  const upperArmThicknessPx = silhouetteWidthAtRow(
    personMask,
    width,
    height,
    armMidY,
    armMidX - limbSearchRadius,
    armMidX + limbSearchRadius,
  );
  const thighThicknessPx = silhouetteWidthAtRow(
    personMask,
    width,
    height,
    thighMidY,
    thighMidX - limbSearchRadius,
    thighMidX + limbSearchRadius,
  );
  const limbThicknessPx = (upperArmThicknessPx + thighThicknessPx) / 2;

  const ratios: PhysiqueRatios = {
    shoulderToHipRatio: shoulderWidthPx / hipWidthPx,
    chestToShoulderRatio: chestWidthPx / shoulderWidthPx,
    waistToShoulderRatio: waistWidthPx / shoulderWidthPx,
    torsoToShoulderRatio: torsoLengthPx / shoulderWidthPx,
    limbThicknessToShoulderRatio: limbThicknessPx / shoulderWidthPx,
  };

  const categories = categorizePhysique(ratios);
  const description = describePhysique(categories);

  return { ratios, categories, description };
}

function categorizePhysique(ratios: PhysiqueRatios): PhysiqueCategories {
  const shoulders: ShoulderCategory =
    ratios.shoulderToHipRatio < 0.95
      ? "narrow"
      : ratios.shoulderToHipRatio > 1.15
        ? "broad"
        : "average";

  const chest: ChestCategory =
    ratios.chestToShoulderRatio < 0.75
      ? "slim"
      : ratios.chestToShoulderRatio > 0.95
        ? "full"
        : "moderate";

  const belly: BellyCategory =
    ratios.waistToShoulderRatio < 0.75
      ? "flat"
      : ratios.waistToShoulderRatio > 0.9
        ? "full"
        : "some_fullness";

  const limbs: LimbCategory =
    ratios.limbThicknessToShoulderRatio < 0.18
      ? "slender"
      : ratios.limbThicknessToShoulderRatio > 0.28
        ? "sturdy"
        : "average";

  const buildScore = (ratios.waistToShoulderRatio + ratios.limbThicknessToShoulderRatio) / 2;
  const build: BuildCategory =
    buildScore < 0.5
      ? "slight"
      : buildScore < 0.65
        ? "medium"
        : buildScore < 0.8
          ? "solid"
          : "heavy";

  const waistVsAvg = ratios.waistToShoulderRatio / ((1 + 1 / ratios.shoulderToHipRatio) / 2);
  let silhouette: SilhouetteCategory;
  if (waistVsAvg < 0.85) silhouette = "curvy";
  else if (ratios.shoulderToHipRatio > 1.1) silhouette = "tapered";
  else if (ratios.shoulderToHipRatio < 0.9) silhouette = "inverted_tapered";
  else silhouette = "rectangular";

  return { build, shoulders, chest, belly, limbs, silhouette };
}

const BUILD_PHRASES: Record<BuildCategory, string> = {
  slight: "slight",
  medium: "medium",
  solid: "solid",
  heavy: "heavier",
};

const SHOULDER_PHRASES: Record<ShoulderCategory, string> = {
  narrow: "narrow shoulders",
  average: "average-width shoulders",
  broad: "relatively broad shoulders",
};

const CHEST_PHRASES: Record<ChestCategory, string> = {
  slim: "a slim chest",
  moderate: "a moderate chest",
  full: "a fuller chest",
};

const BELLY_PHRASES: Record<BellyCategory, string> = {
  flat: "a flat midsection",
  some_fullness: "some abdominal/belly fullness",
  full: "noticeable abdominal fullness",
};

const LIMB_PHRASES: Record<LimbCategory, string> = {
  slender: "slender limbs",
  average: "average limbs",
  sturdy: "sturdy limbs",
};

const SILHOUETTE_PHRASES: Record<SilhouetteCategory, string> = {
  tapered: "tapered, V-shaped",
  rectangular: "fairly straight/rectangular",
  curvy: "curvier, hourglass-leaning",
  inverted_tapered: "fuller through the hips",
};

function describePhysique(categories: PhysiqueCategories): string {
  return (
    `${BUILD_PHRASES[categories.build]} build, ${SHOULDER_PHRASES[categories.shoulders]}, ${CHEST_PHRASES[categories.chest]}, ` +
    `${BELLY_PHRASES[categories.belly]}, ${LIMB_PHRASES[categories.limbs]}, and a ${SILHOUETTE_PHRASES[categories.silhouette]} overall silhouette.`
  );
}
