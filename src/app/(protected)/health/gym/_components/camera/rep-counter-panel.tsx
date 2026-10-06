"use client";

import { useEffect, useEffectEvent, useId, useRef, useState, useSyncExternalStore } from "react";
import {
  Camera,
  CameraOff,
  Check,
  Clapperboard,
  LoaderCircle,
  Lock,
  RotateCcw,
  ShieldCheck,
  Square,
  TriangleAlert,
  VideoOff,
} from "lucide-react";
import {
  CAMERA_MOVEMENTS,
  CAMERA_MOVEMENT_LABELS,
  type CameraMovement,
} from "@/modules/health/types";
import type { Pose } from "@/modules/health/client/pose/geometry";
import { getMovementConfig, type MovementConfig } from "@/modules/health/client/pose/movements";
import { RepCounter, type RepCounterSnapshot } from "@/modules/health/client/pose/rep-counter";
import {
  REP_FLASH_MS,
  drawPoseOverlay,
  readOverlayColors,
  type OverlayColors,
} from "@/modules/health/client/pose/overlay";
import {
  MAX_RECORDING_MS,
  PoseTimeline,
  keyJoints,
  pickRecordingMimeType,
  replayFileName,
} from "@/modules/health/client/pose/replay";
import { createVoiceCoach, type VoiceCoach } from "@/modules/health/client/pose/voice";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { SetReplay, type SetRecording } from "./set-replay";

/**
 * Live camera rep counter: webcam → MediaPipe pose (in-browser WASM, model
 * served from public/models/) → RepCounter state machine. Nothing leaves the
 * machine. The MediaPipe bundle is only imported once the camera starts, so
 * pages that merely render the panel don't pay for it.
 *
 * Extras, all on-device: a voice coach (speech synthesis), hands-free
 * auto-log (the counter's end-of-set signal → a cancelable countdown →
 * `onFinish`) and set replay (MediaRecorder video + landmark timeline).
 */

export interface RepCounterResult {
  movement: CameraMovement;
  reps: number;
  avgRomScore: number | null;
  /** Distinct form cues seen during the set, most frequent first. */
  flags: string[];
}

export interface RepCounterPanelProps {
  defaultMovement?: CameraMovement;
  targetReps?: number;
  /** Tighter layout for embedding in the live workout. */
  compact?: boolean;
  /** When given, a "Use N reps" button hands the count back and stops the camera. */
  onFinish?: (result: RepCounterResult) => void;
  /** Initial state of the "Voice" toggle (speaks rep counts and form cues). */
  voiceCoach?: boolean;
  /** Initial state of the "Auto-log" toggle (only shown with `onFinish`):
   * when the set ends, a 3-second cancelable countdown, then `onFinish`. */
  autoFinish?: boolean;
}

/** Seconds of the "Logging N reps…" countdown before auto-log hands off. */
export const AUTO_FINISH_COUNTDOWN_S = 3;

type LandmarkerModule = typeof import("@/modules/health/client/pose/landmarker");

type Status =
  | "idle"
  | "starting-camera"
  | "loading-model"
  | "running"
  | "denied"
  | "no-camera"
  | "busy"
  | "insecure"
  | "model-error"
  | "camera-error";

type CameraSupport = "unknown" | "ok" | "insecure" | "no-camera";

/** Everything the frame loop mutates, kept out of React state so 30 frames a
 * second don't each re-render; React only hears about changes worth showing. */
interface Session {
  /** Bumped by every start/stop, so a stale async start or frame callback
   * can tell it's been superseded and bail. */
  token: number;
  stream: MediaStream | null;
  video: HTMLVideoElement | null;
  frame: { kind: "video" | "animation"; id: number } | null;
  mod: LandmarkerModule | null;
  colors: OverlayColors | null;
  reduceMotion: boolean;
  aspect: number;
  lastVideoTime: number;
  lastReps: number;
  lastRepAt: number;
  lastKey: string;
  lastAngle: string;
  lastPublishAt: number;
  /** Mirrors the Voice toggle for the frame loop. */
  voice: boolean;
  coach: VoiceCoach | null;
  lastCue: string | null;
  /** Mirrors "Auto-log is on and there's an onFinish to call". */
  autoFinish: boolean;
  /** End-of-set is ignored until the count passes this (after Cancel). */
  autoDismissedAtReps: number;
  /** Reps the running countdown will log; null when none is running. */
  countdownReps: number | null;
  recording: ActiveRecording | null;
  /** The finished recording's object URL, revoked when it's dropped. */
  replayUrl: string | null;
  /** Unmounted: a recording that finishes stopping now is thrown away. */
  disposed: boolean;
}

interface ActiveRecording {
  recorder: MediaRecorder;
  chunks: Blob[];
  mimeType: string;
  startedAt: Date;
  /** performance.now() at recorder start — timeline times are relative to it. */
  t0: number;
  stoppedAt: number | null;
  timeline: PoseTimeline;
  repMarks: number[];
  movement: CameraMovement;
  capped: boolean;
  /** Stopped to be thrown away (reset, new start, unmount), not replayed. */
  discard: boolean;
}

function createSession(): Session {
  return {
    token: 0,
    stream: null,
    video: null,
    frame: null,
    mod: null,
    colors: null,
    reduceMotion: false,
    aspect: 16 / 9,
    lastVideoTime: -1,
    lastReps: 0,
    lastRepAt: -Infinity,
    lastKey: "",
    lastAngle: "",
    lastPublishAt: 0,
    voice: false,
    coach: null,
    lastCue: null,
    autoFinish: false,
    autoDismissedAtReps: 0,
    countdownReps: null,
    recording: null,
    replayUrl: null,
    disposed: false,
  };
}

// Ideal, not exact: phones and webcams pick their nearest mode. The pose model
// downsamples to 256 px anyway, so more resolution only costs upload time.
const VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
};

/** The current angle readout refreshes at most this often (ms) — reps, phase
 * and cues still update on the frame they change. */
const ANGLE_REFRESH_MS = 100;

function readCameraSupport(): CameraSupport {
  // Browsers hide navigator.mediaDevices entirely outside a secure context
  // (https or localhost), so check that first for the more useful message.
  if (window.isSecureContext === false) return "insecure";
  if (!navigator.mediaDevices?.getUserMedia) return "no-camera";
  return "ok";
}
const serverCameraSupport = (): CameraSupport => "unknown";
const readSpeechSupport = () =>
  "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
const serverSpeechSupport = () => false;
const subscribeNothing = () => () => {};

function cameraErrorStatus(error: unknown): Status {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "no-camera";
    case "NotReadableError":
    case "TrackStartError":
      return "busy";
    default:
      return "camera-error";
  }
}

function errorText(error: unknown): string | null {
  return error instanceof Error && error.message ? error.message : null;
}

function scheduleFrame(session: Session, callback: () => void): void {
  const video = session.video;
  // requestVideoFrameCallback fires once per decoded camera frame — no
  // wasted detections on repeated frames, no missed ones. rAF is the
  // fallback (older Firefox); the loop skips frames whose time hasn't moved.
  if (video && typeof video.requestVideoFrameCallback === "function") {
    session.frame = { kind: "video", id: video.requestVideoFrameCallback(callback) };
  } else {
    session.frame = { kind: "animation", id: requestAnimationFrame(callback) };
  }
}

function cancelFrame(session: Session): void {
  const frame = session.frame;
  session.frame = null;
  if (!frame) return;
  if (frame.kind === "video") session.video?.cancelVideoFrameCallback(frame.id);
  else cancelAnimationFrame(frame.id);
}

/** Starts recording the camera stream for replay — video only (the stream
 * has no audio track). Skipped silently where MediaRecorder or every
 * candidate format is unsupported. */
function beginRecording(
  session: Session,
  config: MovementConfig,
  onDone: (recording: ActiveRecording) => void,
): void {
  const stream = session.stream;
  if (!stream || typeof MediaRecorder === "undefined") return;
  const mimeType = pickRecordingMimeType((type) => MediaRecorder.isTypeSupported(type));
  if (!mimeType) return;
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
  } catch {
    return;
  }
  const recording: ActiveRecording = {
    recorder,
    chunks: [],
    mimeType: recorder.mimeType || mimeType,
    startedAt: new Date(),
    t0: performance.now(),
    stoppedAt: null,
    timeline: new PoseTimeline(keyJoints(config)),
    repMarks: [],
    movement: config.movement,
    capped: false,
    discard: false,
  };
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) recording.chunks.push(event.data);
  };
  recorder.onstop = () => {
    if (!recording.discard) onDone(recording);
    else recording.chunks.length = 0;
  };
  try {
    // A timeslice keeps the data flowing in chunks rather than one huge blob.
    recorder.start(1000);
  } catch {
    return;
  }
  session.recording = recording;
}

/** Stops the active recording; `keep` hands it to the replay, otherwise it's dropped. */
function endRecording(session: Session, keep: boolean): void {
  const recording = session.recording;
  session.recording = null;
  if (!recording) return;
  recording.discard = !keep;
  recording.stoppedAt ??= performance.now();
  if (recording.recorder.state === "inactive") return;
  try {
    recording.recorder.stop();
  } catch {
    recording.discard = true;
  }
}

/** Stops the loop and every camera track (turning the camera light off).
 * Any recording still running is discarded unless it was ended (kept) first. */
function endSession(session: Session): void {
  session.token++;
  endRecording(session, false);
  session.coach?.cancel();
  session.countdownReps = null;
  cancelFrame(session);
  session.stream?.getTracks().forEach((track) => track.stop());
  session.stream = null;
  if (session.video) {
    session.video.pause();
    session.video.srcObject = null;
  }
  session.lastVideoTime = -1;
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

const STATUS_MESSAGES: Record<
  Exclude<Status, "running">,
  { title: string; description: string; icon: typeof Camera; tone: "status" | "alert" }
> = {
  idle: {
    title: "Camera is off",
    description: "Start the camera, then step back until you're in frame.",
    icon: Camera,
    tone: "status",
  },
  "starting-camera": {
    title: "Waiting for the camera…",
    description: "Allow camera access if your browser asks.",
    icon: LoaderCircle,
    tone: "status",
  },
  "loading-model": {
    title: "Loading the pose model…",
    description: "Runs on this device — the first start takes a few seconds.",
    icon: LoaderCircle,
    tone: "status",
  },
  denied: {
    title: "Camera permission denied",
    description:
      "Allow camera access for this site (the camera icon in the address bar), then try again.",
    icon: CameraOff,
    tone: "alert",
  },
  "no-camera": {
    title: "No camera found",
    description: "This browser can't see a camera. Connect a webcam or use a device that has one.",
    icon: VideoOff,
    tone: "alert",
  },
  busy: {
    title: "Camera is in use",
    description: "Another app or tab is using the camera. Close it and try again.",
    icon: CameraOff,
    tone: "alert",
  },
  insecure: {
    title: "Camera needs a secure connection",
    description:
      "Browsers only allow the camera on https:// or localhost. Open the app at http://127.0.0.1 rather than a network address.",
    icon: Lock,
    tone: "alert",
  },
  "model-error": {
    title: "Couldn't load the pose model",
    description:
      "The model files in public/models/ are missing or failed to load. Run scripts/fetch-fashion-models.sh, then try again.",
    icon: TriangleAlert,
    tone: "alert",
  },
  "camera-error": {
    title: "Couldn't start the camera",
    description: "Something went wrong opening the camera. Try again.",
    icon: TriangleAlert,
    tone: "alert",
  },
};

export function RepCounterPanel({
  defaultMovement = "squat",
  targetReps,
  compact = false,
  onFinish,
  voiceCoach = false,
  autoFinish = false,
}: RepCounterPanelProps) {
  const selectId = useId();
  const hintId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const counterRef = useRef<RepCounter | null>(null);
  const sessionRef = useRef<Session>(createSession());

  const support = useSyncExternalStore(subscribeNothing, readCameraSupport, serverCameraSupport);
  const speechSupported = useSyncExternalStore(
    subscribeNothing,
    readSpeechSupport,
    serverSpeechSupport,
  );
  const [voiceOn, setVoiceOn] = useState(voiceCoach);
  const [autoFinishOn, setAutoFinishOn] = useState(autoFinish);
  const [countdown, setCountdown] = useState<{ reps: number; remaining: number } | null>(null);
  const [replay, setReplay] = useState<SetRecording | null>(null);
  const [replayOpen, setReplayOpen] = useState(false);
  const [movement, setMovement] = useState<CameraMovement>(defaultMovement);
  const [status, setStatus] = useState<Status>("idle");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [videoAspect, setVideoAspect] = useState(16 / 9);
  const [snapshot, setSnapshot] = useState<RepCounterSnapshot>(() =>
    new RepCounter({ movement: defaultMovement }).snapshot(),
  );

  // Unmount: camera off, loop cancelled, speech silenced, recording dropped,
  // WASM/GPU memory released.
  useEffect(() => {
    const session = sessionRef.current;
    session.disposed = false;
    return () => {
      session.disposed = true;
      endSession(session);
      if (session.replayUrl) URL.revokeObjectURL(session.replayUrl);
      session.replayUrl = null;
      void session.mod?.closeLandmarker();
    };
  }, []);

  // The frame loop reads the toggles from the session, not from React state.
  useEffect(() => {
    const session = sessionRef.current;
    session.voice = voiceOn && speechSupported;
    if (!session.voice) session.coach?.cancel();
  }, [voiceOn, speechSupported]);
  useEffect(() => {
    sessionRef.current.autoFinish = autoFinishOn && onFinish !== undefined;
  }, [autoFinishOn, onFinish]);

  const completeCountdown = useEffectEvent(() => finish());
  useEffect(() => {
    if (!countdown) return;
    const id = setTimeout(() => {
      if (countdown.remaining <= 1) completeCountdown();
      else setCountdown({ ...countdown, remaining: countdown.remaining - 1 });
    }, 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  const config = getMovementConfig(movement);
  const running = status === "running";
  const busyStarting = status === "starting-camera" || status === "loading-model";
  const shownStatus: Status =
    status === "idle" && (support === "insecure" || support === "no-camera") ? support : status;
  const canStart = support === "ok" && !running && !busyStarting;

  function dropReplay() {
    const session = sessionRef.current;
    if (session.replayUrl) URL.revokeObjectURL(session.replayUrl);
    session.replayUrl = null;
    setReplay(null);
    setReplayOpen(false);
  }

  function keepRecording(recording: ActiveRecording) {
    const session = sessionRef.current;
    // MediaRecorder's stop event is async — the panel may be gone by now
    // (e.g. the workout closed it on "Use N reps").
    if (session.disposed || recording.chunks.length === 0) {
      recording.chunks.length = 0;
      return;
    }
    const blob = new Blob(recording.chunks, { type: recording.mimeType });
    recording.chunks.length = 0;
    if (session.replayUrl) URL.revokeObjectURL(session.replayUrl);
    const url = URL.createObjectURL(blob);
    session.replayUrl = url;
    setReplayOpen(false);
    setReplay({
      url,
      mimeType: recording.mimeType,
      fileName: replayFileName(recording.startedAt, recording.mimeType),
      durationMs: (recording.stoppedAt ?? performance.now()) - recording.t0,
      frames: recording.timeline.frames,
      repMarks: recording.repMarks,
      movement: recording.movement,
      capped: recording.capped,
    });
  }

  function restartRecording(config: MovementConfig) {
    const session = sessionRef.current;
    endRecording(session, false);
    if (session.stream && status === "running") beginRecording(session, config, keepRecording);
  }

  function cancelCountdown() {
    const session = sessionRef.current;
    session.autoDismissedAtReps = snapshot.reps;
    session.countdownReps = null;
    setCountdown(null);
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function start() {
    const session = sessionRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const currentSupport = readCameraSupport();
    if (currentSupport !== "ok") {
      setStatus(currentSupport === "insecure" ? "insecure" : "no-camera");
      return;
    }

    endSession(session);
    dropReplay();
    setCountdown(null);
    session.autoDismissedAtReps = 0;
    const token = session.token;
    setErrorDetail(null);
    setStatus("starting-camera");

    // Model download/compile and the permission prompt run in parallel.
    const model = import("@/modules/health/client/pose/landmarker").then(async (mod) => {
      await mod.loadLandmarker();
      return mod;
    });
    model.catch(() => undefined); // awaited below; don't report it unhandled if the camera fails first

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
    } catch (error) {
      if (session.token !== token) return;
      setStatus(cameraErrorStatus(error));
      setErrorDetail(errorText(error));
      return;
    }
    if (session.token !== token) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    session.stream = stream;
    session.video = video;
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      // Muted inline playback is always allowed; a rejection here means Stop
      // was pressed mid-start, which the token check below handles.
    }
    if (session.token !== token) return;

    setStatus("loading-model");
    let mod: LandmarkerModule;
    try {
      mod = await model;
    } catch (error) {
      if (session.token !== token) return;
      endSession(session);
      setStatus("model-error");
      setErrorDetail(errorText(error));
      return;
    }
    if (session.token !== token) return;
    session.mod = mod;

    const syncSize = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height || (canvas.width === width && canvas.height === height)) return;
      canvas.width = width;
      canvas.height = height;
      session.aspect = width / height;
      counterRef.current?.setAspectRatio(session.aspect);
      setVideoAspect(session.aspect);
    };
    syncSize();

    const counter = counterRef.current ?? new RepCounter({ movement, aspectRatio: session.aspect });
    counter.setAspectRatio(session.aspect);
    counterRef.current = counter;
    session.colors = readOverlayColors(canvas);
    session.reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    session.lastKey = "";
    const ctx = canvas.getContext("2d");

    const onFrame = () => {
      if (session.token !== token) return;
      if (video.readyState >= 2 && video.currentTime !== session.lastVideoTime) {
        session.lastVideoTime = video.currentTime;
        syncSize();
        const now = performance.now();
        let landmarks: Pose | null;
        try {
          landmarks = mod.detect(video, now);
        } catch (error) {
          endSession(session);
          clearCanvas();
          setStatus("model-error");
          setErrorDetail(errorText(error));
          return;
        }
        const active = counterRef.current;
        if (active) {
          const snap = active.update(now, landmarks);
          const newRep = snap.reps > session.lastReps;
          if (newRep) session.lastRepAt = now;
          session.lastReps = snap.reps;

          const recording = session.recording;
          if (recording) {
            const t = now - recording.t0;
            recording.timeline.add(t, snap.visible ? landmarks : null, snap.side ?? "left");
            if (newRep) recording.repMarks.push(t);
            if (t >= MAX_RECORDING_MS) {
              recording.capped = true;
              endRecording(session, true);
            }
          }

          if (session.voice) {
            const coach = (session.coach ??= createVoiceCoach());
            if (newRep) {
              coach.rep(snap.reps);
              coach.cue(snap.lastRep?.flags[0]);
            } else if (snap.cue !== session.lastCue) {
              coach.cue(snap.cue);
            }
          }
          session.lastCue = snap.cue;

          if (session.countdownReps !== null && (newRep || !session.autoFinish)) {
            // Still going (or auto-log switched off): no hand-off.
            session.countdownReps = null;
            setCountdown(null);
          } else if (
            session.countdownReps === null &&
            session.autoFinish &&
            snap.setEnded &&
            snap.reps > session.autoDismissedAtReps
          ) {
            session.countdownReps = snap.reps;
            setCountdown({ reps: snap.reps, remaining: AUTO_FINISH_COUNTDOWN_S });
            if (session.voice) session.coach?.cue(`Logging ${snap.reps} reps`);
          }

          if (ctx && session.colors) {
            const since = now - session.lastRepAt;
            const flash =
              !session.reduceMotion && since < REP_FLASH_MS ? since / REP_FLASH_MS : null;
            drawPoseOverlay(
              ctx,
              snap.visible ? landmarks : null,
              active.config.overlay(snap.side ?? "left"),
              { colors: session.colors, flash },
            );
          }

          const key = [
            snap.movement,
            snap.reps,
            snap.phase,
            snap.cue,
            snap.visible,
            snap.setEnded,
          ].join("|");
          const angle = snap.currentAngle === null ? "" : String(Math.round(snap.currentAngle));
          if (
            key !== session.lastKey ||
            (angle !== session.lastAngle && now - session.lastPublishAt >= ANGLE_REFRESH_MS)
          ) {
            session.lastKey = key;
            session.lastAngle = angle;
            session.lastPublishAt = now;
            setSnapshot(snap);
          }
        }
      }
      scheduleFrame(session, onFrame);
    };

    setStatus("running");
    beginRecording(session, counter.config, keepRecording);
    scheduleFrame(session, onFrame);
  }

  function stop() {
    const session = sessionRef.current;
    endRecording(session, true);
    endSession(session);
    clearCanvas();
    setCountdown(null);
    setStatus("idle");
  }

  function reset() {
    const counter = counterRef.current;
    const session = sessionRef.current;
    session.lastKey = "";
    session.autoDismissedAtReps = 0;
    session.countdownReps = null;
    setCountdown(null);
    if (running) restartRecording(counter?.config ?? getMovementConfig(movement));
    else dropReplay();
    if (counter) {
      counter.reset();
      setSnapshot(counter.snapshot());
    } else {
      setSnapshot(new RepCounter({ movement }).snapshot());
    }
  }

  function changeMovement(next: CameraMovement) {
    const session = sessionRef.current;
    const counter = new RepCounter({ movement: next, aspectRatio: session.aspect });
    counterRef.current = counter;
    session.lastKey = "";
    session.autoDismissedAtReps = 0;
    session.countdownReps = null;
    setCountdown(null);
    if (running) restartRecording(counter.config);
    setMovement(next);
    setSnapshot(counter.snapshot());
  }

  function finish() {
    setCountdown(null);
    onFinish?.({
      movement,
      reps: snapshot.reps,
      avgRomScore: snapshot.avgRomScore,
      flags: snapshot.flagSummary.map((f) => f.message),
    });
    stop();
  }

  const lastRep = snapshot.lastRep;
  const targetPct = targetReps ? Math.min(100, (snapshot.reps / targetReps) * 100) : 0;
  const targetReached = targetReps !== undefined && targetReps > 0 && snapshot.reps >= targetReps;
  const announcement =
    snapshot.reps === 0
      ? ""
      : [
          `Rep ${snapshot.reps}${targetReps ? ` of ${targetReps}` : ""}.`,
          lastRep ? `Range of motion ${lastRep.romScore} percent.` : "",
          lastRep?.flags[0] ? `${lastRep.flags[0]}.` : "",
          targetReps && snapshot.reps === targetReps ? "Target reached." : "",
        ]
          .filter(Boolean)
          .join(" ");
  const statusMessage = shownStatus === "running" ? null : STATUS_MESSAGES[shownStatus];
  const StatusIcon = statusMessage?.icon;

  return (
    <section aria-label="Camera rep counter" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor={selectId}>Movement</Label>
          <select
            id={selectId}
            value={movement}
            aria-describedby={hintId}
            onChange={(e) => changeMovement(e.target.value as CameraMovement)}
            className="border-input bg-background h-8 rounded-md border px-3 text-sm"
          >
            {CAMERA_MOVEMENTS.map((m) => (
              <option key={m} value={m}>
                {CAMERA_MOVEMENT_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {running ? (
            <Button type="button" variant="outline" onClick={stop}>
              <Square aria-hidden="true" />
              Stop
            </Button>
          ) : (
            <Button
              type="button"
              variant="default"
              onClick={() => void start()}
              disabled={!canStart}
            >
              <Camera aria-hidden="true" />
              {status === "idle" || busyStarting ? "Start camera" : "Try again"}
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={reset} disabled={snapshot.reps === 0}>
            <RotateCcw aria-hidden="true" />
            Reset
          </Button>
          {onFinish && (
            <Button
              type="button"
              variant="secondary"
              onClick={finish}
              disabled={snapshot.reps === 0}
            >
              <Check aria-hidden="true" />
              Use {snapshot.reps} {snapshot.reps === 1 ? "rep" : "reps"}
            </Button>
          )}
        </div>
      </div>

      <p id={hintId} className="text-muted-foreground text-sm">
        <span className="text-foreground font-medium">
          {config.view === "side" ? "Side view" : "Front view"}:
        </span>{" "}
        {config.placement}
        {running && " Changing the movement resets the count."}
      </p>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={voiceOn && speechSupported}
            disabled={!speechSupported}
            onChange={(e) => setVoiceOn(e.target.checked)}
            className="accent-primary"
          />
          <span>
            Voice
            <span className="text-muted-foreground">
              {speechSupported
                ? " — speaks reps and form cues"
                : " — not supported in this browser"}
            </span>
          </span>
        </label>
        {onFinish && (
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoFinishOn}
              onChange={(e) => {
                setAutoFinishOn(e.target.checked);
                if (!e.target.checked && countdown) cancelCountdown();
              }}
              className="accent-primary"
            />
            <span>
              Auto-log
              <span className="text-muted-foreground"> — logs the set once you stop moving</span>
            </span>
          </label>
        )}
        {replay && !running && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setReplayOpen(true)}
          >
            <Clapperboard aria-hidden="true" />
            Replay set
          </Button>
        )}
      </div>

      {countdown && (
        <div className="bg-secondary text-secondary-foreground flex flex-wrap items-center gap-3 rounded-lg px-4 py-3">
          <span aria-hidden="true" className="text-2xl font-semibold tabular-nums">
            {countdown.remaining}
          </span>
          <p role="status" aria-live="assertive" className="flex-1 font-medium">
            Logging {countdown.reps} {countdown.reps === 1 ? "rep" : "reps"}…
          </p>
          <Button type="button" variant="outline" onClick={cancelCountdown}>
            Cancel
          </Button>
        </div>
      )}

      <div className={cn("grid gap-4", !compact && "lg:grid-cols-[minmax(0,1fr)_17rem]")}>
        <div
          className={cn(
            "bg-muted relative mx-auto w-full overflow-hidden rounded-lg",
            compact ? "max-h-72" : "max-h-[70vh]",
          )}
          style={{ aspectRatio: String(videoAspect) }}
        >
          {/* Mirrored like a selfie view; video and canvas share the transform
              and object-fit so the skeleton lines up with the body. */}
          <div className="absolute inset-0 -scale-x-100">
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label="Camera preview"
              className={cn("size-full object-contain", !running && "invisible")}
            />
            <canvas
              ref={canvasRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 size-full object-contain"
            />
          </div>

          {statusMessage && StatusIcon && (
            <div
              role={statusMessage.tone}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center"
            >
              <StatusIcon
                aria-hidden="true"
                className={cn(
                  "text-muted-foreground size-8",
                  StatusIcon === LoaderCircle && "motion-safe:animate-spin",
                )}
              />
              <p className="font-medium">{statusMessage.title}</p>
              <p className="text-muted-foreground max-w-sm text-sm">{statusMessage.description}</p>
              {errorDetail && statusMessage.tone === "alert" && (
                <p className="text-muted-foreground max-w-sm text-xs">Details: {errorDetail}</p>
              )}
            </div>
          )}

          {running && snapshot.cue && (
            <p className="bg-background/85 text-foreground absolute inset-x-2 bottom-2 rounded-md px-3 py-2 text-center text-sm font-medium shadow-sm">
              {snapshot.cue}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div>
            <p className="text-muted-foreground text-sm">Reps</p>
            <p className="flex items-baseline gap-2">
              <span
                key={snapshot.reps}
                className={cn(
                  "font-semibold tabular-nums motion-safe:animate-in motion-safe:zoom-in-90 motion-safe:duration-200",
                  compact ? "text-5xl" : "text-6xl",
                )}
              >
                {snapshot.reps}
              </span>
              {targetReps ? (
                <span className="text-muted-foreground text-lg tabular-nums">/ {targetReps}</span>
              ) : null}
            </p>
            {targetReps ? (
              <div className="mt-2 flex flex-col gap-1">
                <div
                  role="progressbar"
                  aria-label="Reps toward target"
                  aria-valuemin={0}
                  aria-valuemax={targetReps}
                  aria-valuenow={Math.min(snapshot.reps, targetReps)}
                  className="bg-muted h-2 overflow-hidden rounded-full"
                >
                  <div
                    className="bg-primary h-full rounded-full transition-[width]"
                    style={{ width: `${targetPct}%` }}
                  />
                </div>
                {targetReached && <p className="text-sm font-medium">Target reached</p>}
              </div>
            ) : null}
            <p className="text-muted-foreground mt-2 text-sm tabular-nums">
              {running
                ? snapshot.visible && snapshot.currentAngle !== null
                  ? `${snapshot.phaseLabel} · ${Math.round(snapshot.currentAngle)}°`
                  : "Waiting for a clear view"
                : "Not tracking"}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-muted-foreground">Last rep range of motion</span>
              <span className="font-medium tabular-nums">
                {lastRep ? `${lastRep.romScore}%` : "—"}
              </span>
            </div>
            <div aria-hidden="true" className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className="bg-primary h-full rounded-full"
                style={{ width: `${lastRep?.romScore ?? 0}%` }}
              />
            </div>
            {lastRep && (
              <p className="text-muted-foreground text-xs tabular-nums">
                Lowering {formatSeconds(lastRep.tempoMs.eccentric)} · Lifting{" "}
                {formatSeconds(lastRep.tempoMs.concentric)}
              </p>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div className="col-span-2">
              <dt className="text-muted-foreground">Form cue</dt>
              <dd className="font-medium">
                {running && snapshot.cue ? snapshot.cue : (lastRep?.flags[0] ?? "—")}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground">Avg range of motion</dt>
              <dd className="font-medium tabular-nums">
                {snapshot.avgRomScore === null ? "—" : `${snapshot.avgRomScore}%`}
              </dd>
            </div>
          </dl>

          {!compact && snapshot.flagSummary.length > 0 && (
            <div className="text-sm">
              <p className="text-muted-foreground">Form notes this set</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {snapshot.flagSummary.map((f) => (
                  <li key={f.id} className="tabular-nums">
                    {f.message} <span className="text-muted-foreground">×{f.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0" />
        Processed on this device — video never leaves your computer. The set is recorded for replay
        on this device only and discarded on reset or when you close the replay.
      </p>
      {replay && replayOpen && <SetReplay recording={replay} onClose={dropReplay} />}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
