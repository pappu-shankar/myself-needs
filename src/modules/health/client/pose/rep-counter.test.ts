// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { PoseLandmark, Pose } from "./geometry";
import { getMovementConfig, type MovementConfig } from "./movements";
import {
  NO_PERSON_CUE,
  RepCounter,
  STEP_BACK_CUE,
  type RepCounterOptions,
  type RepCounterSnapshot,
} from "./rep-counter";
import {
  curlPose,
  frontArmsPose,
  hingePose,
  lungePose,
  path,
  pressPose,
  pullupPose,
  pushupPose,
  squatPose,
} from "./test-poses";

/**
 * Two layers of tests. The state machine itself runs on a minimal config
 * whose driver angle is simply landmark 0's z, so a test can script the
 * exact angle per frame. The real movements then run end to end on
 * synthetic stick-figure poses through the default smoothing.
 */

const SQUAT = getMovementConfig("squat");

/** startAt 160 / endAt 120 / full 80, closing; "Too deep" below 70. */
const TEST_CONFIG: MovementConfig = {
  ...SQUAT,
  sides: "both",
  required: { left: [0], right: [] },
  driver: (pose) => pose[0].z,
  startRef: 175,
  startAt: 160,
  endAt: 120,
  fullRange: 80,
  outIsEccentric: true,
  minRepMs: undefined,
  positionCue: undefined,
  endRequires: undefined,
  formChecks: [
    {
      id: "too_deep",
      message: "Too deep",
      measure: (pose) => pose[0].z,
      aggregate: "min",
      faultBelow: 70,
    },
  ],
};

function frame(angle: number, visibility = 1, x = 0.5): PoseLandmark[] {
  return [{ x, y: 0.5, z: angle, visibility }];
}

function counter(overrides: Partial<RepCounterOptions> = {}) {
  return new RepCounter({ movement: "squat", config: TEST_CONFIG, smoothingMs: 0, ...overrides });
}

/** Feeds [timestamp, angle] pairs; returns the last snapshot. */
function feed(c: RepCounter, frames: [number, number | null][], visibility = 1) {
  let snap: RepCounterSnapshot = c.snapshot();
  for (const [t, angle] of frames) {
    snap = c.update(t, angle === null ? null : frame(angle, visibility));
  }
  return snap;
}

/** Angles at a fixed frame interval starting at t0. */
function timed(angles: number[], t0 = 0, dt = 33): [number, number][] {
  return angles.map((a, i) => [t0 + i * dt, a]);
}

describe("RepCounter end of set", () => {
  /** One clean rep from t0: 170 → 100 → 170 over 600 ms. */
  function oneRep(c: RepCounter, t0 = 0) {
    return feed(c, [
      [t0, 170],
      [t0 + 300, 100],
      [t0 + 600, 170],
    ]);
  }

  /** Still frames (angle ± 3° jitter) every 100 ms from `from` to `to`. */
  function hold(c: RepCounter, from: number, to: number, angle = 170) {
    const frames: [number, number][] = [];
    for (let t = from; t <= to; t += 100) frames.push([t, angle + (t % 200 ? 3 : -3)]);
    return feed(c, frames);
  }

  it("never ends a set before the first rep", () => {
    const c = counter();
    feed(c, [[0, 170]]);
    expect(hold(c, 100, 10_000).setEnded).toBe(false);
    expect(
      feed(c, [
        [10_100, null],
        [14_000, null],
      ]).setEnded,
    ).toBe(false);
  });

  it("ends after ~4 s of standing still in view, and un-ends on movement", () => {
    const c = counter();
    expect(oneRep(c).setEnded).toBe(false);
    expect(hold(c, 700, 4500).setEnded).toBe(false);
    expect(hold(c, 4600, 4700).setEnded).toBe(true);
    // Starting the next rep is movement: the set is live again.
    const snap = feed(c, [[4800, 130]]);
    expect(snap.setEnded).toBe(false);
  });

  it("restarts the idle clock on each new rep", () => {
    const c = counter();
    oneRep(c);
    hold(c, 700, 3500);
    oneRep(c, 3600);
    expect(hold(c, 4300, 7500).setEnded).toBe(false);
    expect(hold(c, 7600, 8300).setEnded).toBe(true);
    expect(c.snapshot().reps).toBe(2);
  });

  it("doesn't end while the user keeps moving without finishing a rep", () => {
    const c = counter();
    oneRep(c);
    const sway: [number, number][] = [];
    for (let t = 700; t <= 9000; t += 100) sway.push([t, t % 1000 < 500 ? 170 : 145]);
    expect(feed(c, sway).setEnded).toBe(false);
  });

  it("ends ~2 s after the user leaves the frame", () => {
    const c = counter();
    oneRep(c);
    expect(
      feed(c, [
        [700, null],
        [2500, null],
      ]).setEnded,
    ).toBe(false);
    expect(feed(c, [[2700, null]]).setEnded).toBe(true);
    expect(feed(c, [[2800, 170]]).setEnded).toBe(false);
  });

  it("treats a brief occlusion as part of the set", () => {
    const c = counter();
    oneRep(c);
    feed(c, [
      [700, null],
      [1500, null],
    ]);
    expect(feed(c, [[1600, 170]]).setEnded).toBe(false);
  });

  it("counts time spent out of position (stood up from push-ups) as rest", () => {
    const outOfPosition = {
      ...TEST_CONFIG,
      positionCue: (p: Pose) => (p[0].x > 0.8 ? "Get down" : null),
    };
    const c = counter({ config: outOfPosition });
    oneRep(c);
    const frames: [number, number][] = [];
    for (let t = 700; t <= 4700; t += 100) frames.push([t, 100 + (t % 1000) / 10]);
    let snap = c.snapshot();
    for (const [t, a] of frames) snap = c.update(t, frame(a, 1, 0.9));
    expect(snap.cue).toBe("Get down");
    expect(snap.setEnded).toBe(true);
  });

  it("honours custom timings and clears on reset", () => {
    const c = counter({ setEndIdleMs: 1000, setEndAwayMs: 500 });
    oneRep(c);
    expect(hold(c, 700, 1800).setEnded).toBe(true);
    c.reset();
    expect(c.snapshot().setEnded).toBe(false);
    oneRep(c, 2000);
    expect(
      feed(c, [
        [2700, null],
        [3200, null],
      ]).setEnded,
    ).toBe(true);
  });
});

describe("RepCounter state machine", () => {
  it("counts start → end → start as one rep", () => {
    const c = counter();
    expect(c.snapshot().phase).toBe("setup");
    expect(feed(c, [[0, 170]]).phase).toBe("start");
    expect(feed(c, [[100, 140]]).phase).toBe("start");
    expect(feed(c, [[200, 110]]).phase).toBe("end");
    expect(feed(c, [[300, 140]]).phase).toBe("end");
    const snap = feed(c, [[400, 165]]);
    expect(snap.phase).toBe("start");
    expect(snap.reps).toBe(1);
  });

  it("scores range of motion and splits tempo at the turnaround", () => {
    const c = counter();
    const snap = feed(c, [
      [0, 170],
      [100, 170], // last frame in the start zone
      [200, 140],
      [300, 120],
      [400, 100],
      [500, 90], // deepest point
      [600, 140],
      [700, 170], // back in the start zone
    ]);
    expect(snap.reps).toBe(1);
    // (175 − 90) / (175 − 80) = 89.5 %
    expect(snap.lastRep).toEqual({
      romScore: 89,
      tempoMs: { eccentric: 400, concentric: 200 },
      flags: [],
    });
    expect(c.reps[0]).toMatchObject({ index: 1, peakAngle: 90, durationMs: 600, endedAt: 700 });
  });

  it("maps the out half to concentric when leaving the start lifts the weight", () => {
    const c = counter({ config: { ...TEST_CONFIG, outIsEccentric: false } });
    const snap = feed(c, [
      [0, 170],
      [400, 90],
      [500, 170],
    ]);
    expect(snap.lastRep?.tempoMs).toEqual({ eccentric: 100, concentric: 400 });
  });

  it("ignores wobbling inside the hysteresis band", () => {
    const c = counter();
    feed(c, [[0, 170]]);
    const wobble = Array.from({ length: 60 }, (_, i) => (i % 2 ? 125 : 155));
    const snap = feed(c, timed(wobble, 33));
    expect(snap.reps).toBe(0);
    expect(snap.phase).toBe("start");
  });

  it("ignores chatter around a single threshold", () => {
    const c = counter();
    const chatter = Array.from({ length: 60 }, (_, i) => (i % 2 ? 158 : 162));
    expect(feed(c, timed(chatter)).reps).toBe(0);
    const c2 = counter();
    feed(c2, [[0, 170]]);
    const nearEnd = Array.from({ length: 60 }, (_, i) => (i % 2 ? 118 : 122));
    // Crossing endAt back and forth never returns to the start zone.
    const snap = feed(c2, timed(nearEnd, 33));
    expect(snap.reps).toBe(0);
    expect(snap.phase).toBe("end");
  });

  it("rejects a rep faster than the minimum duration as jitter", () => {
    const c = counter();
    let snap = feed(c, [
      [0, 170],
      [100, 100],
      [200, 170],
    ]);
    expect(snap.reps).toBe(0);
    snap = feed(c, [
      [300, 170],
      [500, 100],
      [700, 170],
    ]);
    expect(snap.reps).toBe(1);
    expect(c.reps[0].index).toBe(1);
  });

  it("honours a movement's own minimum rep duration", () => {
    const c = counter({ config: { ...TEST_CONFIG, minRepMs: 150 } });
    expect(
      feed(c, [
        [0, 170],
        [100, 100],
        [200, 170],
      ]).reps,
    ).toBe(1);
  });

  it("doesn't count standing up from an initial crouch", () => {
    const c = counter();
    let snap = feed(c, [[0, 90]]);
    expect(snap.phase).toBe("setup");
    expect(snap.cue).toBe(SQUAT.setupCue);
    snap = feed(c, [
      [300, 90],
      [600, 170],
    ]);
    expect(snap.reps).toBe(0);
    expect(snap.phase).toBe("start");
    expect(snap.cue).toBeNull();
  });

  it("calls out a deliberate rep that fell short, but not a small wobble", () => {
    const c = counter();
    let snap = feed(c, [
      [0, 170],
      [200, 155],
      [400, 170],
    ]);
    expect(snap.cue).toBeNull();
    snap = feed(c, [
      [600, 135],
      [900, 170],
    ]);
    expect(snap.reps).toBe(0);
    expect(snap.cue).toBe(SQUAT.partialCue);
    // A full rep afterwards replaces the "not counted" cue.
    snap = feed(c, [
      [1200, 100],
      [1500, 170],
    ]);
    expect(snap.reps).toBe(1);
    expect(snap.cue).toBeNull();
  });

  it("flags form faults per rep and summarises them", () => {
    const c = counter();
    let snap = feed(c, [
      [0, 170],
      [300, 65],
      [600, 170],
    ]);
    expect(snap.lastRep?.flags).toEqual(["Too deep"]);
    expect(snap.cue).toBe("Too deep");
    snap = feed(c, [
      [900, 100],
      [1200, 170],
      [1500, 60],
      [1800, 170],
    ]);
    expect(snap.reps).toBe(3);
    expect(snap.lastRep?.flags).toEqual(["Too deep"]);
    expect(snap.flagSummary).toEqual([{ id: "too_deep", message: "Too deep", count: 2 }]);
    // ROM: 100 %, 79 %, 100 % → 93
    expect(c.reps.map((r) => r.romScore)).toEqual([100, 79, 100]);
    expect(snap.avgRomScore).toBe(93);
  });

  it("evaluates every aggregate kind", () => {
    const measure = (pose: Pose) => pose[0].x;
    const checks: MovementConfig["formChecks"] = [
      { id: "max", message: "max", measure, aggregate: "max", faultAbove: 0.65 },
      { id: "min", message: "min", measure, aggregate: "min", faultBelow: 0.35 },
      { id: "peak", message: "peak", measure, aggregate: "peak", faultAbove: 0.55 },
      { id: "range", message: "range", measure, aggregate: "range", faultAbove: 0.25 },
      { id: "drop", message: "drop", measure, aggregate: "drop", faultAbove: 0.15 },
    ];
    const c = counter({ config: { ...TEST_CONFIG, formChecks: checks } });
    // x: start 0.5 → dips to 0.3 → 0.6 at the deepest frame → 0.7 → back.
    c.update(0, frame(170, 1, 0.5));
    c.update(100, frame(140, 1, 0.3));
    c.update(200, frame(90, 1, 0.6));
    c.update(300, frame(130, 1, 0.7));
    const snap = c.update(500, frame(170, 1, 0.5));
    // max 0.7 > 0.65 ✓, min 0.3 < 0.35 ✓, peak 0.6 > 0.55 ✓, range 0.4 ✓, drop 0.2 ✓
    expect(snap.lastRep?.flags).toEqual(["max", "min", "peak", "range", "drop"]);
  });

  it("skips a check whose landmarks were never visible instead of flagging it", () => {
    const c = counter({
      config: {
        ...TEST_CONFIG,
        formChecks: [
          { id: "x", message: "x", measure: () => null, aggregate: "max", faultBelow: 1 },
        ],
      },
    });
    const snap = feed(c, [
      [0, 170],
      [300, 90],
      [600, 170],
    ]);
    expect(snap.reps).toBe(1);
    expect(snap.lastRep?.flags).toEqual([]);
  });

  it("resets to a clean slate", () => {
    const c = counter();
    feed(c, [
      [0, 170],
      [300, 60],
      [600, 170],
    ]);
    c.reset();
    const snap = c.snapshot();
    expect(snap).toMatchObject({
      reps: 0,
      phase: "setup",
      lastRep: null,
      avgRomScore: null,
      flagSummary: [],
      visible: false,
      cue: NO_PERSON_CUE,
    });
    // Timestamps start over too.
    expect(feed(c, [[0, 170]]).phase).toBe("start");
  });

  it("ignores frames whose timestamp doesn't move forward", () => {
    const c = counter();
    feed(c, [
      [100, 170],
      [400, 90],
    ]);
    const snap = feed(c, [
      [400, 170],
      [300, 170],
    ]);
    expect(snap.phase).toBe("end");
    expect(snap.reps).toBe(0);
  });
});

describe("RepCounter visibility gating", () => {
  it("asks the user to step into view before anyone is detected", () => {
    const c = counter();
    expect(c.snapshot().cue).toBe(NO_PERSON_CUE);
    expect(c.update(0, null).cue).toBe(NO_PERSON_CUE);
    expect(c.update(33, []).visible).toBe(false);
  });

  it("pauses with a step-back cue instead of counting junk", () => {
    const c = counter();
    feed(c, [[0, 170]]);
    // Required landmark barely visible while the angle swings through a "rep".
    const hidden = feed(
      c,
      [
        [100, 90],
        [300, 90],
        [500, 170],
      ],
      0.2,
    );
    expect(hidden).toMatchObject({
      reps: 0,
      visible: false,
      currentAngle: null,
      cue: STEP_BACK_CUE,
    });
    const back = feed(c, [[600, 170]]);
    expect(back.visible).toBe(true);
    expect(back.currentAngle).toBe(170);
  });

  it("needs a landmark inside the frame, not just a confident one", () => {
    const c = counter();
    const snap = c.update(0, [{ x: 0.5, y: 1.2, z: 170, visibility: 0.99 }]);
    expect(snap.visible).toBe(false);
    expect(snap.cue).toBe(STEP_BACK_CUE);
  });

  it("uses hysteresis on visibility: 0.6 to enter, 0.4 to leave", () => {
    const c = counter();
    expect(feed(c, [[0, 170]], 0.5).visible).toBe(false);
    expect(feed(c, [[33, 170]], 0.65).visible).toBe(true);
    expect(feed(c, [[66, 170]], 0.5).visible).toBe(true);
    expect(feed(c, [[99, 170]], 0.45).visible).toBe(true);
    expect(feed(c, [[132, 170]], 0.35).visible).toBe(false);
    expect(feed(c, [[165, 170]], 0.5).visible).toBe(false);
  });

  it("keeps a rep through a brief occlusion", () => {
    const c = counter();
    const snap = feed(c, [
      [0, 170],
      [300, 90],
      [400, null],
      [600, null],
      [700, 170],
    ]);
    expect(snap.reps).toBe(1);
  });

  it("abandons a rep after a long absence", () => {
    const c = counter();
    const snap = feed(c, [
      [0, 170],
      [300, 90],
      [400, null],
      [1500, null],
      [1600, 170],
    ]);
    expect(snap.reps).toBe(0);
    expect(snap.phase).toBe("start");
  });

  it("sticks to the measured side until the other is clearly more visible", () => {
    const config: MovementConfig = {
      ...TEST_CONFIG,
      sides: "one",
      required: { left: [0], right: [1] },
      driver: (pose, side) => pose[side === "left" ? 0 : 1].z,
    };
    const c = counter({ config });
    const pose = (leftVis: number, rightVis: number): PoseLandmark[] => [
      { x: 0.5, y: 0.5, z: 170, visibility: leftVis },
      { x: 0.5, y: 0.5, z: 165, visibility: rightVis },
    ];
    expect(c.update(0, pose(0.9, 0.8)).side).toBe("left");
    expect(c.update(33, pose(0.85, 0.95)).side).toBe("left");
    const switched = c.update(66, pose(0.7, 0.95));
    expect(switched.side).toBe("right");
    expect(switched.currentAngle).toBe(165);
  });

  it("reports no side for front-on movements", () => {
    expect(counter().update(0, frame(170)).side).toBeNull();
  });
});

describe("RepCounter gates and smoothing", () => {
  it("pauses and drops the rep in progress when the position is wrong", () => {
    const config: MovementConfig = {
      ...TEST_CONFIG,
      positionCue: (pose) => (pose[0].x > 0.8 ? "Get into position" : null),
    };
    const c = counter({ config });
    feed(c, [
      [0, 170],
      [300, 90],
    ]);
    const off = c.update(400, frame(90, 1, 0.9));
    expect(off.cue).toBe("Get into position");
    expect(off.phase).toBe("setup");
    const snap = c.update(700, frame(170));
    expect(snap.reps).toBe(0);
  });

  it("only enters the end zone when the movement's extra condition holds", () => {
    const config: MovementConfig = {
      ...TEST_CONFIG,
      endRequires: (pose) => pose[0].x < 0.6,
    };
    const c = counter({ config });
    c.update(0, frame(170));
    expect(c.update(300, frame(90, 1, 0.7)).phase).toBe("start");
    expect(c.update(400, frame(90, 1, 0.5)).phase).toBe("end");
  });

  it("smooths a one-frame glitch so it can't reach the end zone", () => {
    const c = counter({ smoothingMs: 60 });
    feed(c, timed([170, 170, 170, 170]));
    const glitch = c.update(132, frame(100));
    expect(glitch.phase).toBe("start");
    // alpha = 1 − e^(−33/60) ≈ 0.42 → 170 − 0.42 × 70 ≈ 140
    expect(glitch.currentAngle).toBeCloseTo(140.4, 0);
    const snap = feed(c, timed([170, 170, 170, 170, 170], 165));
    expect(snap.reps).toBe(0);
  });

  it("restarts smoothing when a person re-enters after a gap", () => {
    const c = counter({ smoothingMs: 60 });
    feed(c, timed([170, 170, 170]));
    c.update(100, null);
    const snap = c.update(1000, frame(130));
    expect(snap.currentAngle).toBe(130);
  });
});

/** Runs a sequence of poses through a real-movement counter at ~30 fps. */
function run(c: RepCounter, poses: Pose[], t0 = 0, dt = 33) {
  let snap = c.snapshot();
  poses.forEach((pose, i) => {
    snap = c.update(t0 + i * dt, pose);
  });
  return { snap, end: t0 + poses.length * dt };
}

/** One rep: `from` → `to` with a short hold at the turnaround → `from`. */
function repAngles(from: number, to: number, steps = 12, hold = 5): number[] {
  return [
    ...path([from, to], steps),
    ...Array<number>(hold).fill(to),
    ...path([to, from], steps).slice(1),
    ...Array<number>(hold).fill(from),
  ];
}

describe("real movements on synthetic poses", () => {
  it("squat: counts full reps cleanly and flags a shallow one", () => {
    const c = new RepCounter({ movement: "squat" });
    const full = [...repAngles(175, 85), ...repAngles(175, 85), ...repAngles(175, 85)];
    const first = run(c, full.map(squatPose));
    let snap = first.snap;
    const end = first.end;
    expect(snap.reps).toBe(3);
    expect(snap.lastRep?.flags).toEqual([]);
    expect(snap.avgRomScore).toBeGreaterThanOrEqual(90);
    expect(snap.side).toBe("left");

    ({ snap } = run(c, repAngles(175, 112).map(squatPose), end));
    expect(snap.reps).toBe(4);
    expect(snap.lastRep?.flags).toEqual(["Go deeper"]);
    expect(snap.cue).toBe("Go deeper");
    expect(snap.lastRep?.romScore).toBeLessThan(70);
  });

  it("squat: a half-hearted dip isn't counted", () => {
    const c = new RepCounter({ movement: "squat" });
    const { snap } = run(c, repAngles(175, 135).map(squatPose));
    expect(snap.reps).toBe(0);
    expect(snap.cue).toBe("Not counted — squat deeper");
  });

  it("squat: measures true angles on a widescreen frame given the aspect ratio", () => {
    const aspect = 16 / 9;
    const squeeze = (pose: PoseLandmark[]) => pose.map((l) => ({ ...l, x: l.x / aspect }));
    const corrected = new RepCounter({ movement: "squat", aspectRatio: aspect });
    expect(corrected.update(0, squeeze(squatPose(100))).currentAngle).toBeCloseTo(100);
    const naive = new RepCounter({ movement: "squat" });
    expect(naive.update(0, squeeze(squatPose(100))).currentAngle).not.toBeCloseTo(100, 0);
  });

  it("push-up: counts, flags sagging hips, and waits for a plank", () => {
    const c = new RepCounter({ movement: "pushup" });
    let { snap, end } = run(
      c,
      repAngles(170, 85).map((a) => pushupPose(a)),
    );
    expect(snap.reps).toBe(1);
    expect(snap.lastRep?.flags).toEqual([]);

    ({ snap, end } = run(
      c,
      repAngles(170, 85).map((a) => pushupPose(a, { sag: 0.1 })),
      end,
    ));
    expect(snap.reps).toBe(2);
    expect(snap.lastRep?.flags).toEqual(["Hips sagging — brace your core"]);

    ({ snap } = run(
      c,
      repAngles(170, 85).map((a) => pushupPose(a, { standing: true })),
      end,
    ));
    expect(snap.reps).toBe(2);
    expect(snap.cue).toBe("Get into a plank, side-on to the camera");
  });

  it("curl: lifting is the concentric half; a swinging elbow is flagged", () => {
    const c = new RepCounter({ movement: "curl" });
    const slowUpFastDown = [
      ...path([165, 45], 20),
      ...path([45, 165], 8).slice(1),
      ...Array<number>(5).fill(165),
    ];
    const first = run(
      c,
      slowUpFastDown.map((a) => curlPose(a)),
    );
    let snap = first.snap;
    const end = first.end;
    expect(snap.reps).toBe(1);
    expect(snap.lastRep?.tempoMs.concentric).toBeGreaterThan(snap.lastRep!.tempoMs.eccentric);
    expect(snap.lastRep?.flags).toEqual([]);

    const drifting = repAngles(165, 45).map((a) => curlPose(a, { drift: a < 90 ? 45 : 0 }));
    ({ snap } = run(c, drifting, end));
    expect(snap.reps).toBe(2);
    expect(snap.lastRep?.flags).toContain("Keep your elbow pinned to your side");
  });

  it("overhead press: arms hanging isn't a lockout; partial lockout is flagged", () => {
    const c = new RepCounter({ movement: "overhead_press" });
    let { snap, end } = run(
      c,
      Array.from({ length: 10 }, () => pressPose(0, { armsDown: true })),
    );
    expect(snap.phase).toBe("setup");
    expect(snap.cue).toBe("Rack the weight at shoulder height to start");

    ({ snap, end } = run(
      c,
      repAngles(80, 175).map((a) => pressPose(a)),
      end,
    ));
    expect(snap.reps).toBe(1);
    expect(snap.lastRep?.flags).toEqual([]);

    ({ snap } = run(
      c,
      repAngles(80, 150).map((a) => pressPose(a)),
      end,
    ));
    expect(snap.reps).toBe(2);
    expect(snap.lastRep?.flags).toEqual(["Lock out fully overhead"]);
  });

  it("lunge: counts the front knee and flags a shallow lunge", () => {
    const c = new RepCounter({ movement: "lunge" });
    const first = run(
      c,
      repAngles(175, 92).map((a) => lungePose(a, a + 10)),
    );
    let snap = first.snap;
    const end = first.end;
    expect(snap.reps).toBe(1);
    expect(snap.lastRep?.flags).toEqual([]);
    ({ snap } = run(
      c,
      repAngles(175, 116).map((a) => lungePose(a, a + 10)),
      end,
    ));
    expect(snap.reps).toBe(2);
    expect(snap.lastRep?.flags).toEqual(["Sink lower — front thigh toward parallel"]);
  });

  it("hinge: counts and flags a hinge that turned into a squat", () => {
    const c = new RepCounter({ movement: "hinge" });
    const first = run(
      c,
      repAngles(175, 95).map((a) => hingePose(a)),
    );
    let snap = first.snap;
    const end = first.end;
    expect(snap.reps).toBe(1);
    expect(snap.lastRep?.flags).toEqual([]);
    const squatty = repAngles(175, 95).map((a) => hingePose(a, a < 130 ? 80 : 160));
    ({ snap } = run(c, squatty, end));
    expect(snap.reps).toBe(2);
    expect(snap.lastRep?.flags).toEqual(["Push your hips back — don't squat it"]);
  });

  it("pull-up: needs the chin over the bar to pass the form check", () => {
    const c = new RepCounter({ movement: "pullup" });
    const over = repAngles(170, 60).map((a) => pullupPose(a, { chinOverBar: a < 75 }));
    let { snap, end } = run(c, over);
    expect(snap.reps).toBe(1);
    expect(snap.lastRep?.flags).toEqual([]);

    ({ snap, end } = run(
      c,
      repAngles(170, 60).map((a) => pullupPose(a)),
      end,
    ));
    expect(snap.reps).toBe(2);
    expect(snap.lastRep?.flags).toEqual(["Pull until your chin clears the bar"]);

    const standing = Array.from({ length: 10 }, () => pullupPose(170, { handsDown: true }));
    ({ snap } = run(c, standing, end));
    expect(snap.cue).toBe("Hang from the bar — hands above your head");
  });

  it("lateral raise: flags raising too high and shrugging", () => {
    const c = new RepCounter({ movement: "lateral_raise" });
    let { snap, end } = run(
      c,
      repAngles(15, 90).map((a) => frontArmsPose(a)),
    );
    expect(snap.reps).toBe(1);
    expect(snap.lastRep?.flags).toEqual([]);
    expect(snap.lastRep?.romScore).toBeGreaterThanOrEqual(95);

    ({ snap, end } = run(
      c,
      repAngles(15, 125).map((a) => frontArmsPose(a)),
      end,
    ));
    expect(snap.lastRep?.flags).toEqual(["Stop at shoulder height"]);

    const shrug = repAngles(15, 90).map((a) => frontArmsPose(a, { shrug: a > 60 ? 0.05 : 0 }));
    ({ snap } = run(c, shrug, end));
    expect(snap.reps).toBe(3);
    expect(snap.lastRep?.flags).toEqual(["Keep your shoulders down — don't shrug"]);
  });

  it("jumping jack: keeps up with brisk reps and wants the feet out", () => {
    const c = new RepCounter({ movement: "jumping_jack" });
    // ~2 jacks per second: 6 frames up, 1 at the top, 6 down, 2 at the bottom.
    const jack = (feetOut: boolean) =>
      [...path([20, 160], 6), 160, ...path([160, 20], 6).slice(1), 20, 20].map((a) =>
        frontArmsPose(a, { feet: feetOut && a > 90 ? 0.3 : 0.1 }),
      );
    const first = run(c, [...jack(true), ...jack(true), ...jack(true), ...jack(true)]);
    let snap = first.snap;
    const end = first.end;
    expect(snap.reps).toBe(4);
    expect(snap.lastRep?.flags).toEqual([]);
    ({ snap } = run(c, jack(false), end));
    expect(snap.reps).toBe(5);
    expect(snap.lastRep?.flags).toEqual(["Jump your feet wider"]);
  });
});
