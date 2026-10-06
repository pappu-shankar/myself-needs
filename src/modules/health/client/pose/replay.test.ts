// @vitest-environment node
import { describe, expect, it } from "vitest";
import { getMovementConfig } from "./movements";
import {
  PoseTimeline,
  frameAt,
  framePose,
  keyJoints,
  pickRecordingMimeType,
  recordingExtension,
  replayFileName,
} from "./replay";
import { squatPose } from "./test-poses";

describe("pickRecordingMimeType", () => {
  it("prefers VP9 WebM, then plain WebM, then MP4 (Safari)", () => {
    expect(pickRecordingMimeType(() => true)).toBe("video/webm;codecs=vp9");
    expect(pickRecordingMimeType((t) => t === "video/webm")).toBe("video/webm");
    expect(pickRecordingMimeType((t) => t.startsWith("video/mp4"))).toBe("video/mp4;codecs=avc1");
  });

  it("returns null when nothing is supported, even if the check throws", () => {
    expect(pickRecordingMimeType(() => false)).toBeNull();
    expect(
      pickRecordingMimeType(() => {
        throw new Error("nope");
      }),
    ).toBeNull();
  });
});

describe("replay file name", () => {
  it("uses local date and time and the container's extension", () => {
    const at = new Date(2026, 9, 5, 7, 4, 59);
    expect(replayFileName(at, "video/webm;codecs=vp9")).toBe("gym-set-2026-10-05-0704.webm");
    expect(replayFileName(at, "video/mp4")).toBe("gym-set-2026-10-05-0704.mp4");
    expect(recordingExtension("VIDEO/MP4;codecs=avc1")).toBe("mp4");
  });
});

describe("PoseTimeline", () => {
  const config = getMovementConfig("squat");
  const joints = keyJoints(config);

  it("keeps only the movement's key joints, for both sides", () => {
    const left = config.overlay("left");
    const right = config.overlay("right");
    for (const i of [...left.points, ...right.points, ...left.focus]) {
      expect(joints).toContain(i);
    }
    expect(joints.length).toBeLessThan(33);
  });

  it("records frames that round-trip into a drawable pose", () => {
    const timeline = new PoseTimeline(joints);
    const pose = squatPose(120);
    timeline.add(0, pose, "left");
    timeline.add(33, null, "left");
    timeline.add(20, pose, "left"); // out of order — dropped
    expect(timeline.frames.map((f) => f.t)).toEqual([0, 33]);

    const rebuilt = framePose(timeline.frames[0]);
    expect(rebuilt).toHaveLength(33);
    for (const i of joints) {
      expect(rebuilt?.[i].x).toBeCloseTo(pose[i].x, 3);
      expect(rebuilt?.[i].y).toBeCloseTo(pose[i].y, 3);
    }
    const other = [...Array(33).keys()].find((i) => !joints.includes(i)) ?? 0;
    expect(rebuilt?.[other].visibility).toBe(0);
    expect(framePose(timeline.frames[1])).toBeNull();
  });
});

describe("frameAt", () => {
  const frames = [0, 33, 66, 100, 1000].map((t) => ({
    t,
    side: "left" as const,
    points: [0, t, 0, 1],
  }));

  it("finds the nearest frame", () => {
    expect(frameAt(frames, 0)?.t).toBe(0);
    expect(frameAt(frames, 40)?.t).toBe(33);
    expect(frameAt(frames, 60)?.t).toBe(66);
    expect(frameAt(frames, 800)?.t).toBe(1000);
    expect(frameAt(frames, 10_000, 1e9)?.t).toBe(1000);
  });

  it("returns nothing in a gap or before / after the recording", () => {
    expect(frameAt(frames, 400)).toBeNull();
    expect(frameAt(frames, 1300)).toBeNull();
    expect(frameAt([], 0)).toBeNull();
    expect(frameAt(frames, Number.NaN)).toBeNull();
  });
});
