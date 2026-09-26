import type { WallSide } from "@/modules/house/types";

/**
 * Pure geometry for the 2D CAD-style plan view (`floor-plan-2d.tsx`) — same
 * reason this lives in the app layer rather than `modules/house/service/` as
 * `wall-cutout.ts`: importing a runtime value from the house module's barrel
 * (or any file it transitively imports) would pull the native SQLite binding
 * into the client bundle. `computePlanFootprint` intentionally duplicates
 * `computeFootprint`'s math (service/model.ts) rather than importing it,
 * for the same reason.
 */

export interface Footprint2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function computePlanFootprint(
  rooms: { x: number; z: number; width: number; depth: number }[],
): Footprint2D | null {
  const [first, ...rest] = rooms;
  if (!first) return null;
  const initial: Footprint2D = {
    minX: first.x,
    minY: first.z,
    maxX: first.x + first.width,
    maxY: first.z + first.depth,
  };
  return rest.reduce<Footprint2D>(
    (acc, r) => ({
      minX: Math.min(acc.minX, r.x),
      minY: Math.min(acc.minY, r.z),
      maxX: Math.max(acc.maxX, r.x + r.width),
      maxY: Math.max(acc.maxY, r.z + r.depth),
    }),
    initial,
  );
}

export interface Segment2D {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Where an opening's indicator segment sits along its room's outline, in plan (x/z) coordinates — same wall/offset convention as `getWallGeometry` in house-viewer.tsx. */
export function computeOpeningSegment(
  room: { x: number; z: number; width: number; depth: number },
  opening: { wall: WallSide; offset: number; width: number },
): Segment2D {
  switch (opening.wall) {
    case "north":
      return {
        x1: room.x + opening.offset,
        y1: room.z,
        x2: room.x + opening.offset + opening.width,
        y2: room.z,
      };
    case "south":
      return {
        x1: room.x + opening.offset,
        y1: room.z + room.depth,
        x2: room.x + opening.offset + opening.width,
        y2: room.z + room.depth,
      };
    case "west":
      return {
        x1: room.x,
        y1: room.z + opening.offset,
        x2: room.x,
        y2: room.z + opening.offset + opening.width,
      };
    case "east":
      return {
        x1: room.x + room.width,
        y1: room.z + opening.offset,
        x2: room.x + room.width,
        y2: room.z + opening.offset + opening.width,
      };
  }
}

export interface Rect2D {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Two free-drawn corners, in either order, into a top-left-origin rect. */
export function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect2D {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

/** Rounds to the nearest grid step (default 0.1m, matching this app's meters convention) — used when dragging/drawing/resizing so saved dimensions stay clean numbers. */
export function snapToGrid(value: number, gridSize = 0.1): number {
  return Math.round(value / gridSize) * gridSize;
}
