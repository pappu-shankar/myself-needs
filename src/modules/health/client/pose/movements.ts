import type { CameraMovement } from "../../gym-types";
import {
  LM,
  SIDE_JOINTS,
  allVisible,
  distance,
  elevationAngle,
  inclinationFromVertical,
  jointAngle,
  lineDeviation,
  midpoint,
  type Pose,
  type Side,
} from "./geometry";

/**
 * One config per camera movement: which joint angle drives the rep, where
 * the rep turns around, what "full range" means, and which form faults can
 * honestly be seen from 33 BlazePose landmarks.
 *
 * Every rep is modelled the same way: the driver angle starts in a START
 * zone (standing tall, arms straight, bar racked…), travels past `endAt`
 * into the END zone (the turnaround: the bottom of a squat, the top of a
 * curl), and comes back past `startAt`. The gap between `startAt` and
 * `endAt` is the hysteresis band — a driver wobbling inside it never flips
 * phase, so landmark jitter can't count a rep on its own. The direction is
 * implied: `endAt < startAt` means the angle closes during the rep (squat),
 * `endAt > startAt` means it opens (press, raises).
 *
 * Thresholds were chosen from typical joint-angle ranges for each lift
 * (published motion-capture norms plus measuring stick-figure poses), then
 * widened so a noisy lite-model landmark (a few degrees of jitter) and the
 * rep counter's ~60 ms smoothing lag can't push a genuine rep out of range.
 * They have NOT been calibrated against live video yet — record a few sets
 * per movement and compare before tightening any of them.
 *
 * Angles are measured in aspect-corrected image coordinates (geometry.ts),
 * which is why most movements want a specific camera view: a side view for
 * sagittal-plane lifts (the knee/elbow/hip angle is in the image plane), a
 * front view for frontal-plane ones (arm abduction, both arms at once).
 */

export type CameraView = "side" | "front";

/** How a form check's per-frame measurements over one rep collapse into one
 * number: extreme values, the value at the driver's turnaround, the spread,
 * or how far it fell from where the rep started. */
export type FormAggregate = "max" | "min" | "peak" | "range" | "drop";

export interface FormCheck {
  /** Stable key — e.g. for counting how often a fault happened. */
  id: string;
  /** Short cue shown to the user when the fault fires. */
  message: string;
  /** Per-frame measurement; null when the landmarks it needs aren't
   * visible, in which case the frame is skipped (never guessed). */
  measure: (pose: Pose, side: Side) => number | null;
  aggregate: FormAggregate;
  faultAbove?: number;
  faultBelow?: number;
}

export interface MovementOverlay {
  points: readonly number[];
  segments: readonly (readonly [number, number])[];
  /** The joint(s) whose angle drives the count — drawn emphasised. */
  focus: readonly number[];
}

export interface MovementConfig {
  movement: CameraMovement;
  view: CameraView;
  /** Camera placement guidance shown next to the movement picker. */
  placement: string;
  /** "one": side-on, measure the side facing the camera. "both": front-on,
   * average left and right. */
  sides: "one" | "both";
  /** Landmarks that must be visible to count: the chosen side's list for
   * "one", both lists for "both", plus `shared` either way. */
  required: { left: readonly number[]; right: readonly number[]; shared?: readonly number[] };
  /** The angle (degrees) that drives the count. */
  driver: (pose: Pose, side: Side) => number | null;
  /** Typical driver value at the start position — 0 % on the ROM scale. */
  startRef: number;
  /** Back in the start zone once the driver passes this (completes a rep). */
  startAt: number;
  /** In the end zone (turnaround reached) once the driver passes this. */
  endAt: number;
  /** End-range of a full rep — 100 % on the ROM scale. */
  fullRange: number;
  /** Whether leaving the start position is the lowering (eccentric) half. */
  outIsEccentric: boolean;
  /** Overrides the counter's default minimum rep duration. */
  minRepMs?: number;
  /** Extra condition before the end zone counts (e.g. press: wrists overhead). */
  endRequires?: (pose: Pose, side: Side) => boolean;
  /** A cue when the body isn't in a position this movement can be counted
   * from at all (e.g. push-ups while standing); counting pauses meanwhile. */
  positionCue?: (pose: Pose, side: Side) => string | null;
  /** Shown until the first start position is seen. */
  setupCue: string;
  /** Shown after a movement that went most of the way but never reached `endAt`. */
  partialCue: string;
  phaseLabels: { setup: string; start: string; end: string };
  formChecks: readonly FormCheck[];
  overlay: (side: Side) => MovementOverlay;
}

/** Below this, a landmark is treated as not seen for a measurement. 0.5 is
 * MediaPipe's own default presence/visibility cut-off. */
const MEASURE_VISIBILITY = 0.5;

function seen(pose: Pose, ...indices: number[]): boolean {
  return allVisible(pose, indices, MEASURE_VISIBILITY);
}

function elbowAngle(pose: Pose, side: Side): number | null {
  const j = SIDE_JOINTS[side];
  if (!seen(pose, j.shoulder, j.elbow, j.wrist)) return null;
  return jointAngle(pose[j.shoulder], pose[j.elbow], pose[j.wrist]);
}

function kneeAngle(pose: Pose, side: Side): number | null {
  const j = SIDE_JOINTS[side];
  if (!seen(pose, j.hip, j.knee, j.ankle)) return null;
  return jointAngle(pose[j.hip], pose[j.knee], pose[j.ankle]);
}

function hipAngle(pose: Pose, side: Side): number | null {
  const j = SIDE_JOINTS[side];
  if (!seen(pose, j.shoulder, j.hip, j.knee)) return null;
  return jointAngle(pose[j.shoulder], pose[j.hip], pose[j.knee]);
}

/** Shoulder abduction/flexion: the angle at the shoulder between the torso
 * (toward the hip) and the upper arm. ~15° hanging, 90° arm horizontal,
 * ~170° straight overhead. */
function armAngle(pose: Pose, side: Side): number | null {
  const j = SIDE_JOINTS[side];
  if (!seen(pose, j.hip, j.shoulder, j.elbow)) return null;
  return jointAngle(pose[j.hip], pose[j.shoulder], pose[j.elbow]);
}

/** Mean of the left and right measurement, or whichever one is visible. */
function bothSides(measure: (pose: Pose, side: Side) => number | null) {
  return (pose: Pose): number | null => {
    const left = measure(pose, "left");
    const right = measure(pose, "right");
    if (left === null) return right;
    if (right === null) return left;
    return (left + right) / 2;
  };
}

/** +1 facing +x, -1 facing -x, 0 unknown. The nose sits forward of the hips
 * when side-on; 0.02 (aspect-space units, ~4 cm for a person filling the
 * frame) is the dead zone below which the person is facing the camera. */
function facingDirection(pose: Pose): number {
  if (!seen(pose, LM.nose, LM.leftHip, LM.rightHip)) return 0;
  const dx = pose[LM.nose].x - midpoint(pose[LM.leftHip], pose[LM.rightHip]).x;
  if (Math.abs(dx) < 0.02) return 0;
  return Math.sign(dx);
}

/**
 * The front leg's knee angle in a lunge: the leg whose ankle is further in
 * the direction the person faces. Falls back to the more-bent knee when the
 * facing direction is unclear (both knees bend in a lunge, the front one at
 * least as much), and to the only measurable knee when one leg is hidden.
 */
function frontKneeAngle(pose: Pose): number | null {
  const left = kneeAngle(pose, "left");
  const right = kneeAngle(pose, "right");
  if (left === null || right === null) return left ?? right;
  const facing = facingDirection(pose);
  if (facing === 0) return Math.min(left, right);
  return (pose[LM.leftAnkle].x - pose[LM.rightAnkle].x) * facing > 0 ? left : right;
}

/** Nose height above the hands, in torso lengths (shoulder-mid to hip-mid):
 * negative while hanging, positive once the face is above the bar. */
function noseAboveWrists(pose: Pose): number | null {
  if (
    !seen(
      pose,
      LM.nose,
      LM.leftWrist,
      LM.rightWrist,
      LM.leftShoulder,
      LM.rightShoulder,
      LM.leftHip,
      LM.rightHip,
    )
  ) {
    return null;
  }
  const wrists = midpoint(pose[LM.leftWrist], pose[LM.rightWrist]);
  const torso = distance(
    midpoint(pose[LM.leftShoulder], pose[LM.rightShoulder]),
    midpoint(pose[LM.leftHip], pose[LM.rightHip]),
  );
  if (torso <= 0) return null;
  return (wrists.y - pose[LM.nose].y) / torso;
}

/** Vertical ear-to-shoulder gap in shoulder widths, averaged over the
 * visible ears. Shrugging lifts the shoulders toward the ears and shrinks
 * it; dividing by shoulder width keeps it independent of camera distance. */
function earShoulderGap(pose: Pose): number | null {
  if (!seen(pose, LM.leftShoulder, LM.rightShoulder)) return null;
  const width = distance(pose[LM.leftShoulder], pose[LM.rightShoulder]);
  if (width <= 0) return null;
  const gaps: number[] = [];
  for (const side of ["left", "right"] as const) {
    const j = SIDE_JOINTS[side];
    if (seen(pose, j.ear)) gaps.push(pose[j.shoulder].y - pose[j.ear].y);
  }
  if (gaps.length === 0) return null;
  return gaps.reduce((a, b) => a + b, 0) / gaps.length / width;
}

/** Ankle spread in hip widths: ~1 with feet together, 3+ in a jack. */
function ankleSpread(pose: Pose): number | null {
  if (!seen(pose, LM.leftAnkle, LM.rightAnkle, LM.leftHip, LM.rightHip)) return null;
  const hips = distance(pose[LM.leftHip], pose[LM.rightHip]);
  if (hips <= 0) return null;
  return distance(pose[LM.leftAnkle], pose[LM.rightAnkle]) / hips;
}

/** Every visible arm has its wrist above its shoulder (and at least one
 * arm is visible). */
function wristsAboveShoulders(pose: Pose): boolean {
  let measured = 0;
  for (const side of ["left", "right"] as const) {
    const j = SIDE_JOINTS[side];
    if (!seen(pose, j.shoulder, j.wrist)) continue;
    measured++;
    if (pose[j.wrist].y >= pose[j.shoulder].y) return false;
  }
  return measured > 0;
}

function sideOverlay(
  pick: (j: (typeof SIDE_JOINTS)[Side]) => {
    points: number[];
    segments: [number, number][];
    focus: number[];
  },
) {
  return (side: Side): MovementOverlay => pick(SIDE_JOINTS[side]);
}

function bothOverlay(
  pick: (j: (typeof SIDE_JOINTS)[Side]) => {
    points: number[];
    segments: [number, number][];
    focus: number[];
  },
  extra: { points?: number[]; segments?: [number, number][] } = {},
) {
  return (): MovementOverlay => {
    const l = pick(SIDE_JOINTS.left);
    const r = pick(SIDE_JOINTS.right);
    return {
      points: [...l.points, ...r.points, ...(extra.points ?? [])],
      segments: [...l.segments, ...r.segments, ...(extra.segments ?? [])],
      focus: [...l.focus, ...r.focus],
    };
  };
}

const SHOULDER_LINE: [number, number] = [LM.leftShoulder, LM.rightShoulder];
const HIP_LINE: [number, number] = [LM.leftHip, LM.rightHip];

const SIDE = SIDE_JOINTS;

export const MOVEMENT_CONFIGS: Record<CameraMovement, MovementConfig> = {
  squat: {
    movement: "squat",
    view: "side",
    placement: "Side-on, camera at hip height, 2–3 m away so you're in frame head to feet.",
    sides: "one",
    required: {
      left: [SIDE.left.hip, SIDE.left.knee, SIDE.left.ankle],
      right: [SIDE.right.hip, SIDE.right.knee, SIDE.right.ankle],
    },
    // Knee angle: ~175° standing. With a typical 20–30° forward shin lean,
    // thighs parallel to the floor reads ~60–80°, so 80° is "full" and a
    // 120° half-squat is the shallowest dip that counts at all.
    driver: kneeAngle,
    startRef: 175,
    startAt: 160,
    endAt: 120,
    fullRange: 80,
    outIsEccentric: true,
    setupCue: "Stand tall, side-on to the camera, to start",
    partialCue: "Not counted — squat deeper",
    phaseLabels: { setup: "Get set", start: "Standing", end: "At depth" },
    formChecks: [
      {
        // Hip joint centre vs knee joint centre: level ≈ thighs parallel
        // (the hip crease sits a little below the hip centre and the top of
        // the knee a little above the knee centre, so those offsets roughly
        // cancel). 12° of slack absorbs landmark noise and smoothing lag.
        id: "squat_depth",
        message: "Go deeper",
        measure: (pose, side) => {
          const j = SIDE_JOINTS[side];
          if (!seen(pose, j.hip, j.knee)) return null;
          return elevationAngle(pose[j.hip], pose[j.knee]);
        },
        aggregate: "min",
        faultAbove: 12,
      },
    ],
    overlay: sideOverlay((j) => ({
      points: [j.shoulder, j.hip, j.knee, j.ankle],
      segments: [
        [j.shoulder, j.hip],
        [j.hip, j.knee],
        [j.knee, j.ankle],
      ],
      focus: [j.knee],
    })),
  },

  pushup: {
    movement: "pushup",
    view: "side",
    placement:
      "Side-on with the camera at floor level about 2 m away — shoulders, hips and ankles in frame.",
    sides: "one",
    required: {
      left: [SIDE.left.shoulder, SIDE.left.elbow, SIDE.left.wrist, SIDE.left.hip, SIDE.left.ankle],
      right: [
        SIDE.right.shoulder,
        SIDE.right.elbow,
        SIDE.right.wrist,
        SIDE.right.hip,
        SIDE.right.ankle,
      ],
    },
    // Elbow angle: ~170° arms straight, ~80–90° with the chest a fist off
    // the floor (upper arm about parallel to it).
    driver: elbowAngle,
    startRef: 170,
    startAt: 150,
    endAt: 115,
    fullRange: 85,
    outIsEccentric: true,
    // A horizontal torso is what makes this a push-up rather than someone
    // standing and bending their arms: shoulder→hip must be closer to
    // horizontal than vertical.
    positionCue: (pose, side) => {
      const j = SIDE_JOINTS[side];
      if (!seen(pose, j.shoulder, j.hip)) return null;
      return inclinationFromVertical(pose[j.hip], pose[j.shoulder]) < 45
        ? "Get into a plank, side-on to the camera"
        : null;
    },
    setupCue: "Get into a plank with straight arms",
    partialCue: "Not counted — lower your chest further",
    phaseLabels: { setup: "Get set", start: "Arms straight", end: "Chest down" },
    formChecks: [
      {
        // Shoulder–hip–ankle should be a straight line. 20° of bend is
        // clearly visible on video yet well above the lite model's noise.
        id: "pushup_hip_sag",
        message: "Hips sagging — brace your core",
        measure: (pose, side) => {
          const j = SIDE_JOINTS[side];
          if (!seen(pose, j.shoulder, j.hip, j.ankle)) return null;
          return lineDeviation(pose[j.shoulder], pose[j.hip], pose[j.ankle]);
        },
        aggregate: "max",
        faultAbove: 20,
      },
      {
        id: "pushup_hip_pike",
        message: "Hips too high — keep a straight line",
        measure: (pose, side) => {
          const j = SIDE_JOINTS[side];
          if (!seen(pose, j.shoulder, j.hip, j.ankle)) return null;
          return lineDeviation(pose[j.shoulder], pose[j.hip], pose[j.ankle]);
        },
        aggregate: "min",
        faultBelow: -20,
      },
    ],
    overlay: sideOverlay((j) => ({
      points: [j.shoulder, j.elbow, j.wrist, j.hip, j.knee, j.ankle],
      segments: [
        [j.shoulder, j.elbow],
        [j.elbow, j.wrist],
        [j.shoulder, j.hip],
        [j.hip, j.knee],
        [j.knee, j.ankle],
      ],
      focus: [j.elbow],
    })),
  },

  curl: {
    movement: "curl",
    view: "side",
    placement:
      "Side-on with the working arm toward the camera, hips to hands in frame. Counts the near arm.",
    sides: "one",
    required: {
      left: [SIDE.left.shoulder, SIDE.left.elbow, SIDE.left.wrist, SIDE.left.hip],
      right: [SIDE.right.shoulder, SIDE.right.elbow, SIDE.right.wrist, SIDE.right.hip],
    },
    // The curl is the press inverted: the rep starts with the arm OPEN
    // (~165°) and the turnaround is the closed elbow (~40–50° at the top),
    // so leaving the start is the lifting (concentric) half.
    driver: elbowAngle,
    startRef: 165,
    startAt: 140,
    endAt: 80,
    fullRange: 45,
    outIsEccentric: false,
    setupCue: "Let your arm hang straight to start",
    partialCue: "Not counted — curl all the way up",
    phaseLabels: { setup: "Get set", start: "Arm down", end: "Curled" },
    formChecks: [
      {
        // Angle between torso and upper arm. Strict curls let the elbow come
        // forward ~10–25° at the top; past 35° the front delt is lifting.
        id: "curl_elbow_drift",
        message: "Keep your elbow pinned to your side",
        measure: (pose, side) => {
          const j = SIDE_JOINTS[side];
          if (!seen(pose, j.hip, j.shoulder, j.elbow)) return null;
          return jointAngle(pose[j.hip], pose[j.shoulder], pose[j.elbow]);
        },
        aggregate: "max",
        faultAbove: 35,
      },
      {
        // Torso lean change within one rep. Swinging/cheat curls rock 15–30°;
        // a still torso moves only a few degrees (mostly landmark noise).
        id: "curl_torso_swing",
        message: "Don't swing — keep your torso still",
        measure: (pose, side) => {
          const j = SIDE_JOINTS[side];
          if (!seen(pose, j.hip, j.shoulder)) return null;
          return inclinationFromVertical(pose[j.hip], pose[j.shoulder]);
        },
        aggregate: "range",
        faultAbove: 15,
      },
    ],
    overlay: sideOverlay((j) => ({
      points: [j.hip, j.shoulder, j.elbow, j.wrist],
      segments: [
        [j.hip, j.shoulder],
        [j.shoulder, j.elbow],
        [j.elbow, j.wrist],
      ],
      focus: [j.elbow],
    })),
  },

  overhead_press: {
    movement: "overhead_press",
    view: "front",
    placement: "Facing the camera, far enough back that your hands stay in frame at full lockout.",
    sides: "both",
    required: {
      left: [SIDE.left.shoulder, SIDE.left.elbow, SIDE.left.wrist],
      right: [SIDE.right.shoulder, SIDE.right.elbow, SIDE.right.wrist],
    },
    // Front-on elbow angle: ~70–90° with the weight racked at the
    // shoulders, ~170°+ locked out overhead. Arms hanging at the sides ALSO
    // read ~170°, hence `endRequires` below.
    driver: bothSides(elbowAngle),
    startRef: 80,
    startAt: 105,
    endAt: 140,
    fullRange: 170,
    outIsEccentric: false,
    endRequires: wristsAboveShoulders,
    setupCue: "Rack the weight at shoulder height to start",
    partialCue: "Not counted — press all the way up",
    phaseLabels: { setup: "Get set", start: "Racked", end: "Overhead" },
    formChecks: [
      {
        id: "press_lockout",
        message: "Lock out fully overhead",
        measure: bothSides(elbowAngle),
        aggregate: "peak",
        faultBelow: 160,
      },
    ],
    overlay: bothOverlay(
      (j) => ({
        points: [j.shoulder, j.elbow, j.wrist],
        segments: [
          [j.shoulder, j.elbow],
          [j.elbow, j.wrist],
        ],
        focus: [j.elbow],
      }),
      { segments: [SHOULDER_LINE] },
    ),
  },

  lunge: {
    movement: "lunge",
    view: "side",
    placement:
      "Side-on, whole body in frame. Forward or reverse lunges in place — walking lunges leave the frame.",
    sides: "one",
    required: {
      left: [SIDE.left.hip, SIDE.left.knee, SIDE.left.ankle],
      right: [SIDE.right.hip, SIDE.right.knee, SIDE.right.ankle],
    },
    // Front knee: ~175° standing, ~90° at the bottom of a full lunge.
    driver: (pose) => frontKneeAngle(pose),
    startRef: 175,
    startAt: 155,
    endAt: 120,
    fullRange: 90,
    outIsEccentric: true,
    setupCue: "Stand tall, side-on to the camera, to start",
    partialCue: "Not counted — sink lower",
    phaseLabels: { setup: "Get set", start: "Standing", end: "Down" },
    formChecks: [
      {
        // 20° short of the 90° front-thigh-parallel target.
        id: "lunge_depth",
        message: "Sink lower — front thigh toward parallel",
        measure: (pose) => frontKneeAngle(pose),
        aggregate: "min",
        faultAbove: 110,
      },
    ],
    overlay: (side) => {
      const near = SIDE_JOINTS[side];
      const leg = (j: (typeof SIDE_JOINTS)[Side]): [number, number][] => [
        [j.hip, j.knee],
        [j.knee, j.ankle],
      ];
      return {
        points: [
          near.shoulder,
          LM.leftHip,
          LM.rightHip,
          LM.leftKnee,
          LM.rightKnee,
          LM.leftAnkle,
          LM.rightAnkle,
        ],
        segments: [[near.shoulder, near.hip], ...leg(SIDE.left), ...leg(SIDE.right)],
        focus: [LM.leftKnee, LM.rightKnee],
      };
    },
  },

  hinge: {
    movement: "hinge",
    view: "side",
    placement: "Side-on, camera at hip height, head to feet in frame.",
    sides: "one",
    required: {
      left: [SIDE.left.shoulder, SIDE.left.hip, SIDE.left.knee],
      right: [SIDE.right.shoulder, SIDE.right.hip, SIDE.right.knee],
    },
    // Hip angle (shoulder–hip–knee): ~175° standing, ~80–100° at the bottom
    // of a Romanian deadlift, lower from the floor.
    driver: hipAngle,
    startRef: 175,
    startAt: 155,
    endAt: 125,
    fullRange: 90,
    outIsEccentric: true,
    setupCue: "Stand tall, side-on to the camera, to start",
    partialCue: "Not counted — hinge further",
    phaseLabels: { setup: "Get set", start: "Standing", end: "Hinged" },
    // Back rounding is the fault everyone wants flagged, but BlazePose has no
    // spine landmarks — shoulder and hip only — so a rounded back and a flat
    // one look identical. It's omitted rather than guessed. The one hinge
    // fault the landmarks DO show is the hinge collapsing into a squat.
    formChecks: [
      {
        // Conventional deadlifts bottom out around 100–130° of knee bend and
        // RDLs/swings well above that; under 90° the knees are doing the work.
        id: "hinge_knee_dominant",
        message: "Push your hips back — don't squat it",
        measure: kneeAngle,
        aggregate: "min",
        faultBelow: 90,
      },
    ],
    overlay: sideOverlay((j) => ({
      points: [j.shoulder, j.hip, j.knee, j.ankle],
      segments: [
        [j.shoulder, j.hip],
        [j.hip, j.knee],
        [j.knee, j.ankle],
      ],
      focus: [j.hip],
    })),
  },

  pullup: {
    movement: "pullup",
    view: "front",
    placement: "Facing the camera, far enough back to see your hands on the bar down to your hips.",
    sides: "both",
    required: {
      left: [SIDE.left.shoulder, SIDE.left.elbow, SIDE.left.wrist],
      right: [SIDE.right.shoulder, SIDE.right.elbow, SIDE.right.wrist],
    },
    // Front-on elbow angle: ~170° in a dead hang. The top depends on grip
    // width (~40° close chin-up, ~85° wide pull-up), so the turnaround is a
    // generous 100° and chin height is checked separately below.
    driver: bothSides(elbowAngle),
    startRef: 170,
    startAt: 145,
    endAt: 100,
    fullRange: 70,
    outIsEccentric: false,
    positionCue: (pose) =>
      wristsAboveShoulders(pose) ? null : "Hang from the bar — hands above your head",
    setupCue: "Hang from the bar with straight arms to start",
    partialCue: "Not counted — pull higher",
    phaseLabels: { setup: "Get set", start: "Hanging", end: "Top" },
    formChecks: [
      {
        // Geometrically the chin clears the bar at ~0.2 torso lengths of
        // nose-above-wrists (the bar sits in the palm above the wrist, the
        // chin below the nose); 0.1 is deliberately lenient so smoothing lag
        // at the top doesn't nag a good rep. Skipped (null) when the nose or
        // hips aren't visible, e.g. filmed from behind.
        id: "pullup_chin",
        message: "Pull until your chin clears the bar",
        measure: (pose) => noseAboveWrists(pose),
        aggregate: "max",
        faultBelow: 0.1,
      },
    ],
    overlay: bothOverlay(
      (j) => ({
        points: [j.shoulder, j.elbow, j.wrist],
        segments: [
          [j.shoulder, j.elbow],
          [j.elbow, j.wrist],
        ],
        focus: [j.elbow],
      }),
      { points: [LM.nose], segments: [SHOULDER_LINE] },
    ),
  },

  lateral_raise: {
    movement: "lateral_raise",
    view: "front",
    placement: "Facing the camera, head to hips in frame with room for your arms out to the side.",
    sides: "both",
    required: {
      left: [SIDE.left.hip, SIDE.left.shoulder, SIDE.left.elbow],
      right: [SIDE.right.hip, SIDE.right.shoulder, SIDE.right.elbow],
    },
    // Arm abduction: ~15° hanging, 90° at shoulder height.
    driver: bothSides(armAngle),
    startRef: 15,
    startAt: 35,
    endAt: 65,
    fullRange: 90,
    outIsEccentric: false,
    setupCue: "Arms by your sides to start",
    partialCue: "Not counted — raise to shoulder height",
    phaseLabels: { setup: "Get set", start: "Arms down", end: "Raised" },
    formChecks: [
      {
        id: "raise_too_high",
        message: "Stop at shoulder height",
        measure: bothSides(armAngle),
        aggregate: "max",
        faultAbove: 110,
      },
      {
        // Drop in the ear-to-shoulder gap from the start of the rep. Normal
        // scapular rotation lifts the shoulder landmark ~1–2 cm at 90°; 0.15
        // shoulder widths (~5–6 cm) is a real shrug.
        id: "raise_shrug",
        message: "Keep your shoulders down — don't shrug",
        measure: (pose) => earShoulderGap(pose),
        aggregate: "drop",
        faultAbove: 0.15,
      },
    ],
    overlay: bothOverlay(
      (j) => ({
        points: [j.hip, j.shoulder, j.elbow, j.wrist],
        segments: [
          [j.hip, j.shoulder],
          [j.shoulder, j.elbow],
          [j.elbow, j.wrist],
        ],
        focus: [j.shoulder],
      }),
      { segments: [SHOULDER_LINE] },
    ),
  },

  jumping_jack: {
    movement: "jumping_jack",
    view: "front",
    placement: "Facing the camera about 3 m back — whole body in frame with arms overhead.",
    sides: "both",
    required: {
      left: [SIDE.left.shoulder, SIDE.left.elbow, SIDE.left.hip, SIDE.left.ankle],
      right: [SIDE.right.shoulder, SIDE.right.elbow, SIDE.right.hip, SIDE.right.ankle],
    },
    // Arms drive the count (they travel ~140°, far more than the legs move);
    // the feet are a form check so a low-impact step-jack still counts.
    driver: bothSides(armAngle),
    startRef: 20,
    startAt: 45,
    endAt: 110,
    fullRange: 160,
    outIsEccentric: false,
    // Brisk jacks run ~2 a second, leaving ~300 ms outside the start zone.
    minRepMs: 250,
    setupCue: "Stand with feet together and arms down to start",
    partialCue: "Not counted — arms all the way up",
    phaseLabels: { setup: "Get set", start: "Arms down", end: "Arms up" },
    formChecks: [
      {
        id: "jack_arms",
        message: "Bring your arms all the way overhead",
        measure: bothSides(armAngle),
        aggregate: "max",
        faultBelow: 140,
      },
      {
        // ~1 hip width with feet together; a full jack lands at 3+.
        id: "jack_feet",
        message: "Jump your feet wider",
        measure: (pose) => ankleSpread(pose),
        aggregate: "max",
        faultBelow: 2,
      },
    ],
    overlay: bothOverlay(
      (j) => ({
        points: [j.shoulder, j.elbow, j.wrist, j.hip, j.knee, j.ankle],
        segments: [
          [j.shoulder, j.elbow],
          [j.elbow, j.wrist],
          [j.hip, j.knee],
          [j.knee, j.ankle],
        ],
        focus: [j.shoulder],
      }),
      { segments: [SHOULDER_LINE, HIP_LINE] },
    ),
  },
};

export function getMovementConfig(movement: CameraMovement): MovementConfig {
  return MOVEMENT_CONFIGS[movement];
}

/** Does the driver angle close (squat) or open (press) on the way out? */
export function movementDirection(config: MovementConfig): "closing" | "opening" {
  return config.endAt < config.startAt ? "closing" : "opening";
}

/** The landmarks that must be visible to count, for the chosen side. */
export function requiredLandmarks(config: MovementConfig, side: Side): number[] {
  const shared = config.required.shared ?? [];
  if (config.sides === "both") {
    return [...config.required.left, ...config.required.right, ...shared];
  }
  return [...config.required[side], ...shared];
}

/** 0–100: how far a rep's turnaround got from `startRef` toward `fullRange`.
 * The same formula serves both directions because the sign of the
 * numerator and denominator flip together. */
export function romScore(config: MovementConfig, peak: number): number {
  const progress = (peak - config.startRef) / (config.fullRange - config.startRef);
  return Math.round(100 * Math.min(1, Math.max(0, progress)));
}
