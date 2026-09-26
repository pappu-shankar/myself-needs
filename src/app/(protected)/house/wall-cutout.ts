/**
 * Pure geometry for one opening's cutout box, used to CSG-subtract a real
 * hole from a wall brush (see `Wall` in house-viewer.tsx). Deliberately lives
 * in the app layer, not `modules/house/service/` — importing a *value* (not
 * just a type) from the house module's barrel would pull its service/query
 * code, and therefore the native SQLite binding, into the client bundle. See
 * AGENTS.md's client-import rule and docs/architecture/system-design.md.
 */
export interface CutoutBox {
  size: [number, number, number];
  position: [number, number, number];
}

/** How much thicker than the wall the cutout box is — ensures both wall faces are cleanly cut rather than leaving a paper-thin coplanar sliver. */
const CUTOUT_DEPTH_PADDING = 0.05;

export function computeOpeningCutout(params: {
  axis: "x" | "z";
  centerX: number;
  centerZ: number;
  roomX: number;
  roomZ: number;
  offset: number;
  width: number;
  height: number;
  sillHeight: number;
  wallThickness: number;
  wallHeight: number;
  yOffset: number;
}): CutoutBox {
  const {
    axis,
    centerX,
    centerZ,
    roomX,
    roomZ,
    offset,
    width,
    wallThickness,
    wallHeight,
    yOffset,
    sillHeight,
  } = params;
  // Clamped so the cutout never exceeds the wall's own height — an opening
  // taller than its wall (bad data, or a wall-height override entered after
  // the opening) would otherwise produce a degenerate/inverted CSG box.
  const cutHeight = Math.min(params.height, Math.max(wallHeight - sillHeight, 0.01));
  const cutY = yOffset + sillHeight + cutHeight / 2;
  const depth = wallThickness + CUTOUT_DEPTH_PADDING;

  if (axis === "x") {
    const cx = roomX + offset + width / 2;
    return { size: [width, cutHeight, depth], position: [cx, cutY, centerZ] };
  }
  const cz = roomZ + offset + width / 2;
  return { size: [depth, cutHeight, width], position: [centerX, cutY, cz] };
}
