import {
  LM,
  POSE_LANDMARK_COUNT,
  inFrame,
  inclinationFromVertical,
  midpoint,
  toAspectSpace,
  visibilityOf,
  type Pose,
  type PoseLandmark,
} from "@/modules/health/client/pose/geometry";
import { daysBetween, parseIsoDate } from "@/lib/dates";
import type { PhotoPose } from "@/modules/health/types";

/**
 * Pure helpers for progress photos: downscale size math, landmark
 * (de)serialisation, the live "are you posed right" check, and the transform
 * that lines one photo up with another. No DOM — unit-tested in Node.
 */

/** Stored landmark shape: `[x, y, visibility]`, normalized 0–1 to the image. */
export type LandmarkTuple = [number, number, number];

/** Longest side clients downscale to before saving. */
export const MAX_PHOTO_SIDE = 1080;
/** The service rejects anything smaller on either side. */
export const MIN_PHOTO_SIDE = 64;

/**
 * Target size for a `width × height` image so its long side is at most
 * `maxSide` (never upscaled). Null when the result would be under the
 * minimum the vault accepts.
 */
export function fitWithin(
  width: number,
  height: number,
  maxSide = MAX_PHOTO_SIDE,
): { width: number; height: number } | null {
  if (!(width > 0) || !(height > 0)) return null;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const out = {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
  if (out.width < MIN_PHOTO_SIDE || out.height < MIN_PHOTO_SIDE) return null;
  return out;
}

/** MediaPipe pose → the stored tuples (null when there's no full pose). */
export function toLandmarkTuples(pose: Pose | null | undefined): LandmarkTuple[] | null {
  if (!pose || pose.length !== POSE_LANDMARK_COUNT) return null;
  const round = (n: number) => Math.round(n * 10_000) / 10_000;
  const tuples = pose.map((p): LandmarkTuple => [round(p.x), round(p.y), round(visibilityOf(p))]);
  return tuples.every((t) => t.every(Number.isFinite)) ? tuples : null;
}

/** Stored tuples → geometry's landmark objects (z unknown, so 0). */
export function fromLandmarkTuples(tuples: readonly LandmarkTuple[] | null): Pose | null {
  if (!tuples || tuples.length !== POSE_LANDMARK_COUNT) return null;
  return tuples.map(([x, y, visibility]) => ({ x, y, z: 0, visibility }));
}

// ---------------------------------------------------------------------------
// Live pose check
// ---------------------------------------------------------------------------

export interface PoseCheck {
  /** Everything looks right for this pose. */
  ready: boolean;
  /** Short instructions, most important first; empty when ready. */
  cues: string[];
}

const SEEN = 0.5;
/** Shoulder width / torso length at or above this reads as square-on. */
const SQUARE_ON_RATIO = 0.45;
/** At or below this reads as side-on. */
const SIDE_ON_RATIO = 0.3;
/** Max shoulder tilt for "level", degrees. */
const LEVEL_DEGREES = 8;
/** Max torso lean for "standing", degrees. */
const UPRIGHT_DEGREES = 20;

/**
 * Checks a live pose against what a good progress photo of `pose` needs:
 * whole body in frame, standing upright, and turned the right way. Landmarks
 * are from the UNMIRRORED frame (the person's left shoulder appears on the
 * image's right when they face the camera). `aspectRatio` is width/height.
 */
export function checkPhotoPose(
  landmarks: Pose | null,
  pose: PhotoPose,
  aspectRatio: number,
): PoseCheck {
  if (!landmarks || landmarks.length !== POSE_LANDMARK_COUNT) {
    return { ready: false, cues: ["Step into view — no one detected yet."] };
  }
  const cues: string[] = [];
  const seenInFrame = (i: number) => visibilityOf(landmarks[i]) >= SEEN && inFrame(landmarks[i]);

  const headIn = [LM.nose, LM.leftEar, LM.rightEar].some(seenInFrame);
  const feetIn = [LM.leftAnkle, LM.rightAnkle, LM.leftHeel, LM.rightHeel].some(seenInFrame);
  if (!headIn && !feetIn) cues.push("Step back until your whole body is in frame.");
  else if (!headIn) cues.push("Step back or tilt the camera up — your head is cut off.");
  else if (!feetIn) cues.push("Step back or tilt the camera down — your feet are cut off.");

  const sq = toAspectSpace(landmarks, aspectRatio);
  const ls = sq[LM.leftShoulder];
  const rs = sq[LM.rightShoulder];
  const lh = sq[LM.leftHip];
  const rh = sq[LM.rightHip];
  const midShoulder = midpoint(ls, rs);
  const midHip = midpoint(lh, rh);
  const torso = Math.hypot(midShoulder.x - midHip.x, midShoulder.y - midHip.y);

  const knees = [sq[LM.leftKnee], sq[LM.rightKnee]].filter((k) => visibilityOf(k) >= SEEN);
  const kneesBelowHips = knees.length === 0 || knees.every((k) => k.y > midHip.y);
  if (
    torso < 1e-3 ||
    midShoulder.y >= midHip.y ||
    inclinationFromVertical(midShoulder, midHip) > UPRIGHT_DEGREES ||
    !kneesBelowHips
  ) {
    cues.push("Stand up straight, arms relaxed.");
  } else {
    const shoulderWidth = Math.abs(ls.x - rs.x);
    const ratio = shoulderWidth / torso;
    if (pose === "side") {
      if (ratio > SIDE_ON_RATIO) cues.push("Turn side-on to the camera.");
    } else if (ratio < SQUARE_ON_RATIO) {
      cues.push(pose === "front" ? "Turn to face the camera." : "Turn your back to the camera.");
    } else {
      // Facing the camera, the person's left shoulder is on the image's right.
      const facingCamera = ls.x > rs.x;
      if (pose === "front" && !facingCamera) cues.push("Turn to face the camera.");
      if (pose === "back" && facingCamera) cues.push("Turn your back to the camera.");
      const tilt = (Math.atan2(Math.abs(ls.y - rs.y), shoulderWidth) * 180) / Math.PI;
      if (tilt > LEVEL_DEGREES) cues.push("Level your shoulders.");
    }
  }
  return { ready: cues.length === 0, cues };
}

// ---------------------------------------------------------------------------
// Alignment
// ---------------------------------------------------------------------------

export interface PhotoGeometry {
  width: number;
  height: number;
  landmarks: readonly LandmarkTuple[] | null;
}

/**
 * CSS transform for the second photo so its mid-shoulder and mid-hip points
 * land on the first photo's. Both photos are laid out at the container's
 * full width (the container has the FIRST photo's aspect ratio), top-left
 * aligned; apply as `translate(x%, y%) scale(s)` with `transform-origin: 0 0`.
 * Percentages are of the second photo's own box, as CSS `translate()` uses.
 * Null when either photo lacks usable landmarks.
 */
export interface AlignTransform {
  scale: number;
  translateXPct: number;
  translateYPct: number;
}

const ALIGN_MIN_VISIBILITY = 0.3;

function torsoAnchors(photo: PhotoGeometry): { top: PoseLandmark; bottom: PoseLandmark } | null {
  const pose = fromLandmarkTuples(photo.landmarks);
  if (!pose || !(photo.width > 0) || !(photo.height > 0)) return null;
  const idx = [LM.leftShoulder, LM.rightShoulder, LM.leftHip, LM.rightHip];
  const meanVis = idx.reduce((s, i) => s + visibilityOf(pose[i]), 0) / idx.length;
  if (meanVis < ALIGN_MIN_VISIBILITY) return null;
  // Width-normalised layout coordinates: x in [0, 1], y in [0, height/width].
  const r = photo.height / photo.width;
  const at = (p: PoseLandmark): PoseLandmark => ({ x: p.x, y: p.y * r, z: 0 });
  const top = at(midpoint(pose[LM.leftShoulder], pose[LM.rightShoulder]));
  const bottom = at(midpoint(pose[LM.leftHip], pose[LM.rightHip]));
  if (Math.hypot(top.x - bottom.x, top.y - bottom.y) < 1e-3) return null;
  return { top, bottom };
}

export function alignTransform(base: PhotoGeometry, other: PhotoGeometry): AlignTransform | null {
  const a = torsoAnchors(base);
  const b = torsoAnchors(other);
  if (!a || !b) return null;
  const lenA = Math.hypot(a.top.x - a.bottom.x, a.top.y - a.bottom.y);
  const lenB = Math.hypot(b.top.x - b.bottom.x, b.top.y - b.bottom.y);
  const scale = lenA / lenB;
  // Match torso centres: centreA = scale · centreB + t.
  const cax = (a.top.x + a.bottom.x) / 2;
  const cay = (a.top.y + a.bottom.y) / 2;
  const cbx = (b.top.x + b.bottom.x) / 2;
  const cby = (b.top.y + b.bottom.y) / 2;
  const tx = cax - scale * cbx;
  const ty = cay - scale * cby;
  const otherRatio = other.height / other.width;
  return {
    scale,
    translateXPct: tx * 100,
    translateYPct: (ty / otherRatio) * 100,
  };
}

export function transformCss(t: AlignTransform): string {
  const f = (n: number) => Number(n.toFixed(3));
  return `translate(${f(t.translateXPct)}%, ${f(t.translateYPct)}%) scale(${f(t.scale)})`;
}

// ---------------------------------------------------------------------------
// Compare picks
// ---------------------------------------------------------------------------

/** Default comparison: oldest vs newest (ids). Photos may be in any order. */
export function defaultComparePair<T extends { id: number; date: string }>(
  photos: readonly T[],
): [number, number] | null {
  if (photos.length < 2) return null;
  const sorted = [...photos].sort((x, y) => x.date.localeCompare(y.date) || x.id - y.id);
  return [sorted[0].id, sorted[sorted.length - 1].id];
}

/** Which photo of a pose to draw as the ghost outline: the newest with landmarks. */
export function ghostSource<T extends { date: string; id: number; landmarks: unknown }>(
  photos: readonly T[],
): T | null {
  return (
    [...photos]
      .filter((p) => p.landmarks !== null)
      .sort((x, y) => y.date.localeCompare(x.date) || y.id - x.id)[0] ?? null
  );
}

/** Skeleton for the ghost/live outline. */
export const OUTLINE_BONES: ReadonlyArray<readonly [number, number]> = [
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftHip, LM.rightHip],
  [LM.leftShoulder, LM.leftHip],
  [LM.rightShoulder, LM.rightHip],
  [LM.leftShoulder, LM.leftElbow],
  [LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow],
  [LM.rightElbow, LM.rightWrist],
  [LM.leftHip, LM.leftKnee],
  [LM.leftKnee, LM.leftAnkle],
  [LM.rightHip, LM.rightKnee],
  [LM.rightKnee, LM.rightAnkle],
  [LM.leftAnkle, LM.leftHeel],
  [LM.rightAnkle, LM.rightHeel],
];

/** Self-timer length, seconds. */
export const SELF_TIMER_SECONDS = 10;
const ANNOUNCE_AT = [10, 5, 3, 2, 1];

/** The countdown value screen readers hear: only on 10, 5, 3, 2, 1, so the
 * live region doesn't chatter every second. */
export function announcedCountdown(remaining: number): number {
  return ANNOUNCE_AT.filter((n) => n >= remaining).sort((a, b) => a - b)[0] ?? remaining;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "4 Oct 2026" for an ISO date — locale-independent so server and client render alike. */
export function photoDate(iso: string): string {
  const d = parseIsoDate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "84 days apart" / "Same day" between two ISO dates, whichever order. */
export function daysApart(a: string, b: string): string {
  const n = Math.abs(daysBetween(a, b));
  if (n === 0) return "Same day";
  return `${n} ${n === 1 ? "day" : "days"} apart`;
}
