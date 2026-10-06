"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Pause, Play, ShieldCheck } from "lucide-react";
import type { CameraMovement } from "@/modules/health/types";
import { getMovementConfig } from "@/modules/health/client/pose/movements";
import { drawPoseOverlay, readOverlayColors } from "@/modules/health/client/pose/overlay";
import { frameAt, framePose, type TimelineFrame } from "@/modules/health/client/pose/replay";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Plays back a recorded set (an on-device blob URL) slowed down, with the
 * skeleton redrawn from the landmark timeline at the video's current time.
 * Mirrored exactly like the live view: the recording holds raw camera
 * frames and the timeline raw landmark coordinates, and one shared CSS flip
 * turns both into the selfie view.
 */

export interface SetRecording {
  /** Object URL of the recorded blob; the panel owns (and revokes) it. */
  url: string;
  mimeType: string;
  fileName: string;
  durationMs: number;
  frames: readonly TimelineFrame[];
  /** When each rep was counted, ms since the recording started. */
  repMarks: readonly number[];
  movement: CameraMovement;
  /** Recording hit the length cap before the set ended. */
  capped: boolean;
}

export const REPLAY_SPEEDS = [0.25, 0.5, 1] as const;
type Speed = (typeof REPLAY_SPEEDS)[number];

function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

export function SetReplay({
  recording,
  onClose,
}: {
  recording: SetRecording;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Chrome's MediaRecorder WebM has no duration until seeked to the end. */
  const fixingDurationRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(0.5);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(recording.durationMs / 1000);

  // Redraw the overlay every animation frame from the timeline frame nearest
  // the video's current time; also keeps the scrub position in step.
  useEffect(() => {
    const config = getMovementConfig(recording.movement);
    let colors: ReturnType<typeof readOverlayColors> | null = null;
    let lastDrawn: TimelineFrame | null | undefined;
    let lastTime = -1;
    let id = 0;
    const tick = () => {
      id = requestAnimationFrame(tick);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || fixingDurationRef.current) return;
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (width && height && (canvas.width !== width || canvas.height !== height)) {
        canvas.width = width;
        canvas.height = height;
        lastDrawn = undefined;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      colors ??= readOverlayColors(canvas);
      const frame = frameAt(recording.frames, video.currentTime * 1000);
      if (frame !== lastDrawn) {
        lastDrawn = frame;
        drawPoseOverlay(
          ctx,
          frame ? framePose(frame) : null,
          config.overlay(frame?.side ?? "left"),
          {
            colors,
            flash: null,
          },
        );
      }
      if (Math.abs(video.currentTime - lastTime) >= 0.05) {
        lastTime = video.currentTime;
        setTime(video.currentTime);
      }
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [recording]);

  function onLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;
    video.defaultPlaybackRate = speed;
    video.playbackRate = speed;
    if (Number.isFinite(video.duration)) {
      setDuration(video.duration);
    } else {
      fixingDurationRef.current = true;
      video.currentTime = Number.MAX_SAFE_INTEGER;
    }
  }

  function onDurationChange() {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    setDuration(video.duration);
    if (fixingDurationRef.current) {
      fixingDurationRef.current = false;
      video.currentTime = 0;
    }
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) void video.play().catch(() => undefined);
    else video.pause();
  }

  function changeSpeed(next: Speed) {
    setSpeed(next);
    const video = videoRef.current;
    if (video) {
      video.defaultPlaybackRate = next;
      video.playbackRate = next;
    }
  }

  function seek(seconds: number) {
    const video = videoRef.current;
    setTime(seconds);
    if (video) video.currentTime = seconds;
  }

  const max = Math.max(duration, 0.1);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Set replay</DialogTitle>
          <DialogDescription>
            {recording.repMarks.length} {recording.repMarks.length === 1 ? "rep" : "reps"} ·{" "}
            {formatTime(recording.durationMs / 1000)}
            {recording.capped && " · recording stopped at the 3-minute limit"}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted relative overflow-hidden rounded-lg">
          <div className="relative -scale-x-100">
            <video
              ref={videoRef}
              src={recording.url}
              muted
              playsInline
              preload="auto"
              aria-label="Recorded set"
              onClick={togglePlay}
              onLoadedMetadata={onLoadedMetadata}
              onDurationChange={onDurationChange}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              className="block max-h-[60vh] w-full object-contain"
            />
            <canvas
              ref={canvasRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 size-full object-contain"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="relative">
            <input
              type="range"
              min={0}
              max={max}
              step={0.01}
              value={Math.min(time, max)}
              onChange={(e) => seek(Number(e.target.value))}
              aria-label="Position"
              aria-valuetext={`${formatTime(time)} of ${formatTime(duration)}`}
              className="accent-primary w-full"
            />
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-1 h-2">
              {recording.repMarks.map((mark, i) => (
                <span
                  key={i}
                  className="bg-primary absolute h-2 w-0.5 rounded-full"
                  style={{ left: `${Math.min(100, (mark / 1000 / max) * 100)}%` }}
                />
              ))}
            </div>
          </div>
          <p className="text-muted-foreground text-xs tabular-nums">
            {formatTime(time)} / {formatTime(duration)}
            {recording.repMarks.length > 0 && " · marks show where each rep was counted"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="default" onClick={togglePlay}>
            {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            {playing ? "Pause" : "Play"}
          </Button>
          <div
            role="radiogroup"
            aria-label="Playback speed"
            className="inline-flex rounded-lg border p-0.5"
          >
            {REPLAY_SPEEDS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={speed === option}
                onClick={() => changeSpeed(option)}
                className={cn(
                  "rounded-md px-3 py-1 text-sm tabular-nums",
                  speed === option ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                )}
              >
                {option}×
              </button>
            ))}
          </div>
          <a
            href={recording.url}
            download={recording.fileName}
            className={cn(buttonVariants({ variant: "outline" }), "ml-auto")}
          >
            <Download aria-hidden="true" />
            Download video
          </a>
        </div>

        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0" />
          This video stays on this device. Closing the replay discards it unless you download it.
        </p>
      </DialogContent>
    </Dialog>
  );
}
