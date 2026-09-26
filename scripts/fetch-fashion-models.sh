#!/usr/bin/env bash
# One-time local setup for the fashion module's Track A (live recolor).
# Vendors MediaPipe's WASM runtime + model weights into public/models/ so
# Track A never makes a network call at runtime — see docs/prd/fashion.md.
# public/models/ is gitignored (same reasoning as /data/): these are large
# binaries fetched locally, not committed. Re-run any time after a clean
# checkout or an `@mediapipe/tasks-vision` upgrade.
set -euo pipefail
cd "$(dirname "$0")/.."

WASM_SRC="node_modules/@mediapipe/tasks-vision/wasm"
OUT_DIR="public/models"

if [ ! -d "$WASM_SRC" ]; then
  echo "error: $WASM_SRC not found — run 'pnpm install' first" >&2
  exit 1
fi

mkdir -p "$OUT_DIR/wasm"
cp "$WASM_SRC"/* "$OUT_DIR/wasm/"

echo "Fetching pose_landmarker_lite.task..."
curl -sSL -o "$OUT_DIR/pose_landmarker_lite.task" \
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"

echo "Fetching selfie_segmentation.tflite..."
curl -sSL -o "$OUT_DIR/selfie_segmentation.tflite" \
  "https://storage.googleapis.com/mediapipe-assets/selfie_segmentation.tflite"

echo "Done. Vendored into $OUT_DIR/"
