import { describe, expect, it } from "vitest";
import { LM, type PoseLandmark } from "@/modules/health/client/pose/geometry";
import {
  alignTransform,
  announcedCountdown,
  daysApart,
  photoDate,
  checkPhotoPose,
  defaultComparePair,
  fitWithin,
  fromLandmarkTuples,
  ghostSource,
  toLandmarkTuples,
  transformCss,
  type LandmarkTuple,
  type PhotoGeometry,
} from "./photo-helpers";

type Pt = { x: number; y: number; v?: number };

/** 33 landmarks from a few named points; the rest hidden mid-frame. */
function pose(points: Partial<Record<number, Pt>>): PoseLandmark[] {
  return Array.from({ length: 33 }, (_, i) => {
    const p = points[i];
    return p
      ? { x: p.x, y: p.y, z: 0, visibility: p.v ?? 0.95 }
      : { x: 0.5, y: 0.5, z: 0, visibility: 0 };
  });
}

/** Standing figure in a square frame. `half` = half shoulder width; `facing`
 * flips which side the person's left shoulder appears on. */
function standing({
  half = 0.12,
  facing = true,
  dy = 0,
  headY = 0.1,
  footY = 0.9,
}: { half?: number; facing?: boolean; dy?: number; headY?: number; footY?: number } = {}) {
  const s = facing ? 1 : -1;
  return pose({
    [LM.nose]: { x: 0.5, y: headY },
    [LM.leftShoulder]: { x: 0.5 + s * half, y: 0.25 - dy },
    [LM.rightShoulder]: { x: 0.5 - s * half, y: 0.25 + dy },
    [LM.leftHip]: { x: 0.5 + s * half * 0.7, y: 0.55 },
    [LM.rightHip]: { x: 0.5 - s * half * 0.7, y: 0.55 },
    [LM.leftKnee]: { x: 0.55, y: 0.72 },
    [LM.rightKnee]: { x: 0.45, y: 0.72 },
    [LM.leftAnkle]: { x: 0.55, y: footY },
    [LM.rightAnkle]: { x: 0.45, y: footY },
  });
}

describe("fitWithin", () => {
  it("downscales the long side to 1080 and keeps the aspect", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1080, height: 810 });
    expect(fitWithin(720, 1280)).toEqual({ width: 608, height: 1080 });
  });
  it("never upscales", () => {
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480 });
  });
  it("rejects images too small or empty", () => {
    expect(fitWithin(50, 400)).toBeNull();
    expect(fitWithin(0, 100)).toBeNull();
    expect(fitWithin(10_000, 200)).toBeNull(); // 1080 × 22 after scaling
  });
});

describe("landmark tuples", () => {
  it("round-trips and rounds", () => {
    const p = standing();
    p[0] = { x: 0.123456789, y: 0.5, z: 0.2, visibility: 0.987654 };
    const tuples = toLandmarkTuples(p)!;
    expect(tuples).toHaveLength(33);
    expect(tuples[0]).toEqual([0.1235, 0.5, 0.9877]);
    expect(fromLandmarkTuples(tuples)![0]).toEqual({ x: 0.1235, y: 0.5, z: 0, visibility: 0.9877 });
  });
  it("is null without a full pose", () => {
    expect(toLandmarkTuples(null)).toBeNull();
    expect(toLandmarkTuples(standing().slice(0, 10))).toBeNull();
    expect(fromLandmarkTuples(null)).toBeNull();
  });
});

describe("checkPhotoPose", () => {
  it("asks you to step in when no one is detected", () => {
    expect(checkPhotoPose(null, "front", 1)).toEqual({
      ready: false,
      cues: ["Step into view — no one detected yet."],
    });
  });
  it("accepts a square-on, level, full-body front pose", () => {
    expect(checkPhotoPose(standing(), "front", 1)).toEqual({ ready: true, cues: [] });
  });
  it("flags a cut-off head or feet", () => {
    expect(checkPhotoPose(standing({ headY: -0.1 }), "front", 1).cues[0]).toMatch(
      /head is cut off/,
    );
    expect(checkPhotoPose(standing({ footY: 1.1 }), "front", 1).cues[0]).toMatch(
      /feet are cut off/,
    );
  });
  it("wants a back pose to have the left shoulder on the image's left", () => {
    expect(checkPhotoPose(standing(), "back", 1).cues).toContain("Turn your back to the camera.");
    expect(checkPhotoPose(standing({ facing: false }), "back", 1).ready).toBe(true);
    expect(checkPhotoPose(standing({ facing: false }), "front", 1).cues).toContain(
      "Turn to face the camera.",
    );
  });
  it("wants narrow shoulders for side and wide for front", () => {
    expect(checkPhotoPose(standing({ half: 0.02 }), "side", 1).ready).toBe(true);
    expect(checkPhotoPose(standing(), "side", 1).cues).toContain("Turn side-on to the camera.");
    expect(checkPhotoPose(standing({ half: 0.02 }), "front", 1).cues).toContain(
      "Turn to face the camera.",
    );
  });
  it("flags tilted shoulders", () => {
    expect(checkPhotoPose(standing({ dy: 0.04 }), "front", 1).cues).toContain(
      "Level your shoulders.",
    );
  });
  it("corrects for aspect ratio (normalized x is squeezed in a 16:9 frame)", () => {
    expect(checkPhotoPose(standing({ half: 0.06 }), "front", 1).ready).toBe(false);
    expect(checkPhotoPose(standing({ half: 0.06 }), "front", 16 / 9).ready).toBe(true);
  });
  it("asks you to stand when lying down", () => {
    const lying = pose({
      [LM.nose]: { x: 0.1, y: 0.5 },
      [LM.leftShoulder]: { x: 0.25, y: 0.48 },
      [LM.rightShoulder]: { x: 0.25, y: 0.52 },
      [LM.leftHip]: { x: 0.55, y: 0.48 },
      [LM.rightHip]: { x: 0.55, y: 0.52 },
      [LM.leftAnkle]: { x: 0.9, y: 0.5 },
    });
    expect(checkPhotoPose(lying, "front", 1).cues).toContain("Stand up straight, arms relaxed.");
  });
});

function tuples(points: Partial<Record<number, [number, number]>>): LandmarkTuple[] {
  return Array.from({ length: 33 }, (_, i): LandmarkTuple => {
    const p = points[i];
    return p ? [p[0], p[1], 0.9] : [0.5, 0.5, 0];
  });
}

function torso(sx: number, sy: number, hx: number, hy: number): LandmarkTuple[] {
  return tuples({
    [LM.leftShoulder]: [sx + 0.1, sy],
    [LM.rightShoulder]: [sx - 0.1, sy],
    [LM.leftHip]: [hx + 0.08, hy],
    [LM.rightHip]: [hx - 0.08, hy],
  });
}

/** Where the transform puts a normalized point of `other`, in base's layout units. */
function apply(t: ReturnType<typeof alignTransform>, other: PhotoGeometry, x: number, y: number) {
  const r = other.height / other.width;
  const tx = t!.translateXPct / 100;
  const ty = (t!.translateYPct / 100) * r;
  return { x: t!.scale * x + tx, y: t!.scale * y * r + ty };
}

describe("alignTransform", () => {
  it("is the identity for identical photos", () => {
    const a: PhotoGeometry = { width: 600, height: 1000, landmarks: torso(0.5, 0.3, 0.5, 0.6) };
    const t = alignTransform(a, a)!;
    expect(t.scale).toBeCloseTo(1);
    expect(t.translateXPct).toBeCloseTo(0);
    expect(t.translateYPct).toBeCloseTo(0);
    expect(transformCss(t)).toBe("translate(0%, 0%) scale(1)");
  });

  it("maps the other photo's shoulders and hips onto the base's", () => {
    const base: PhotoGeometry = { width: 600, height: 1000, landmarks: torso(0.5, 0.3, 0.5, 0.6) };
    // Further away (smaller torso), off to the left, in a different aspect.
    const other: PhotoGeometry = {
      width: 800,
      height: 1000,
      landmarks: torso(0.3, 0.4, 0.3, 0.55),
    };
    const t = alignTransform(base, other)!;
    const rBase = base.height / base.width;
    const shoulder = apply(t, other, 0.3, 0.4);
    const hip = apply(t, other, 0.3, 0.55);
    expect(shoulder.x).toBeCloseTo(0.5);
    expect(shoulder.y).toBeCloseTo(0.3 * rBase);
    expect(hip.x).toBeCloseTo(0.5);
    expect(hip.y).toBeCloseTo(0.6 * rBase);
  });

  it("returns null without usable landmarks", () => {
    const a: PhotoGeometry = { width: 600, height: 1000, landmarks: torso(0.5, 0.3, 0.5, 0.6) };
    expect(alignTransform(a, { ...a, landmarks: null })).toBeNull();
    expect(alignTransform({ ...a, landmarks: tuples({}) }, a)).toBeNull();
  });
});

describe("compare and ghost picks", () => {
  const photos = [
    { id: 3, date: "2026-09-01", landmarks: null },
    { id: 1, date: "2026-01-10", landmarks: [] },
    { id: 7, date: "2026-10-01", landmarks: null },
    { id: 5, date: "2026-06-01", landmarks: [] },
  ];
  it("defaults to oldest vs newest", () => {
    expect(defaultComparePair(photos)).toEqual([1, 7]);
    expect(defaultComparePair(photos.slice(0, 1))).toBeNull();
  });
  it("ghosts the newest photo that has landmarks", () => {
    expect(ghostSource(photos)?.id).toBe(5);
    expect(ghostSource([photos[0]])).toBeNull();
  });
});

describe("announcedCountdown", () => {
  it("only changes on 10, 5, 3, 2, 1", () => {
    expect([10, 9, 8, 6, 5, 4, 3, 2, 1].map(announcedCountdown)).toEqual([
      10, 10, 10, 10, 5, 5, 3, 2, 1,
    ]);
  });
});

describe("dates", () => {
  it("formats dates and gaps", () => {
    expect(photoDate("2026-10-04")).toBe("4 Oct 2026");
    expect(daysApart("2026-10-04", "2026-07-06")).toBe("90 days apart");
    expect(daysApart("2026-10-04", "2026-10-05")).toBe("1 day apart");
    expect(daysApart("2026-10-04", "2026-10-04")).toBe("Same day");
  });
});
