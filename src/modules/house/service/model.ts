import { getProjectByIdRow } from "../db/queries/projects";
import { listFloorsForProject } from "../db/queries/floors";
import { listRoomsForProject } from "../db/queries/rooms";
import { listOpeningsForProject } from "../db/queries/openings";
import { listStairsForProject } from "../db/queries/stairs";
import { listFixturesForProject } from "../db/queries/fixtures";
import { listWallStylesForProject } from "../db/queries/wall-styles";
import { listFurnitureForProject } from "../db/queries/furniture";
import { listLightFixturesForProject } from "../db/queries/light-fixtures";
import type {
  RoofType,
  RoomType,
  WallSide,
  OpeningType,
  DoorStyle,
  WindowStyle,
  WallStyleValue,
  StairRailingSide,
  FixtureCategory,
  FurnitureCategory,
  LightFixtureType,
  MaterialFinish,
} from "../types";

export interface OpeningModel {
  id: number;
  wall: WallSide;
  type: OpeningType;
  style: DoorStyle | WindowStyle | null;
  offset: number;
  width: number;
  height: number | null;
  sillHeight: number | null;
}

export interface WallStyleModel {
  id: number;
  wall: WallSide;
  style: WallStyleValue;
  railingHeight: number | null;
  /** Only meaningful for `style: "painted"`. */
  color: string | null;
}

export interface FurnitureModel {
  id: number;
  name: string;
  category: FurnitureCategory;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  rotationDegrees: number;
  color: string | null;
  material: MaterialFinish | null;
}

export interface LightFixtureModel {
  id: number;
  name: string;
  type: LightFixtureType;
  x: number;
  z: number;
  /** Mounting height from the floor — resolved to a per-`type` default when not set. */
  height: number | null;
  color: string | null;
  intensity: number | null;
}

export interface RoomModel {
  id: number;
  name: string;
  type: RoomType;
  x: number;
  z: number;
  width: number;
  depth: number;
  /** Resolved: the room's own override, or its floor's default. */
  wallHeight: number;
  color: string | null;
  material: MaterialFinish | null;
  openings: OpeningModel[];
  /** At most one per wall side — see `WallStyleModel`. A wall with no entry here is solid. */
  wallStyles: WallStyleModel[];
  furniture: FurnitureModel[];
  lightFixtures: LightFixtureModel[];
}

export interface FixtureModel {
  id: number;
  name: string;
  category: FixtureCategory;
  x: number;
  z: number;
}

export interface StairModel {
  id: number;
  name: string;
  fromFloorId: number;
  toFloorId: number;
  x: number;
  z: number;
  width: number;
  run: number;
  rotationDegrees: number;
  railingSide: StairRailingSide;
  railingHeight: number | null;
  /** The flight's bottom and top Y — its `fromFloor`/`toFloor`'s resolved `yOffset`s. */
  fromY: number;
  toY: number;
}

export interface FloorModel {
  id: number;
  name: string;
  level: number;
  /** Cumulative height of every floor below this one — this floor's Y position in the viewer. */
  yOffset: number;
  floorHeight: number;
  rooms: RoomModel[];
  fixtures: FixtureModel[];
}

export interface Footprint {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface HouseModel {
  project: { id: number; name: string; roofType: RoofType; roofPitchDegrees: number | null };
  floors: FloorModel[];
  stairs: StairModel[];
  /** Union bounding box of every room on every floor — an approximation used to place the roof; a real house's upper floors can differ in footprint from the ground floor, but a single shared footprint is a reasonable v1 simplification. */
  footprint: Footprint | null;
  /** Y position of the topmost floor's ceiling — where the roof sits. */
  roofBaseY: number;
}

interface FloorLike {
  id: number;
  level: number;
  floorHeight: number;
}

/**
 * Non-negative levels (ground and up) stack upward from y=0; negative levels
 * (basements) stack downward from y=0. Levels only need to sort correctly
 * relative to each other — the numeric gaps between them don't matter, each
 * floor's own `floorHeight` determines actual spacing.
 */
export function computeFloorOffsets(floorsInput: FloorLike[]): Map<number, number> {
  const offsets = new Map<number, number>();

  const aboveGround = floorsInput.filter((f) => f.level >= 0).sort((a, b) => a.level - b.level);
  let y = 0;
  for (const f of aboveGround) {
    offsets.set(f.id, y);
    y += f.floorHeight;
  }

  const belowGround = floorsInput.filter((f) => f.level < 0).sort((a, b) => b.level - a.level);
  y = 0;
  for (const f of belowGround) {
    y -= f.floorHeight;
    offsets.set(f.id, y);
  }

  return offsets;
}

export function computeFootprint(
  allRooms: { x: number; z: number; width: number; depth: number }[],
): Footprint | null {
  const [first, ...rest] = allRooms;
  if (!first) return null;
  const initial: Footprint = {
    minX: first.x,
    minZ: first.z,
    maxX: first.x + first.width,
    maxZ: first.z + first.depth,
  };
  return rest.reduce<Footprint>(
    (acc, r) => ({
      minX: Math.min(acc.minX, r.x),
      minZ: Math.min(acc.minZ, r.z),
      maxX: Math.max(acc.maxX, r.x + r.width),
      maxZ: Math.max(acc.maxZ, r.z + r.depth),
    }),
    initial,
  );
}

/** Assembles a project's floors/rooms into a plain, serializable scene description — all geometry math lives here, not in the client-side viewer. */
export function getHouseModel(projectId: number): HouseModel | null {
  const project = getProjectByIdRow(projectId);
  if (!project) return null;

  const floorRows = listFloorsForProject(projectId);
  const roomRows = listRoomsForProject(projectId);
  const openingRows = listOpeningsForProject(projectId);
  const fixtureRows = listFixturesForProject(projectId);
  const stairRows = listStairsForProject(projectId);
  const wallStyleRows = listWallStylesForProject(projectId);
  const furnitureRows = listFurnitureForProject(projectId);
  const lightFixtureRows = listLightFixturesForProject(projectId);
  const offsets = computeFloorOffsets(floorRows);

  const floors: FloorModel[] = floorRows
    .map((f) => ({
      id: f.id,
      name: f.name,
      level: f.level,
      yOffset: offsets.get(f.id) ?? 0,
      floorHeight: f.floorHeight,
      rooms: roomRows
        .filter((r) => r.floorId === f.id)
        .map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type as RoomType,
          x: r.x,
          z: r.z,
          width: r.width,
          depth: r.depth,
          wallHeight: r.wallHeight ?? f.floorHeight,
          color: r.color,
          material: r.material as MaterialFinish | null,
          openings: openingRows
            .filter((o) => o.roomId === r.id)
            .map((o) => ({
              id: o.id,
              wall: o.wall as WallSide,
              type: o.type as OpeningType,
              style: o.style as DoorStyle | WindowStyle | null,
              offset: o.offset,
              width: o.width,
              height: o.height,
              sillHeight: o.sillHeight,
            })),
          wallStyles: wallStyleRows
            .filter((w) => w.roomId === r.id)
            .map((w) => ({
              id: w.id,
              wall: w.wall as WallSide,
              style: w.style as WallStyleValue,
              railingHeight: w.railingHeight,
              color: w.color,
            })),
          furniture: furnitureRows
            .filter((fu) => fu.roomId === r.id)
            .map((fu) => ({
              id: fu.id,
              name: fu.name,
              category: fu.category as FurnitureCategory,
              x: fu.x,
              z: fu.z,
              width: fu.width,
              depth: fu.depth,
              height: fu.height,
              rotationDegrees: fu.rotationDegrees,
              color: fu.color,
              material: fu.material as MaterialFinish | null,
            })),
          lightFixtures: lightFixtureRows
            .filter((lf) => lf.roomId === r.id)
            .map((lf) => ({
              id: lf.id,
              name: lf.name,
              type: lf.type as LightFixtureType,
              x: lf.x,
              z: lf.z,
              height: lf.height,
              color: lf.color,
              intensity: lf.intensity,
            })),
        })),
      fixtures: fixtureRows
        .filter((fx) => fx.floorId === f.id)
        .map((fx) => ({
          id: fx.id,
          name: fx.name,
          category: fx.category as FixtureCategory,
          x: fx.x,
          z: fx.z,
        })),
    }))
    .sort((a, b) => a.level - b.level);

  const footprint = computeFootprint(roomRows);
  const topFloor = floors.reduce<FloorModel | null>(
    (top, f) => (!top || f.yOffset + f.floorHeight > top.yOffset + top.floorHeight ? f : top),
    null,
  );
  const roofBaseY = topFloor ? topFloor.yOffset + topFloor.floorHeight : 0;

  const stairs: StairModel[] = stairRows.map((s) => ({
    id: s.id,
    name: s.name,
    fromFloorId: s.fromFloorId,
    toFloorId: s.toFloorId,
    x: s.x,
    z: s.z,
    width: s.width,
    run: s.run,
    rotationDegrees: s.rotationDegrees,
    railingSide: s.railingSide as StairRailingSide,
    railingHeight: s.railingHeight,
    fromY: offsets.get(s.fromFloorId) ?? 0,
    toY: offsets.get(s.toFloorId) ?? 0,
  }));

  return {
    project: {
      id: project.id,
      name: project.name,
      roofType: project.roofType as RoofType,
      roofPitchDegrees: project.roofPitchDegrees,
    },
    floors,
    stairs,
    footprint,
    roofBaseY,
  };
}
