import { visibilityOf, type Pose } from "./geometry";
import type { MovementOverlay } from "./movements";

/**
 * Draws the movement's skeleton over the camera preview — only the joints
 * that matter for the current movement, so the user sees exactly what's
 * being measured. Browser-only (Canvas 2D), not unit-tested; the geometry it
 * draws comes from movements.ts, which is.
 *
 * Landmarks are drawn in raw normalized coordinates scaled to the canvas,
 * whose pixel size matches the video's, so the canvas lines up with the
 * video under the same CSS (object-fit + mirroring) without any math here.
 */

export interface OverlayColors {
  /** Bones and the emphasised driver joint. */
  line: string;
  /** Contrasting outline so lines read on any background. */
  halo: string;
}

/** Fallbacks if the CSS variables can't be read (they always exist in the app). */
const FALLBACK_COLORS: OverlayColors = { line: "#2a78d6", halo: "#ffffff" };

/** Reads the design tokens (--primary / --primary-foreground) from the
 * element's computed style, so the overlay follows light/dark theme. */
export function readOverlayColors(element: Element): OverlayColors {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    line: read("--primary", FALLBACK_COLORS.line),
    halo: read("--primary-foreground", FALLBACK_COLORS.halo),
  };
}

/** Matches the rep counter's measurement threshold: a joint MediaPipe isn't
 * confident about isn't drawn, rather than drawn somewhere wrong. */
const DRAW_VISIBILITY = 0.5;

/** How long the "rep counted" ring takes to expand and fade. */
export const REP_FLASH_MS = 450;

export interface DrawOptions {
  colors: OverlayColors;
  /** 0–1 progress of the rep-counted flash, or null for none (always null
   * under prefers-reduced-motion). */
  flash: number | null;
}

export function drawPoseOverlay(
  ctx: CanvasRenderingContext2D,
  pose: Pose | null,
  overlay: MovementOverlay,
  { colors, flash }: DrawOptions,
): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  if (!pose) return;

  // Scale strokes with the frame so a 1280 px and a 480 px video look alike.
  const unit = Math.max(1.5, Math.min(width, height) / 180);
  const at = (i: number) => {
    const p = pose[i];
    return p && visibilityOf(p) >= DRAW_VISIBILITY ? { x: p.x * width, y: p.y * height } : null;
  };

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Two passes: a wide halo underneath, then the coloured bone on top.
  for (const [color, widthFactor] of [
    [colors.halo, 2.4],
    [colors.line, 1.2],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = unit * widthFactor;
    for (const [a, b] of overlay.segments) {
      const pa = at(a);
      const pb = at(b);
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    }
  }

  const focus = new Set(overlay.focus);
  for (const i of overlay.points) {
    const p = at(i);
    if (!p) continue;
    const isFocus = focus.has(i);
    const r = unit * (isFocus ? 3.2 : 2);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = isFocus ? colors.line : colors.halo;
    ctx.fill();
    ctx.lineWidth = unit * 0.9;
    ctx.strokeStyle = isFocus ? colors.halo : colors.line;
    ctx.stroke();
  }

  if (flash !== null && flash < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - flash;
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = unit * 1.5;
    for (const i of overlay.focus) {
      const p = at(i);
      if (!p) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, unit * (4 + 10 * flash), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
