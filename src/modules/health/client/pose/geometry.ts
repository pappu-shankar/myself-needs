/**
 * Plain landmark geometry for the camera rep counter. No MediaPipe import
 * here — everything works on `{ x, y, z, visibility }` objects so the rep
 * counter can be unit-tested in Node with synthetic poses.
 *
 * Coordinates follow MediaPipe's normalized landmarks: x to the right, y
 * DOWN (image rows), z toward the camera is negative. Normalized x and y are
 * divided by different lengths (frame width vs height), so angles measured
 * in raw normalized space are skewed on a 16:9 video — callers scale x (and
 * z, which MediaPipe puts on roughly the same scale as x) by the frame's
 * aspect ratio first; see `toAspectSpace`.
 */

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  /** 0–1 likelihood the point is visible (not occluded / off-frame).
   * MediaPipe always sets it; absent means "fully visible", which keeps
   * hand-built test poses short. */
  visibility?: number;
}

export type Pose = readonly PoseLandmark[];
export type Side = "left" | "right";

/** BlazePose's 33 landmark indices (MediaPipe pose landmarker). "Left" is
 * the person's own left, regardless of camera mirroring. */
export const LM = {
  nose: 0,
  leftEyeInner: 1,
  leftEye: 2,
  leftEyeOuter: 3,
  rightEyeInner: 4,
  rightEye: 5,
  rightEyeOuter: 6,
  leftEar: 7,
  rightEar: 8,
  mouthLeft: 9,
  mouthRight: 10,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftFootIndex: 31,
  rightFootIndex: 32,
} as const;

export const POSE_LANDMARK_COUNT = 33;

/** The joints the movement configs reason about, per body side. */
export interface SideJoints {
  ear: number;
  shoulder: number;
  elbow: number;
  wrist: number;
  hip: number;
  knee: number;
  ankle: number;
}

export const SIDE_JOINTS: Record<Side, SideJoints> = {
  left: {
    ear: LM.leftEar,
    shoulder: LM.leftShoulder,
    elbow: LM.leftElbow,
    wrist: LM.leftWrist,
    hip: LM.leftHip,
    knee: LM.leftKnee,
    ankle: LM.leftAnkle,
  },
  right: {
    ear: LM.rightEar,
    shoulder: LM.rightShoulder,
    elbow: LM.rightElbow,
    wrist: LM.rightWrist,
    hip: LM.rightHip,
    knee: LM.rightKnee,
    ankle: LM.rightAnkle,
  },
};

const RAD_TO_DEG = 180 / Math.PI;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The angle at `b` (degrees, 0–180) between rays b→a and b→c, in the image
 * plane. 2-D is the default everywhere: MediaPipe's z is estimated from a
 * single camera and is far noisier than x/y, so a side- or front-on camera
 * plus 2-D angles is more stable than trusting depth.
 */
export function jointAngle(a: PoseLandmark, b: PoseLandmark, c: PoseLandmark): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const n1 = Math.hypot(v1x, v1y);
  const n2 = Math.hypot(v2x, v2y);
  if (n1 === 0 || n2 === 0) return 0;
  return Math.acos(clamp((v1x * v2x + v1y * v2y) / (n1 * n2), -1, 1)) * RAD_TO_DEG;
}

/** Same as `jointAngle` but including z — for callers that know the depth
 * estimate is trustworthy enough (e.g. analysis of a still pose). */
export function jointAngle3d(a: PoseLandmark, b: PoseLandmark, c: PoseLandmark): number {
  const v1 = [a.x - b.x, a.y - b.y, a.z - b.z];
  const v2 = [c.x - b.x, c.y - b.y, c.z - b.z];
  const n1 = Math.hypot(v1[0], v1[1], v1[2]);
  const n2 = Math.hypot(v2[0], v2[1], v2[2]);
  if (n1 === 0 || n2 === 0) return 0;
  const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
  return Math.acos(clamp(dot / (n1 * n2), -1, 1)) * RAD_TO_DEG;
}

/** 2-D distance in the image plane. */
export function distance(a: PoseLandmark, b: PoseLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distance3d(a: PoseLandmark, b: PoseLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Midpoint; its visibility is the weaker of the two, since the midpoint is
 * only as trustworthy as its least-visible end. */
export function midpoint(a: PoseLandmark, b: PoseLandmark): PoseLandmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: Math.min(visibilityOf(a), visibilityOf(b)),
  };
}

/**
 * Inclination of the segment a→b from vertical, 0° (vertical, either
 * direction) to 90° (horizontal). Used for torso lean and "is this person
 * lying in a plank or standing" gates.
 */
export function inclinationFromVertical(a: PoseLandmark, b: PoseLandmark): number {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dx === 0 && dy === 0) return 0;
  return Math.atan2(dx, dy) * RAD_TO_DEG;
}

/**
 * Signed elevation of `upper` above `lower`, in degrees from horizontal:
 * positive when `upper` sits higher in the frame (smaller y), negative when
 * lower. Squat depth uses it as "how far the hip is still above the knee".
 */
export function elevationAngle(upper: PoseLandmark, lower: PoseLandmark): number {
  const dx = Math.abs(upper.x - lower.x);
  const rise = lower.y - upper.y;
  if (dx === 0 && rise === 0) return 0;
  return Math.atan2(rise, dx) * RAD_TO_DEG;
}

/**
 * How far `mid` bends a straight line from `a` to `c`, signed by which side
 * it falls on: positive = `mid` is BELOW the a–c line in the image (larger
 * y), negative = above. Magnitude is 180° minus the a-mid-c angle, so a dead
 * straight line is 0. Returns null when a–c is too close to vertical for
 * "below" to mean anything (the caller is gating on a horizontal body).
 *
 * Push-ups use it on shoulder–hip–ankle: positive = hips sagging, negative =
 * hips piked.
 */
export function lineDeviation(a: PoseLandmark, mid: PoseLandmark, c: PoseLandmark): number | null {
  const dx = c.x - a.x;
  if (Math.abs(dx) < 1e-6) return null;
  const t = (mid.x - a.x) / dx;
  const lineY = a.y + t * (c.y - a.y);
  const bend = 180 - jointAngle(a, mid, c);
  return mid.y >= lineY ? bend : -bend;
}

export function visibilityOf(landmark: PoseLandmark | undefined): number {
  if (!landmark) return 0;
  return landmark.visibility ?? 1;
}

export function isVisible(landmark: PoseLandmark | undefined, threshold = 0.5): boolean {
  return visibilityOf(landmark) >= threshold;
}

/** Every listed landmark exists and clears the visibility threshold. */
export function allVisible(pose: Pose, indices: readonly number[], threshold = 0.5): boolean {
  return indices.every((i) => isVisible(pose[i], threshold));
}

/** Weakest visibility among the listed landmarks — 0 if any are missing. */
export function minVisibility(pose: Pose, indices: readonly number[]): number {
  if (indices.length === 0) return 1;
  return Math.min(...indices.map((i) => visibilityOf(pose[i])));
}

export function meanVisibility(pose: Pose, indices: readonly number[]): number {
  if (indices.length === 0) return 1;
  return indices.reduce((sum, i) => sum + visibilityOf(pose[i]), 0) / indices.length;
}

/** Inside the frame (normalized 0–1 on both axes), with `margin` of slack
 * either side. Only meaningful on raw normalized coordinates, i.e. before
 * `toAspectSpace`. */
export function inFrame(landmark: PoseLandmark | undefined, margin = 0.02): boolean {
  if (!landmark) return false;
  return (
    landmark.x >= -margin &&
    landmark.x <= 1 + margin &&
    landmark.y >= -margin &&
    landmark.y <= 1 + margin
  );
}

export interface SidePick {
  side: Side;
  indices: readonly number[];
  visibility: number;
}

/**
 * The better-visible body side for a side-on movement: whichever side's
 * listed landmarks have the higher mean visibility (left on a tie). In a
 * side view the far limbs are occluded by the body, and MediaPipe reports
 * that as lower visibility, so this reliably picks the limb facing the
 * camera.
 */
export function pickSide(
  pose: Pose,
  leftIdx: readonly number[],
  rightIdx: readonly number[],
): SidePick {
  const left = meanVisibility(pose, leftIdx);
  const right = meanVisibility(pose, rightIdx);
  return right > left
    ? { side: "right", indices: rightIdx, visibility: right }
    : { side: "left", indices: leftIdx, visibility: left };
}

/**
 * Normalized → square coordinates: x and z scaled by width/height so one
 * unit means the same physical length on both axes and angles come out
 * true. Visibility is carried through untouched.
 */
export function toAspectSpace(pose: Pose, aspectRatio: number): PoseLandmark[] {
  return pose.map((p) => ({
    x: p.x * aspectRatio,
    y: p.y,
    z: p.z * aspectRatio,
    visibility: p.visibility,
  }));
}
