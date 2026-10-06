import type { CameraMovement } from "../../gym-types";
import {
  inFrame,
  meanVisibility,
  minVisibility,
  pickSide,
  toAspectSpace,
  visibilityOf,
  type Pose,
  type PoseLandmark,
  type Side,
} from "./geometry";
import {
  getMovementConfig,
  movementDirection,
  requiredLandmarks,
  romScore,
  type FormCheck,
  type MovementConfig,
} from "./movements";

/**
 * The camera rep counter's brain: a pure state machine fed one pose per video
 * frame. No MediaPipe, DOM or clock access — timestamps come in with the
 * landmarks — so every behaviour here is unit-tested with synthetic poses.
 *
 * Per frame: smooth the landmarks (time-aware EMA), gate on the required
 * landmarks being visible and in frame, compute the movement's driver angle,
 * then advance a three-phase machine:
 *
 *   setup ──(driver in start zone)──▶ start ──(past endAt)──▶ end
 *                                       ▲                       │
 *                                       └──(back past startAt)──┘ = 1 rep
 *
 * The start and end thresholds sit tens of degrees apart, so the band between
 * them is hysteresis: noise can't flip the phase back and forth. A rep that
 * completes faster than `minRepMs` is discarded as jitter rather than counted.
 */

export type RepPhase = "setup" | "start" | "end";

export interface RepTempo {
  /** Lowering / lengthening half, ms. */
  eccentric: number;
  /** Lifting / shortening half, ms. */
  concentric: number;
}

export interface RepRecord {
  /** 1-based. */
  index: number;
  /** 0–100: how close the turnaround got to the movement's full end-range. */
  romScore: number;
  /** The most extreme driver angle reached in the rep, degrees. */
  peakAngle: number;
  tempoMs: RepTempo;
  durationMs: number;
  /** Form fault messages, in the movement's check order. */
  flags: string[];
  flagIds: string[];
  endedAt: number;
}

export interface LastRepSummary {
  romScore: number;
  tempoMs: RepTempo;
  flags: string[];
}

export interface FlagCount {
  id: string;
  message: string;
  count: number;
}

export interface RepCounterSnapshot {
  movement: CameraMovement;
  reps: number;
  phase: RepPhase;
  /** Movement-specific name for the phase ("Standing", "At depth"…). */
  phaseLabel: string;
  /** Current smoothed driver angle in degrees; null while not visible. */
  currentAngle: number | null;
  lastRep: LastRepSummary | null;
  /** Mean ROM over counted reps, rounded; null before the first rep. */
  avgRomScore: number | null;
  /** The one thing to tell the user right now, or null when all's well. */
  cue: string | null;
  /** The required landmarks are visible and the driver is measurable. */
  visible: boolean;
  /** The body side being measured for side-on movements; null for front-on. */
  side: Side | null;
  /** Every fault seen this set, most frequent first. */
  flagSummary: FlagCount[];
  /** Hands-free end of set: at least one rep, then either no new rep and no
   * real movement for `setEndIdleMs` (resting in view), or out of view for
   * `setEndAwayMs` (walked off). Goes false again on the next movement. */
  setEnded: boolean;
}

export interface RepCounterOptions {
  movement: CameraMovement;
  /** Replaces the built-in movement config — tests use a minimal one. */
  config?: MovementConfig;
  /** Video width / height, so angles are measured on square pixels. */
  aspectRatio?: number;
  minRepMs?: number;
  smoothingMs?: number;
  visibilityEnter?: number;
  visibilityExit?: number;
  maxGapMs?: number;
  setEndIdleMs?: number;
  setEndAwayMs?: number;
}

export const NO_PERSON_CUE = "Step into view of the camera";
export const STEP_BACK_CUE = "Step back so your whole body is in frame";

/** Fastest believable rep. Real reps take ≥ ~0.5 s even when rushed; a
 * landmark glitch that crosses both thresholds does so within a frame or two
 * (≤ ~100 ms), so 350 ms separates them with margin either way. */
export const DEFAULT_MIN_REP_MS = 350;

/** EMA time constant. Time-aware (alpha = 1 − e^(−dt/τ)) so a 15 fps laptop
 * and a 30 fps phone smooth the same: ~0.42 per frame at 30 fps. 60 ms
 * damps the lite model's frame-to-frame jitter while lagging a brisk rep by
 * only a couple of frames. */
export const DEFAULT_SMOOTHING_MS = 60;

/** Visibility hysteresis: a required landmark must reach 0.6 to START
 * counting but only drops out below 0.4, so a limb hovering around
 * MediaPipe's 0.5 doesn't flicker the "step back" cue on and off. */
export const DEFAULT_VISIBILITY_ENTER = 0.6;
export const DEFAULT_VISIBILITY_EXIT = 0.4;

/** Out of view this long mid-rep and the rep is abandoned rather than
 * counted from a stale half. A brief occlusion (a hand passing the camera,
 * a dropped frame burst) is shorter. */
export const DEFAULT_MAX_GAP_MS = 1000;

/** No pose for this long and smoothing restarts from the next raw pose,
 * instead of blending a person re-entering the frame with where they left. */
const SMOOTHING_RESET_MS = 300;

/** After the last rep, this long without moving (in view) ends the set. Long
 * enough for a breath at lockout mid-set, short enough that the user isn't
 * left standing there waiting for the log. */
export const DEFAULT_SET_END_IDLE_MS = 4000;

/** After the last rep, out of view this long ends the set (walked off to
 * rest / re-rack). Longer than a brief occlusion (`DEFAULT_MAX_GAP_MS`). */
export const DEFAULT_SET_END_AWAY_MS = 2000;

/** The driver angle has to move this far from where it settled to count as
 * movement. Well above the smoothed lite model's frame jitter (a few
 * degrees), well below any real rep's travel. */
const STILL_TOLERANCE_DEG = 15;

/** A side-on movement only switches the measured side when the other side
 * becomes clearly (0.15) more visible — switching mid-rep jumps the angle. */
const SIDE_SWITCH_MARGIN = 0.15;

/** A movement that travelled at least half way from `startAt` to `endAt`
 * before coming back is a deliberate attempt that fell short, not a wobble —
 * worth a "not counted" cue. */
const PARTIAL_FRACTION = 0.5;

interface CheckAccumulator {
  /** First measurable value of the rep (the baseline for "drop"). */
  first: number | null;
  min: number;
  max: number;
  count: number;
  /** Value at the frame where the driver hit its most extreme point. */
  atPeak: number | null;
}

interface RepInProgress {
  /** Last frame spent in the start zone before leaving it. */
  startTs: number;
  peak: number;
  peakTs: number;
  left: boolean;
  checks: CheckAccumulator[];
}

function freshAccumulator(value: number | null): CheckAccumulator {
  return value === null
    ? { first: null, min: Infinity, max: -Infinity, count: 0, atPeak: null }
    : { first: value, min: value, max: value, count: 1, atPeak: value };
}

function aggregate(check: FormCheck, acc: CheckAccumulator): number | null {
  if (acc.count === 0) return null;
  switch (check.aggregate) {
    case "max":
      return acc.max;
    case "min":
      return acc.min;
    case "peak":
      return acc.atPeak;
    case "range":
      return acc.max - acc.min;
    case "drop":
      return acc.first === null ? null : acc.first - acc.min;
  }
}

function isFault(check: FormCheck, value: number | null): boolean {
  if (value === null) return false;
  if (check.faultAbove !== undefined && value > check.faultAbove) return true;
  if (check.faultBelow !== undefined && value < check.faultBelow) return true;
  return false;
}

export class RepCounter {
  readonly config: MovementConfig;
  private readonly closing: boolean;
  private readonly minRepMs: number;
  private readonly smoothingMs: number;
  private readonly visibilityEnter: number;
  private readonly visibilityExit: number;
  private readonly maxGapMs: number;
  private readonly setEndIdleMs: number;
  private readonly setEndAwayMs: number;
  private aspectRatio: number;

  private lastTs: number | null = null;
  private lastPoseTs: number | null = null;
  private smoothed: PoseLandmark[] | null = null;
  private side: Side | null = null;
  private visible = false;
  private seenPerson = false;
  private hiddenSince: number | null = null;
  private positionCue: string | null = null;
  private phase: RepPhase = "setup";
  private currentAngle: number | null = null;
  private rep: RepInProgress | null = null;
  private partialAt: number | null = null;
  /** Last rep or real movement — the idle clock for end-of-set. */
  private lastActivityTs: number | null = null;
  /** Driver angle where the user last settled; null after leaving a
   * countable position, so coming back counts as movement. */
  private stillAnchor: number | null = null;
  private readonly history: RepRecord[] = [];
  private readonly flagCounts = new Map<string, FlagCount>();

  constructor(options: RepCounterOptions) {
    this.config = options.config ?? getMovementConfig(options.movement);
    this.closing = movementDirection(this.config) === "closing";
    this.minRepMs = options.minRepMs ?? this.config.minRepMs ?? DEFAULT_MIN_REP_MS;
    this.smoothingMs = options.smoothingMs ?? DEFAULT_SMOOTHING_MS;
    this.visibilityEnter = options.visibilityEnter ?? DEFAULT_VISIBILITY_ENTER;
    this.visibilityExit = options.visibilityExit ?? DEFAULT_VISIBILITY_EXIT;
    this.maxGapMs = options.maxGapMs ?? DEFAULT_MAX_GAP_MS;
    this.setEndIdleMs = options.setEndIdleMs ?? DEFAULT_SET_END_IDLE_MS;
    this.setEndAwayMs = options.setEndAwayMs ?? DEFAULT_SET_END_AWAY_MS;
    this.aspectRatio = validAspect(options.aspectRatio) ?? 1;
  }

  /** Update once the video's real dimensions are known. */
  setAspectRatio(aspectRatio: number): void {
    this.aspectRatio = validAspect(aspectRatio) ?? this.aspectRatio;
  }

  get reps(): readonly RepRecord[] {
    return this.history;
  }

  /**
   * Feed one frame. `landmarks` is MediaPipe's normalized pose (or null /
   * empty when no one was detected). Timestamps must increase; a frame at or
   * before the previous timestamp is ignored.
   */
  update(timestampMs: number, landmarks: Pose | null | undefined): RepCounterSnapshot {
    if (this.lastTs !== null && timestampMs <= this.lastTs) return this.snapshot();
    this.lastTs = timestampMs;

    if (!landmarks || landmarks.length === 0) {
      this.markHidden(timestampMs);
      return this.snapshot();
    }
    this.seenPerson = true;

    const smoothed = this.smooth(landmarks, timestampMs);
    const side = this.chooseSide(smoothed);
    const required = requiredLandmarks(this.config, side);
    const threshold = this.visible ? this.visibilityExit : this.visibilityEnter;
    const inView =
      minVisibility(smoothed, required) >= threshold && required.every((i) => inFrame(smoothed[i]));
    if (!inView) {
      this.markHidden(timestampMs);
      return this.snapshot();
    }

    const pose = toAspectSpace(smoothed, this.aspectRatio);
    const value = this.config.driver(pose, side);
    if (value === null || !Number.isFinite(value)) {
      this.markHidden(timestampMs);
      return this.snapshot();
    }

    this.visible = true;
    this.hiddenSince = null;
    this.currentAngle = value;

    this.positionCue = this.config.positionCue?.(pose, side) ?? null;
    if (this.positionCue) {
      // Not in a countable position (standing during push-ups…): whatever
      // was in progress is not a rep.
      this.phase = "setup";
      this.rep = null;
      this.stillAnchor = null;
      return this.snapshot();
    }

    this.noteMotion(timestampMs, value);
    this.step(timestampMs, value, pose, side);
    return this.snapshot();
  }

  snapshot(): RepCounterSnapshot {
    const last = this.history.at(-1) ?? null;
    const reps = this.history.length;
    return {
      movement: this.config.movement,
      reps,
      phase: this.phase,
      phaseLabel: this.config.phaseLabels[this.phase],
      currentAngle: this.visible ? this.currentAngle : null,
      lastRep: last ? { romScore: last.romScore, tempoMs: last.tempoMs, flags: last.flags } : null,
      avgRomScore:
        reps === 0 ? null : Math.round(this.history.reduce((s, r) => s + r.romScore, 0) / reps),
      cue: this.cue(last),
      visible: this.visible,
      side: this.config.sides === "one" ? this.side : null,
      flagSummary: [...this.flagCounts.values()]
        .sort((a, b) => b.count - a.count)
        .map((f) => ({ ...f })),
      setEnded: this.setEnded(),
    };
  }

  /** Back to zero reps, as if just created (keeps movement and aspect ratio). */
  reset(): void {
    this.lastTs = null;
    this.lastPoseTs = null;
    this.smoothed = null;
    this.side = null;
    this.visible = false;
    this.seenPerson = false;
    this.hiddenSince = null;
    this.positionCue = null;
    this.phase = "setup";
    this.currentAngle = null;
    this.rep = null;
    this.partialAt = null;
    this.lastActivityTs = null;
    this.stillAnchor = null;
    this.history.length = 0;
    this.flagCounts.clear();
  }

  private cue(last: RepRecord | null): string | null {
    if (!this.visible) return this.seenPerson ? STEP_BACK_CUE : NO_PERSON_CUE;
    if (this.positionCue) return this.positionCue;
    if (this.phase === "setup") return this.config.setupCue;
    if (this.partialAt !== null && (last === null || this.partialAt > last.endedAt)) {
      return this.config.partialCue;
    }
    return last?.flags[0] ?? null;
  }

  private setEnded(): boolean {
    if (this.history.length === 0 || this.lastTs === null) return false;
    const now = this.lastTs;
    if (!this.visible && this.hiddenSince !== null && now - this.hiddenSince >= this.setEndAwayMs) {
      return true;
    }
    return this.lastActivityTs !== null && now - this.lastActivityTs >= this.setEndIdleMs;
  }

  private noteMotion(timestampMs: number, value: number): void {
    if (this.stillAnchor === null || Math.abs(value - this.stillAnchor) > STILL_TOLERANCE_DEG) {
      this.stillAnchor = value;
      this.lastActivityTs = timestampMs;
    }
  }

  private markHidden(timestampMs: number): void {
    this.visible = false;
    this.currentAngle = null;
    if (this.hiddenSince === null) this.hiddenSince = timestampMs;
    if (timestampMs - this.hiddenSince >= this.maxGapMs) {
      this.phase = "setup";
      this.rep = null;
    }
  }

  private smooth(raw: Pose, timestampMs: number): PoseLandmark[] {
    const prev = this.smoothed;
    const gap = this.lastPoseTs === null ? Infinity : timestampMs - this.lastPoseTs;
    this.lastPoseTs = timestampMs;
    if (!prev || prev.length !== raw.length || gap > SMOOTHING_RESET_MS || this.smoothingMs <= 0) {
      this.smoothed = raw.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: visibilityOf(p) }));
      return this.smoothed;
    }
    const alpha = 1 - Math.exp(-gap / this.smoothingMs);
    this.smoothed = raw.map((p, i) => {
      const q = prev[i];
      const qv = visibilityOf(q);
      return {
        x: q.x + alpha * (p.x - q.x),
        y: q.y + alpha * (p.y - q.y),
        z: q.z + alpha * (p.z - q.z),
        visibility: qv + alpha * (visibilityOf(p) - qv),
      };
    });
    return this.smoothed;
  }

  private chooseSide(pose: Pose): Side {
    const { left, right } = this.config.required;
    const pick = pickSide(pose, left, right);
    if (this.side === null) {
      this.side = pick.side;
    } else if (pick.side !== this.side) {
      const current = meanVisibility(pose, this.config.required[this.side]);
      if (pick.visibility - current > SIDE_SWITCH_MARGIN) this.side = pick.side;
    }
    return this.side;
  }

  private step(timestampMs: number, value: number, pose: Pose, side: Side): void {
    const cfg = this.config;
    const inStart = this.closing ? value >= cfg.startAt : value <= cfg.startAt;
    const pastEnd = this.closing ? value <= cfg.endAt : value >= cfg.endAt;
    const inEnd = pastEnd && (cfg.endRequires?.(pose, side) ?? true);
    const measures = cfg.formChecks.map((check) => check.measure(pose, side));

    switch (this.phase) {
      case "setup":
        if (inStart) {
          this.phase = "start";
          this.rep = this.freshRep(timestampMs, value, measures);
        }
        return;
      case "start": {
        if (inStart) {
          if (this.rep?.left) this.notePartial(timestampMs, this.rep);
          this.rep = this.freshRep(timestampMs, value, measures);
          return;
        }
        const rep = (this.rep ??= this.freshRep(timestampMs, value, measures));
        rep.left = true;
        this.addFrame(rep, timestampMs, value, measures);
        if (inEnd) this.phase = "end";
        return;
      }
      case "end": {
        const rep = (this.rep ??= this.freshRep(timestampMs, value, measures));
        this.addFrame(rep, timestampMs, value, measures);
        if (inStart) {
          this.completeRep(rep, timestampMs);
          this.phase = "start";
          this.rep = this.freshRep(timestampMs, value, measures);
        }
        return;
      }
    }
  }

  private freshRep(timestampMs: number, value: number, measures: (number | null)[]): RepInProgress {
    return {
      startTs: timestampMs,
      peak: value,
      peakTs: timestampMs,
      left: false,
      checks: measures.map(freshAccumulator),
    };
  }

  private addFrame(
    rep: RepInProgress,
    timestampMs: number,
    value: number,
    measures: (number | null)[],
  ): void {
    const newPeak = this.closing ? value < rep.peak : value > rep.peak;
    if (newPeak) {
      rep.peak = value;
      rep.peakTs = timestampMs;
    }
    measures.forEach((m, i) => {
      if (m === null) return;
      const acc = rep.checks[i];
      if (acc.first === null) acc.first = m;
      acc.min = Math.min(acc.min, m);
      acc.max = Math.max(acc.max, m);
      acc.count++;
      if (newPeak || acc.atPeak === null) acc.atPeak = m;
    });
  }

  private notePartial(timestampMs: number, rep: RepInProgress): void {
    const { startAt, endAt } = this.config;
    const travelled = (rep.peak - startAt) / (endAt - startAt);
    if (travelled >= PARTIAL_FRACTION) this.partialAt = timestampMs;
  }

  private completeRep(rep: RepInProgress, timestampMs: number): void {
    const durationMs = timestampMs - rep.startTs;
    if (durationMs < this.minRepMs) return;

    const outMs = rep.peakTs - rep.startTs;
    const backMs = timestampMs - rep.peakTs;
    const tempoMs: RepTempo = this.config.outIsEccentric
      ? { eccentric: outMs, concentric: backMs }
      : { eccentric: backMs, concentric: outMs };

    const faults = this.config.formChecks.filter((check, i) =>
      isFault(check, aggregate(check, rep.checks[i])),
    );
    for (const fault of faults) {
      const existing = this.flagCounts.get(fault.id);
      if (existing) existing.count++;
      else this.flagCounts.set(fault.id, { id: fault.id, message: fault.message, count: 1 });
    }

    this.history.push({
      index: this.history.length + 1,
      romScore: romScore(this.config, rep.peak),
      peakAngle: rep.peak,
      tempoMs,
      durationMs,
      flags: faults.map((f) => f.message),
      flagIds: faults.map((f) => f.id),
      endedAt: timestampMs,
    });
    this.lastActivityTs = timestampMs;
    this.stillAnchor = null;
  }
}

function validAspect(value: number | undefined): number | null {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : null;
}
