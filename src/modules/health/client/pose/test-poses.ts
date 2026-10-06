import {
  LM,
  POSE_LANDMARK_COUNT,
  SIDE_JOINTS,
  type PoseLandmark,
  type SideJoints,
} from "./geometry";

/**
 * TEST-ONLY synthetic poses for the pose tests: stick figures built from
 * joint angles, so a test can say "a squat at 95° of knee bend" and get 33
 * landmarks whose measured angle is exactly that. Not imported by app code.
 *
 * Coordinates are "square" (aspect 1) normalized image space, y down. Side
 * views face +x with the LEFT side toward the camera: left landmarks are
 * visible (0.95), right ones sit in the same place but occluded (0.3), as
 * MediaPipe reports a far limb hidden behind the body.
 */

export interface Point {
  x: number;
  y: number;
}

const NEAR_VISIBILITY = 0.95;
const FAR_VISIBILITY = 0.3;

/** A point `length` away from `from` in direction `angleDeg` (0° = +x,
 * 90° = straight down, 270° = straight up — image coordinates). */
export function polar(from: Point, length: number, angleDeg: number): Point {
  const r = (angleDeg * Math.PI) / 180;
  return { x: from.x + length * Math.cos(r), y: from.y + length * Math.sin(r) };
}

/** Direction from a to b in the same angle convention as `polar`. */
export function direction(a: Point, b: Point): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** 33 landmarks; anything not given is parked mid-frame with visibility 0. */
export function makePose(
  points: Partial<Record<number, Point>>,
  visibility: Partial<Record<number, number>> = {},
): PoseLandmark[] {
  return Array.from({ length: POSE_LANDMARK_COUNT }, (_, i) => {
    const p = points[i];
    return p
      ? { x: p.x, y: p.y, z: 0, visibility: visibility[i] ?? NEAR_VISIBILITY }
      : { x: 0.5, y: 0.5, z: 0, visibility: 0 };
  });
}

/** Side view: the given joints on the visible left side, mirrored onto the
 * occluded right side. */
function sideView(
  joints: Partial<Record<keyof SideJoints, Point>>,
  extra: Partial<Record<number, Point>> = {},
): PoseLandmark[] {
  const points: Partial<Record<number, Point>> = { ...extra };
  const visibility: Partial<Record<number, number>> = {};
  for (const [joint, p] of Object.entries(joints) as [keyof SideJoints, Point][]) {
    points[SIDE_JOINTS.left[joint]] = p;
    points[SIDE_JOINTS.right[joint]] = p;
    visibility[SIDE_JOINTS.right[joint]] = FAR_VISIBILITY;
  }
  return makePose(points, visibility);
}

/** Squat, side view, shin vertical: knee angle = 90° + how far the thigh
 * is above horizontal, so `kneeDeg` 100 ⇒ hip 10° above the knee. */
export function squatPose(kneeDeg: number): PoseLandmark[] {
  const ankle = { x: 0.5, y: 0.9 };
  const knee = { x: 0.5, y: 0.7 };
  const hip = polar(knee, 0.2, 90 + kneeDeg);
  const shoulder = { x: hip.x, y: hip.y - 0.25 };
  return sideView(
    { ankle, knee, hip, shoulder },
    { [LM.nose]: { x: hip.x + 0.05, y: shoulder.y - 0.08 } },
  );
}

/** Push-up, side view: forearm vertical, `sag` pushes the hips down (+) or
 * up (−) off the shoulder–ankle line. `standing` puts the torso upright. */
export function pushupPose(
  elbowDeg: number,
  { sag = 0, standing = false }: { sag?: number; standing?: boolean } = {},
): PoseLandmark[] {
  const wrist = { x: 0.8, y: 0.8 };
  const elbow = { x: 0.8, y: 0.65 };
  const shoulder = polar(elbow, 0.15, 90 - elbowDeg);
  if (standing) {
    const hip = { x: shoulder.x, y: shoulder.y + 0.3 };
    return sideView({
      wrist,
      elbow,
      shoulder,
      hip,
      knee: { x: hip.x, y: 0.8 },
      ankle: { x: hip.x, y: 0.95 },
    });
  }
  const ankle = { x: shoulder.x - 0.6, y: 0.8 };
  const onLine = lerp(shoulder, ankle, 3 / 7);
  const hip = { x: onLine.x, y: onLine.y + sag };
  const knee = lerp(hip, ankle, 0.5);
  return sideView({ wrist, elbow, shoulder, hip, knee, ankle });
}

/** Curl, side view: upper arm hangs (rotated forward by `drift`°), torso
 * tilted forward by `lean`°. */
export function curlPose(
  elbowDeg: number,
  { drift = 0, lean = 0 }: { drift?: number; lean?: number } = {},
): PoseLandmark[] {
  const hip = { x: 0.5, y: 0.65 };
  const shoulder = polar(hip, 0.3, 270 + lean);
  const elbow = polar(shoulder, 0.15, 90 - drift);
  const wrist = polar(elbow, 0.15, direction(elbow, shoulder) + elbowDeg);
  return sideView({ hip, shoulder, elbow, wrist });
}

/** Overhead press, front view: upper arms angled 45° up-and-out, elbow
 * opening upward. `armsDown` hangs both arms straight at the sides. */
export function pressPose(elbowDeg: number, { armsDown = false } = {}): PoseLandmark[] {
  const points: Partial<Record<number, Point>> = {
    [LM.nose]: { x: 0.5, y: 0.35 },
    [LM.leftHip]: { x: 0.58, y: 0.75 },
    [LM.rightHip]: { x: 0.42, y: 0.75 },
  };
  for (const [side, x, upper, turn] of [
    ["left", 0.6, 315, 1],
    ["right", 0.4, 225, -1],
  ] as const) {
    const j = SIDE_JOINTS[side];
    const shoulder = { x, y: 0.45 };
    const elbow = armsDown ? { x, y: 0.6 } : polar(shoulder, 0.12, upper);
    const wrist = armsDown
      ? { x, y: 0.75 }
      : polar(elbow, 0.12, direction(elbow, shoulder) + turn * elbowDeg);
    points[j.shoulder] = shoulder;
    points[j.elbow] = elbow;
    points[j.wrist] = wrist;
  }
  return makePose(points);
}

/** Lateral raise / jumping jack, front view: arms abducted `armDeg` from the
 * sides; `shrug` lifts both shoulders toward the ears; `feet` is half the
 * ankle spread (0.1 = together for 0.2-wide hips). */
export function frontArmsPose(
  armDeg: number,
  { shrug = 0, feet = 0.1 }: { shrug?: number; feet?: number } = {},
): PoseLandmark[] {
  const points: Partial<Record<number, Point>> = {
    [LM.nose]: { x: 0.5, y: 0.25 },
    [LM.leftEar]: { x: 0.53, y: 0.3 },
    [LM.rightEar]: { x: 0.47, y: 0.3 },
  };
  for (const [side, x, sign] of [
    ["left", 0.6, 1],
    ["right", 0.4, -1],
  ] as const) {
    const j = SIDE_JOINTS[side];
    const shoulder = { x, y: 0.4 - shrug };
    const dir = 90 - sign * armDeg;
    const elbow = polar(shoulder, 0.13, dir);
    const hip = { x, y: 0.7 };
    const ankle = { x: 0.5 + sign * feet, y: 0.95 };
    points[j.shoulder] = shoulder;
    points[j.elbow] = elbow;
    points[j.wrist] = polar(elbow, 0.12, dir);
    points[j.hip] = hip;
    points[j.ankle] = ankle;
    points[j.knee] = lerp(hip, ankle, 0.5);
  }
  return makePose(points);
}

/** Pull-up, front view: hands fixed on a bar at y 0.12, body hanging below
 * with the given elbow angle. `chinOverBar` lifts the nose clearly above the
 * hands (0.2 torso lengths); otherwise it sits just above the shoulders.
 * `handsDown` is someone standing with arms at their sides. */
export function pullupPose(
  elbowDeg: number,
  { chinOverBar = false, handsDown = false } = {},
): PoseLandmark[] {
  const barY = 0.12;
  const d = 2 * 0.15 * Math.sin((elbowDeg * Math.PI) / 360);
  const shoulderY = handsDown ? 0.4 : barY + d;
  const points: Partial<Record<number, Point>> = {
    [LM.nose]: { x: 0.5, y: chinOverBar ? barY - 0.06 : shoulderY - 0.1 },
    [LM.leftHip]: { x: 0.6, y: shoulderY + 0.3 },
    [LM.rightHip]: { x: 0.4, y: shoulderY + 0.3 },
  };
  for (const [side, x, sign] of [
    ["left", 0.62, 1],
    ["right", 0.38, -1],
  ] as const) {
    const j = SIDE_JOINTS[side];
    const shoulder = { x, y: shoulderY };
    if (handsDown) {
      points[j.shoulder] = shoulder;
      points[j.elbow] = { x, y: shoulderY + 0.15 };
      points[j.wrist] = { x, y: shoulderY + 0.3 };
      continue;
    }
    const wrist = { x, y: barY };
    const h = Math.sqrt(Math.max(0, 0.15 ** 2 - (d / 2) ** 2));
    points[j.shoulder] = shoulder;
    points[j.wrist] = wrist;
    points[j.elbow] = { x: x + sign * h, y: (barY + shoulderY) / 2 };
  }
  return makePose(points);
}

/** Lunge, side view, both legs visible. The LEFT leg is the front one
 * (ahead in the facing direction). */
export function lungePose(
  frontKneeDeg: number,
  backKneeDeg: number,
  facing: 1 | -1 = 1,
): PoseLandmark[] {
  const frontAnkle = { x: 0.5 + 0.12 * facing, y: 0.92 };
  const frontKnee = { x: frontAnkle.x, y: 0.72 };
  const hip = polar(frontKnee, 0.2, facing > 0 ? 90 + frontKneeDeg : 90 - frontKneeDeg);
  const backKnee = polar(hip, 0.2, 90 + 30 * facing);
  const backAnkle = polar(backKnee, 0.18, direction(backKnee, hip) + backKneeDeg * facing);
  const shoulder = { x: hip.x, y: hip.y - 0.35 };
  return makePose({
    [LM.nose]: { x: hip.x + 0.05 * facing, y: hip.y - 0.45 },
    [LM.leftShoulder]: shoulder,
    [LM.rightShoulder]: shoulder,
    [LM.leftHip]: hip,
    [LM.rightHip]: hip,
    [LM.leftKnee]: frontKnee,
    [LM.leftAnkle]: frontAnkle,
    [LM.rightKnee]: backKnee,
    [LM.rightAnkle]: backAnkle,
  });
}

/** Hip hinge, side view: shin vertical, knee bent to `kneeDeg`, torso
 * folded to `hipDeg` at the hip. */
export function hingePose(hipDeg: number, kneeDeg = 160): PoseLandmark[] {
  const ankle = { x: 0.45, y: 0.92 };
  const knee = { x: 0.45, y: 0.72 };
  const hip = polar(knee, 0.22, 90 + kneeDeg);
  const shoulder = polar(hip, 0.3, direction(hip, knee) - hipDeg);
  return sideView({ ankle, knee, hip, shoulder });
}

/** Linear interpolation through `points`, `steps` frames per leg (the first
 * point included once). path([175, 90, 175], 10) → 21 values. */
export function path(points: readonly number[], steps: number): number[] {
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    for (let s = 1; s <= steps; s++) {
      out.push(points[i - 1] + ((points[i] - points[i - 1]) * s) / steps);
    }
  }
  return out;
}
