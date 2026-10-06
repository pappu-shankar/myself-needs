import { FilesetResolver, PoseLandmarker, type NormalizedLandmark } from "@mediapipe/tasks-vision";

/**
 * Browser-only: loads MediaPipe's pose landmarker for live video. The
 * health module's own loader (modules never import each other) over the same
 * vendored files the fashion module uses.
 *
 * Served from public/models/ — fetched once by scripts/fetch-fashion-models.sh
 * and gitignored. Never a CDN URL: that would quietly turn the camera rep
 * counter into a network call and break "video never leaves the machine".
 */
const WASM_BASE_PATH = "/models/wasm";
const POSE_MODEL_PATH = "/models/pose_landmarker_lite.task";

// WasmFileset isn't exported by @mediapipe/tasks-vision's typings, so derive it.
type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

function create(fileset: WasmFileset, delegate: "GPU" | "CPU"): Promise<PoseLandmarker> {
  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODEL_PATH, delegate },
    runningMode: "VIDEO",
    numPoses: 1,
    // MediaPipe's defaults (0.5). Lower lets a half-visible person through
    // as a confident-looking pose; the rep counter gates on per-landmark
    // visibility anyway, so stricter detection buys nothing.
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

let landmarkerPromise: Promise<PoseLandmarker> | null = null;
let landmarker: PoseLandmarker | null = null;
let lastTimestamp = -Infinity;

/**
 * Loads (once) and returns the shared landmarker. GPU (WebGL) first — the
 * lite model runs comfortably at 30 fps there — falling back to the WASM CPU
 * path where WebGL isn't available. A failed load is not cached, so a retry
 * after fixing the model files works without a reload.
 */
export function loadLandmarker(): Promise<PoseLandmarker> {
  if (!landmarkerPromise) {
    const promise = (async () => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE_PATH);
      try {
        return await create(fileset, "GPU");
      } catch {
        return await create(fileset, "CPU");
      }
    })();
    landmarkerPromise = promise;
    // Only the still-current load may install itself: a closeLandmarker()
    // that ran mid-load has already scheduled this instance for closing.
    promise.then(
      (instance) => {
        if (landmarkerPromise === promise) landmarker = instance;
      },
      () => {
        if (landmarkerPromise === promise) landmarkerPromise = null;
      },
    );
  }
  return landmarkerPromise;
}

/**
 * Pose landmarks for the current video frame, or null when no one is in
 * view or the model hasn't loaded. VIDEO mode requires strictly increasing
 * timestamps (it tracks between frames); two frames landing on the same
 * millisecond are nudged apart rather than throwing.
 */
export function detect(video: HTMLVideoElement, timestampMs: number): NormalizedLandmark[] | null {
  if (!landmarker) return null;
  const ts = timestampMs > lastTimestamp ? timestampMs : lastTimestamp + 1;
  lastTimestamp = ts;
  const result = landmarker.detectForVideo(video, ts);
  return result.landmarks[0] ?? null;
}

/** Frees the WASM/GPU resources. The next `loadLandmarker()` starts afresh. */
export async function closeLandmarker(): Promise<void> {
  const pending = landmarkerPromise;
  landmarkerPromise = null;
  landmarker = null;
  lastTimestamp = -Infinity;
  if (!pending) return;
  try {
    (await pending).close();
  } catch {
    // A load that failed has nothing to close.
  }
}
