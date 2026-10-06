import { toIsoDate } from "@/lib/dates";
import { visibilityOf, type Pose, type PoseLandmark, type Side } from "./geometry";
import type { MovementConfig } from "./movements";

/**
 * Set replay helpers: which video format to record, what to call the
 * download, and a lightweight landmark timeline so the replay can redraw the
 * skeleton over the recorded video. Pure — MediaRecorder and the player live
 * in the panel; everything decidable without a browser is here and tested.
 *
 * The timeline keeps only the movement's key joints (the ones the overlay
 * draws), timestamped relative to the recording's start, so a capped
 * 3-minute set at 30 fps stays at a few hundred kilobytes.
 */

/** Recording stops by itself after this long (the counter keeps counting). */
export const MAX_RECORDING_MS = 3 * 60 * 1000;

/** WebM (Chrome, Firefox, Edge) first, VP9 preferred for size; MP4 for Safari. */
const MIME_CANDIDATES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4;codecs=avc1",
  "video/mp4",
] as const;

/** The first container/codec the browser's MediaRecorder supports, or null
 * when it supports none of them (then recording is skipped). */
export function pickRecordingMimeType(isTypeSupported: (type: string) => boolean): string | null {
  for (const type of MIME_CANDIDATES) {
    try {
      if (isTypeSupported(type)) return type;
    } catch {
      // A browser that throws on an unknown type just doesn't support it.
    }
  }
  return null;
}

export function recordingExtension(mimeType: string): "mp4" | "webm" {
  return mimeType.toLowerCase().includes("mp4") ? "mp4" : "webm";
}

/** `gym-set-YYYY-MM-DD-HHMM.webm`, in local time. */
export function replayFileName(startedAt: Date, mimeType: string): string {
  const hh = String(startedAt.getHours()).padStart(2, "0");
  const mm = String(startedAt.getMinutes()).padStart(2, "0");
  return `gym-set-${toIsoDate(startedAt)}-${hh}${mm}.${recordingExtension(mimeType)}`;
}

/** Every landmark the movement's overlay draws, for either side. */
export function keyJoints(config: MovementConfig): number[] {
  const joints = new Set<number>();
  for (const side of ["left", "right"] as const) {
    const overlay = config.overlay(side);
    overlay.points.forEach((i) => joints.add(i));
    overlay.focus.forEach((i) => joints.add(i));
    overlay.segments.forEach(([a, b]) => {
      joints.add(a);
      joints.add(b);
    });
  }
  return [...joints].sort((a, b) => a - b);
}

export interface TimelineFrame {
  /** ms since the recording started. */
  t: number;
  /** The side the overlay was drawn for. */
  side: Side;
  /** Key joints only, flattened: [index, x, y, visibility] per joint. Null
   * when no one was measured on this frame (the overlay is blank). */
  points: number[] | null;
}

export class PoseTimeline {
  readonly frames: TimelineFrame[] = [];

  constructor(private readonly joints: readonly number[]) {}

  /** Appends a frame. Out-of-order timestamps are dropped. */
  add(t: number, pose: Pose | null, side: Side): void {
    const last = this.frames.at(-1);
    if (last && t <= last.t) return;
    if (!pose) {
      this.frames.push({ t, side, points: null });
      return;
    }
    const points: number[] = [];
    for (const i of this.joints) {
      const p = pose[i];
      if (!p) continue;
      points.push(i, round4(p.x), round4(p.y), round4(visibilityOf(p)));
    }
    this.frames.push({ t, side, points });
  }
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

/** Frames further than this from the asked-for time draw nothing rather
 * than a skeleton from somewhere else in the set. */
export const TIMELINE_MAX_GAP_MS = 250;

/** The frame nearest to `t` (binary search), or null when there's none
 * within `maxGapMs`. */
export function frameAt(
  frames: readonly TimelineFrame[],
  t: number,
  maxGapMs = TIMELINE_MAX_GAP_MS,
): TimelineFrame | null {
  if (frames.length === 0 || !Number.isFinite(t)) return null;
  let lo = 0;
  let hi = frames.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  // lo is the first frame at or after t; its predecessor may be closer.
  let best = frames[lo];
  if (lo > 0 && Math.abs(frames[lo - 1].t - t) <= Math.abs(best.t - t)) best = frames[lo - 1];
  return Math.abs(best.t - t) <= maxGapMs ? best : null;
}

const HIDDEN: PoseLandmark = { x: 0, y: 0, z: 0, visibility: 0 };

/** Rebuilds a full 33-landmark pose the overlay can draw; joints that weren't
 * stored are invisible (so never drawn). */
export function framePose(frame: TimelineFrame, size = 33): Pose | null {
  if (!frame.points) return null;
  const pose: PoseLandmark[] = Array.from({ length: size }, () => HIDDEN);
  for (let k = 0; k + 3 < frame.points.length; k += 4) {
    const i = frame.points[k];
    if (i >= 0 && i < size) {
      pose[i] = {
        x: frame.points[k + 1],
        y: frame.points[k + 2],
        z: 0,
        visibility: frame.points[k + 3],
      };
    }
  }
  return pose;
}
