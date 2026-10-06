"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Camera,
  CameraOff,
  Check,
  LoaderCircle,
  Lock,
  SwitchCamera,
  Timer,
  TriangleAlert,
  VideoOff,
  X,
} from "lucide-react";
import type { Pose } from "@/modules/health/client/pose/geometry";
import { readOverlayColors, type OverlayColors } from "@/modules/health/client/pose/overlay";
import { PHOTO_POSE_LABELS, type PhotoPose } from "@/modules/health/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  OUTLINE_BONES,
  SELF_TIMER_SECONDS,
  announcedCountdown,
  checkPhotoPose,
  fromLandmarkTuples,
  toLandmarkTuples,
  type LandmarkTuple,
  type PoseCheck,
} from "./photo-helpers";
import { PhotoError, drawDownscaled, encodeCanvas, type CapturedPhoto } from "./photo-image";

/**
 * Guided progress-photo capture: live camera preview (mirrored for the
 * front camera, like a mirror — the SAVED frame is not), a live pose check
 * with cues, a faint outline of the last photo of this pose to line up
 * against, and a 10-second self-timer. Everything runs on this device.
 */

type LandmarkerModule = typeof import("@/modules/health/client/pose/landmarker");
type Facing = "user" | "environment";

type Status =
  | "starting-camera"
  | "loading-model"
  | "running"
  | "no-model"
  | "capturing"
  | "denied"
  | "no-camera"
  | "busy"
  | "insecure"
  | "camera-error";

type Support = "unknown" | "ok" | "insecure" | "no-camera";

function readSupport(): Support {
  if (window.isSecureContext === false) return "insecure";
  if (!navigator.mediaDevices?.getUserMedia) return "no-camera";
  return "ok";
}
const serverSupport = (): Support => "unknown";
const subscribeNothing = () => () => {};

function cameraErrorStatus(error: unknown): Status {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError")
    return "denied";
  if (
    name === "NotFoundError" ||
    name === "DevicesNotFoundError" ||
    name === "OverconstrainedError"
  )
    return "no-camera";
  if (name === "NotReadableError" || name === "TrackStartError") return "busy";
  return "camera-error";
}

const ERRORS: Partial<Record<Status, { title: string; description: string; icon: typeof Camera }>> =
  {
    denied: {
      title: "Camera permission denied",
      description:
        "Allow camera access for this site (the camera icon in the address bar), then try again — or upload a photo instead.",
      icon: CameraOff,
    },
    "no-camera": {
      title: "No camera found",
      description: "This browser can't see a camera. Upload a photo from your gallery instead.",
      icon: VideoOff,
    },
    busy: {
      title: "Camera is in use",
      description: "Another app or tab is using the camera. Close it and try again.",
      icon: CameraOff,
    },
    insecure: {
      title: "Camera needs a secure connection",
      description:
        "Browsers only allow the camera on https:// or localhost. Open the app at http://127.0.0.1, or upload a photo instead.",
      icon: Lock,
    },
    "camera-error": {
      title: "Couldn't start the camera",
      description: "Something went wrong opening the camera. Try again.",
      icon: TriangleAlert,
    },
  };

interface Session {
  token: number;
  stream: MediaStream | null;
  frame: number | null;
  mod: LandmarkerModule | null;
  colors: OverlayColors | null;
  lastPose: Pose | null;
  lastCueKey: string;
  timer: number | null;
}

function endSession(session: Session, video: HTMLVideoElement | null): void {
  session.token++;
  if (session.frame !== null) cancelAnimationFrame(session.frame);
  session.frame = null;
  if (session.timer !== null) window.clearInterval(session.timer);
  session.timer = null;
  session.stream?.getTracks().forEach((track) => track.stop());
  session.stream = null;
  session.lastPose = null;
  if (video) {
    video.pause();
    video.srcObject = null;
  }
}

function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  pose: Pose,
  color: string,
  lineWidth: number,
  dash: number[],
): void {
  const { width, height } = ctx.canvas;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.setLineDash(dash);
  ctx.beginPath();
  for (const [a, b] of OUTLINE_BONES) {
    const p = pose[a];
    const q = pose[b];
    if ((p.visibility ?? 1) < 0.3 || (q.visibility ?? 1) < 0.3) continue;
    ctx.moveTo(p.x * width, p.y * height);
    ctx.lineTo(q.x * width, q.y * height);
  }
  ctx.stroke();
  const head = pose[0];
  if ((head.visibility ?? 1) >= 0.3) {
    ctx.beginPath();
    ctx.arc(head.x * width, head.y * height, Math.max(width, height) * 0.03, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

export interface PhotoCameraProps {
  pose: PhotoPose;
  /** Landmarks of the last photo of this pose, drawn as a guide outline. */
  ghost: LandmarkTuple[] | null;
  onCaptured: (photo: CapturedPhoto) => void;
  onCancel: () => void;
}

export function PhotoCamera({ pose, ghost, onCaptured, onCancel }: PhotoCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sessionRef = useRef<Session>({
    token: 0,
    stream: null,
    frame: null,
    mod: null,
    colors: null,
    lastPose: null,
    lastCueKey: "",
    timer: null,
  });
  const support = useSyncExternalStore(subscribeNothing, readSupport, serverSupport);
  const [facing, setFacing] = useState<Facing>("user");
  const [status, setStatus] = useState<Status>("starting-camera");
  const [check, setCheck] = useState<PoseCheck | null>(null);
  const [aspect, setAspect] = useState(3 / 4);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const ghostPose = fromLandmarkTuples(ghost);
  // The frame loop reads these through a ref so it needn't restart on change.
  const liveRef = useRef({ pose, ghostPose });
  useEffect(() => {
    liveRef.current = { pose, ghostPose };
  });

  useEffect(() => {
    const session = sessionRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || readSupport() !== "ok") return;
    const token = ++session.token;
    const model = import("@/modules/health/client/pose/landmarker").then(async (mod) => {
      await mod.loadLandmarker();
      return mod;
    });
    model.catch(() => undefined);

    (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
      } catch (error) {
        if (session.token === token) setStatus(cameraErrorStatus(error));
        return;
      }
      if (session.token !== token) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      session.stream = stream;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Superseded mid-start; the token check handles it.
      }
      if (session.token !== token) return;
      if (video.videoWidth && video.videoHeight) setAspect(video.videoWidth / video.videoHeight);
      setStatus("loading-model");

      let mod: LandmarkerModule | null = null;
      try {
        mod = await model;
      } catch {
        // No pose model: the camera and timer still work, just without cues.
      }
      if (session.token !== token) return;
      session.mod = mod;
      session.colors = readOverlayColors(canvas);
      setStatus(mod ? "running" : "no-model");
      if (!mod) return;

      const ctx = canvas.getContext("2d");
      let lastTime = -1;
      const onFrame = () => {
        if (session.token !== token) return;
        session.frame = requestAnimationFrame(onFrame);
        if (video.readyState < 2 || video.currentTime === lastTime) return;
        lastTime = video.currentTime;
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (w && h && (canvas.width !== w || canvas.height !== h)) {
          canvas.width = w;
          canvas.height = h;
          setAspect(w / h);
        }
        let landmarks: Pose | null = null;
        try {
          landmarks = mod.detect(video, performance.now());
        } catch {
          landmarks = null;
        }
        session.lastPose = landmarks;
        const live = liveRef.current;
        if (ctx && session.colors) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const unit = Math.max(canvas.width, canvas.height) / 300;
          if (live.ghostPose) {
            ctx.globalAlpha = 0.55;
            drawSkeleton(ctx, live.ghostPose, session.colors.halo, unit * 2.5, [
              unit * 4,
              unit * 3,
            ]);
            ctx.globalAlpha = 1;
          }
          if (landmarks) drawSkeleton(ctx, landmarks, session.colors.line, unit * 1.5, []);
        }
        const next = checkPhotoPose(landmarks, live.pose, w && h ? w / h : 1);
        const key = next.cues.join("|");
        if (key !== session.lastCueKey) {
          session.lastCueKey = key;
          setCheck(next);
        }
      };
      session.frame = requestAnimationFrame(onFrame);
    })();

    return () => {
      endSession(session, video);
      session.lastCueKey = "";
    };
  }, [facing, attempt]);

  // Unmount: free the WASM/GPU memory too.
  useEffect(() => {
    const session = sessionRef.current;
    return () => {
      void session.mod?.closeLandmarker();
    };
  }, []);

  async function capture() {
    const session = sessionRef.current;
    const video = videoRef.current;
    if (!video || !session.stream || !video.videoWidth) return;
    setStatus("capturing");
    try {
      // The raw (unmirrored) frame, downscaled; landmarks from this exact frame.
      const canvas = drawDownscaled(video, video.videoWidth, video.videoHeight);
      let landmarks: Pose | null = session.lastPose;
      if (session.mod) {
        try {
          landmarks = session.mod.detect(video, performance.now()) ?? landmarks;
        } catch {
          // Keep the last frame's pose.
        }
      }
      const encoded = await encodeCanvas(canvas);
      endSession(session, video);
      onCaptured({
        ...encoded,
        width: canvas.width,
        height: canvas.height,
        landmarks: toLandmarkTuples(landmarks),
        poseUnavailable: !session.mod,
        source: "camera",
      });
    } catch (error) {
      setCaptureError(error instanceof PhotoError ? error.message : "Couldn't take the photo.");
      setStatus(session.mod ? "running" : "no-model");
    }
  }

  function startTimer() {
    const session = sessionRef.current;
    if (session.timer !== null) return;
    setCaptureError(null);
    const deadline = performance.now() + SELF_TIMER_SECONDS * 1000;
    setCountdown(SELF_TIMER_SECONDS);
    session.timer = window.setInterval(() => {
      const remaining = Math.ceil((deadline - performance.now()) / 1000);
      if (remaining > 0) {
        setCountdown(remaining);
        return;
      }
      if (session.timer !== null) window.clearInterval(session.timer);
      session.timer = null;
      setCountdown(null);
      void capture();
    }, 200);
  }

  function cancelTimer() {
    const session = sessionRef.current;
    if (session.timer !== null) window.clearInterval(session.timer);
    session.timer = null;
    setCountdown(null);
  }

  function retry() {
    setStatus("starting-camera");
    setCheck(null);
    setAttempt((n) => n + 1);
  }

  function switchCamera() {
    cancelTimer();
    setStatus("starting-camera");
    setCheck(null);
    setFacing((f) => (f === "user" ? "environment" : "user"));
  }

  const shown: Status = support === "insecure" || support === "no-camera" ? support : status;
  const error = ERRORS[shown];
  const live = shown === "running" || shown === "no-model";
  const mirrored = facing === "user";
  const timing = countdown !== null;

  let cueText = "";
  if (shown === "starting-camera") cueText = "Waiting for the camera — allow access if asked.";
  else if (shown === "loading-model") cueText = "Loading the pose guide…";
  else if (shown === "no-model")
    cueText = "Pose guide unavailable (model files missing) — you can still take the photo.";
  else if (shown === "capturing") cueText = "Taking photo…";
  else if (check) cueText = check.ready ? "Looking good — hold still." : check.cues[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-medium">
          Take a {PHOTO_POSE_LABELS[pose].toLowerCase()} photo
        </h3>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X aria-hidden="true" />
          Close camera
        </Button>
      </div>

      {error ? (
        <div role="alert" className="border-border flex items-start gap-3 rounded-lg border p-4">
          <error.icon className="text-destructive mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="flex flex-col gap-2">
            <p className="font-medium">{error.title}</p>
            <p className="text-muted-foreground text-sm">{error.description}</p>
            {shown !== "insecure" && shown !== "no-camera" && (
              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={retry}>
                Try again
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <div
        className={cn("bg-muted relative mx-auto overflow-hidden rounded-lg", error && "hidden")}
        style={{ aspectRatio: aspect, width: `min(100%, calc(70vh * ${aspect}))` }}
      >
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Camera preview"
          className={cn("h-full w-full object-cover", mirrored && "-scale-x-100")}
        />
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full",
            mirrored && "-scale-x-100",
          )}
        />
        {!live && shown !== "capturing" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <LoaderCircle
              className="text-muted-foreground size-8 animate-spin"
              aria-hidden="true"
            />
          </div>
        )}
        {timing && (
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center bg-black/20"
          >
            <span className="text-8xl font-semibold text-white tabular-nums drop-shadow-lg">
              {countdown}
            </span>
          </div>
        )}
        {cueText && !error && (
          <p
            aria-hidden="true"
            className={cn(
              "absolute inset-x-2 bottom-2 rounded-md px-3 py-2 text-center text-sm font-medium",
              check?.ready && live
                ? "bg-primary text-primary-foreground"
                : "bg-background/90 text-foreground",
            )}
          >
            {check?.ready && live && <Check className="mr-1 inline size-4" aria-hidden="true" />}
            {cueText}
          </p>
        )}
      </div>

      {/* Screen-reader cues: the pose check and a countdown that speaks on 10, 5, 3, 2, 1. */}
      <p role="status" aria-live="polite" className="sr-only">
        {timing ? `Taking photo in ${announcedCountdown(countdown)} seconds.` : cueText}
      </p>

      {ghost && live && (
        <p className="text-muted-foreground text-sm">
          The dashed outline is your last {PHOTO_POSE_LABELS[pose].toLowerCase()} photo — line up
          with it to keep distance and position the same.
        </p>
      )}

      {captureError && (
        <p role="alert" className="text-destructive text-sm">
          {captureError}
        </p>
      )}

      {!error && (
        <div className="flex flex-wrap gap-2">
          {timing ? (
            <Button type="button" variant="outline" onClick={cancelTimer}>
              <X aria-hidden="true" />
              Cancel timer
            </Button>
          ) : (
            <>
              <Button type="button" disabled={!live} onClick={startTimer}>
                <Timer aria-hidden="true" />
                {SELF_TIMER_SECONDS}-second timer
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!live}
                onClick={() => void capture()}
              >
                <Camera aria-hidden="true" />
                Capture now
              </Button>
              <Button type="button" variant="ghost" disabled={!live} onClick={switchCamera}>
                <SwitchCamera aria-hidden="true" />
                Switch camera
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
