// @vitest-environment node
import { describe, expect, it } from "vitest";
import { CAMERA_MOVEMENTS } from "../../gym-types";
import { LM } from "./geometry";
import {
  MOVEMENT_CONFIGS,
  getMovementConfig,
  movementDirection,
  requiredLandmarks,
  romScore,
  type MovementConfig,
} from "./movements";
import {
  curlPose,
  frontArmsPose,
  hingePose,
  lungePose,
  pressPose,
  pullupPose,
  pushupPose,
  squatPose,
} from "./test-poses";

function check(config: MovementConfig, id: string) {
  const found = config.formChecks.find((c) => c.id === id);
  if (!found) throw new Error(`no check ${id}`);
  return found;
}

describe("movement configs", () => {
  it("exist for every camera movement", () => {
    for (const movement of CAMERA_MOVEMENTS) {
      expect(MOVEMENT_CONFIGS[movement].movement).toBe(movement);
      expect(getMovementConfig(movement)).toBe(MOVEMENT_CONFIGS[movement]);
    }
  });

  it.each(CAMERA_MOVEMENTS)("%s has consistent thresholds", (movement) => {
    const c = MOVEMENT_CONFIGS[movement];
    // Start ref → startAt → endAt → fullRange all run the same way, with a
    // real hysteresis band (≥ 25°) between the two thresholds.
    const sign = movementDirection(c) === "closing" ? -1 : 1;
    expect(sign * (c.startAt - c.startRef)).toBeGreaterThan(0);
    expect(sign * (c.endAt - c.startAt)).toBeGreaterThanOrEqual(25);
    expect(sign * (c.fullRange - c.endAt)).toBeGreaterThan(0);
    // A counted rep always scores something but the bare minimum isn't "full".
    expect(romScore(c, c.endAt)).toBeGreaterThan(0);
    expect(romScore(c, c.endAt)).toBeLessThan(100);
  });

  it.each(CAMERA_MOVEMENTS)("%s overlay only draws listed joints", (movement) => {
    const c = MOVEMENT_CONFIGS[movement];
    for (const side of ["left", "right"] as const) {
      const overlay = c.overlay(side);
      const points = new Set(overlay.points);
      for (const [a, b] of overlay.segments) {
        expect(points.has(a) && points.has(b)).toBe(true);
      }
      for (const f of overlay.focus) expect(points.has(f)).toBe(true);
    }
  });

  it.each(CAMERA_MOVEMENTS)("%s requires mirrored landmarks on each side", (movement) => {
    const { required } = MOVEMENT_CONFIGS[movement];
    expect(required.left.length).toBeGreaterThan(0);
    expect(required.left).toHaveLength(required.right.length);
  });

  it("uses side views for sagittal lifts and front views for frontal ones", () => {
    const views = Object.fromEntries(CAMERA_MOVEMENTS.map((m) => [m, MOVEMENT_CONFIGS[m].view]));
    expect(views).toEqual({
      squat: "side",
      pushup: "side",
      curl: "side",
      overhead_press: "front",
      lunge: "side",
      hinge: "side",
      pullup: "front",
      lateral_raise: "front",
      jumping_jack: "front",
    });
  });

  it("omits a back-rounding check for the hinge (not visible to BlazePose)", () => {
    const ids = MOVEMENT_CONFIGS.hinge.formChecks.map((c) => c.id);
    expect(ids.some((id) => /round/.test(id))).toBe(false);
  });
});

describe("requiredLandmarks", () => {
  it("lists one side for side-on movements and both for front-on", () => {
    expect(requiredLandmarks(MOVEMENT_CONFIGS.squat, "right")).toEqual([
      LM.rightHip,
      LM.rightKnee,
      LM.rightAnkle,
    ]);
    expect(requiredLandmarks(MOVEMENT_CONFIGS.overhead_press, "left")).toHaveLength(6);
  });
});

describe("romScore", () => {
  const squat = MOVEMENT_CONFIGS.squat; // 175 → 80
  const press = MOVEMENT_CONFIGS.overhead_press; // 80 → 170

  it("maps the turnaround onto 0–100 between start and full range", () => {
    expect(romScore(squat, 175)).toBe(0);
    expect(romScore(squat, 127.5)).toBe(50);
    expect(romScore(squat, 80)).toBe(100);
    expect(romScore(squat, 60)).toBe(100);
    expect(romScore(squat, 180)).toBe(0);
  });

  it("works the same for movements whose angle opens", () => {
    expect(romScore(press, 80)).toBe(0);
    expect(romScore(press, 125)).toBe(50);
    expect(romScore(press, 175)).toBe(100);
  });
});

describe("drivers on synthetic poses", () => {
  it("squat: knee angle on the visible side", () => {
    const c = MOVEMENT_CONFIGS.squat;
    expect(c.driver(squatPose(175), "left")).toBeCloseTo(175);
    expect(c.driver(squatPose(95), "left")).toBeCloseTo(95);
    // The occluded far side isn't trusted.
    expect(c.driver(squatPose(95), "right")).toBeNull();
  });

  it("push-up, curl and hinge measure their own joint", () => {
    expect(MOVEMENT_CONFIGS.pushup.driver(pushupPose(90), "left")).toBeCloseTo(90);
    expect(MOVEMENT_CONFIGS.curl.driver(curlPose(45), "left")).toBeCloseTo(45);
    expect(MOVEMENT_CONFIGS.hinge.driver(hingePose(100), "left")).toBeCloseTo(100);
  });

  it("front-on movements average both arms", () => {
    expect(MOVEMENT_CONFIGS.overhead_press.driver(pressPose(150), "left")).toBeCloseTo(150);
    expect(MOVEMENT_CONFIGS.pullup.driver(pullupPose(80), "left")).toBeCloseTo(80);
    expect(MOVEMENT_CONFIGS.lateral_raise.driver(frontArmsPose(75), "left")).toBeCloseTo(75);
    expect(MOVEMENT_CONFIGS.jumping_jack.driver(frontArmsPose(150), "left")).toBeCloseTo(150);
  });

  it("lunge: measures the FRONT knee, whichever way the person faces", () => {
    const c = MOVEMENT_CONFIGS.lunge;
    // Back knee more bent than the front one: the min would be wrong.
    expect(c.driver(lungePose(110, 90, 1), "left")).toBeCloseTo(110);
    expect(c.driver(lungePose(110, 90, -1), "left")).toBeCloseTo(110);
  });
});

describe("gates", () => {
  it("press: the end zone needs the wrists above the shoulders", () => {
    const endRequires = MOVEMENT_CONFIGS.overhead_press.endRequires!;
    expect(endRequires(pressPose(175), "left")).toBe(true);
    // Arms hanging read ~180° at the elbow too — but that's not a lockout.
    expect(
      MOVEMENT_CONFIGS.overhead_press.driver(pressPose(0, { armsDown: true }), "left"),
    ).toBeCloseTo(180);
    expect(endRequires(pressPose(0, { armsDown: true }), "left")).toBe(false);
  });

  it("push-up: asks for a plank when the torso is upright", () => {
    const cue = MOVEMENT_CONFIGS.pushup.positionCue!;
    expect(cue(pushupPose(170), "left")).toBeNull();
    expect(cue(pushupPose(90), "left")).toBeNull();
    expect(cue(pushupPose(170, { standing: true }), "left")).toMatch(/plank/);
  });

  it("pull-up: asks for a hang when the hands are below the shoulders", () => {
    const cue = MOVEMENT_CONFIGS.pullup.positionCue!;
    expect(cue(pullupPose(170), "left")).toBeNull();
    expect(cue(pullupPose(170, { handsDown: true }), "left")).toMatch(/Hang/);
  });
});

describe("form check measurements", () => {
  it("squat depth: hip elevation above the knee", () => {
    const depth = check(MOVEMENT_CONFIGS.squat, "squat_depth");
    expect(depth.measure(squatPose(100), "left")).toBeCloseTo(10);
    expect(depth.measure(squatPose(80), "left")).toBeCloseTo(-10);
    expect(depth.faultAbove).toBe(12);
  });

  it("push-up: hip sag positive, pike negative", () => {
    const sag = check(MOVEMENT_CONFIGS.pushup, "pushup_hip_sag");
    expect(sag.measure(pushupPose(170), "left")).toBeCloseTo(0);
    expect(sag.measure(pushupPose(170, { sag: 0.1 }), "left")).toBeGreaterThan(20);
    expect(sag.measure(pushupPose(170, { sag: -0.1 }), "left")).toBeLessThan(-20);
  });

  it("curl: elbow drift and torso lean", () => {
    const drift = check(MOVEMENT_CONFIGS.curl, "curl_elbow_drift");
    const swing = check(MOVEMENT_CONFIGS.curl, "curl_torso_swing");
    expect(drift.measure(curlPose(60), "left")).toBeCloseTo(0);
    expect(drift.measure(curlPose(60, { drift: 45 }), "left")).toBeCloseTo(45);
    expect(swing.measure(curlPose(60, { lean: 20 }), "left")).toBeCloseTo(20);
  });

  it("pull-up: nose height over the hands in torso lengths", () => {
    const chin = check(MOVEMENT_CONFIGS.pullup, "pullup_chin");
    expect(chin.measure(pullupPose(60, { chinOverBar: true }), "left")).toBeCloseTo(0.2);
    expect(chin.measure(pullupPose(170), "left")).toBeLessThan(-0.5);
  });

  it("lateral raise: shrug shrinks the ear–shoulder gap", () => {
    const shrug = check(MOVEMENT_CONFIGS.lateral_raise, "raise_shrug");
    expect(shrug.measure(frontArmsPose(20), "left")).toBeCloseTo(0.5);
    expect(shrug.measure(frontArmsPose(20, { shrug: 0.04 }), "left")).toBeCloseTo(0.3);
  });

  it("jumping jack: ankle spread in hip widths", () => {
    const feet = check(MOVEMENT_CONFIGS.jumping_jack, "jack_feet");
    expect(feet.measure(frontArmsPose(20), "left")).toBeCloseTo(1);
    expect(feet.measure(frontArmsPose(150, { feet: 0.3 }), "left")).toBeCloseTo(3);
  });

  it("hinge: knee angle to catch a squatted hinge", () => {
    const knees = check(MOVEMENT_CONFIGS.hinge, "hinge_knee_dominant");
    expect(knees.measure(hingePose(100, 150), "left")).toBeCloseTo(150);
    expect(knees.measure(hingePose(100, 80), "left")).toBeCloseTo(80);
  });

  it("returns null instead of guessing when landmarks are hidden", () => {
    const pose = squatPose(100).map((l) => ({ ...l, visibility: 0.1 }));
    expect(check(MOVEMENT_CONFIGS.squat, "squat_depth").measure(pose, "left")).toBeNull();
    expect(MOVEMENT_CONFIGS.squat.driver(pose, "left")).toBeNull();
  });
});
