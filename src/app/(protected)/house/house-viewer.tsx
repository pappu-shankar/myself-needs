"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  OrbitControls,
  Grid,
  PerspectiveCamera,
  OrthographicCamera,
  ContactShadows,
} from "@react-three/drei";
import * as THREE from "three";
import { Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import type {
  HouseModel,
  RoomModel,
  OpeningModel,
  FixtureModel,
  StairModel,
  FurnitureModel,
  LightFixtureModel,
} from "@/modules/house";
import { WALL_SIDES } from "@/modules/house/types";
import type {
  RoomType,
  FixtureCategory,
  WallSide,
  FurnitureCategory,
  LightFixtureType,
  MaterialFinish,
} from "@/modules/house/types";
import { computeOpeningCutout } from "./wall-cutout";
import { downloadDataUrl } from "./download-file";

const WALL_THICKNESS = 0.15;
const DEFAULT_ROOF_PITCH_DEGREES = 30;
const ROOF_OVERHANG = 0.3;
const DEFAULT_DOOR_HEIGHT = 2.1;
const DEFAULT_DOOR_SILL = 0;
const DEFAULT_WINDOW_HEIGHT = 1.2;
const DEFAULT_WINDOW_SILL = 0.9;
const OPENING_PANEL_THICKNESS = 0.03;
const DEFAULT_RAILING_HEIGHT = 1;
const RAILING_KICK_HEIGHT = 0.1;
const RAIL_BAR_THICKNESS = 0.05;
const RAILING_COLOR = "#6b6b6b";
const DEFAULT_STAIR_RAILING_HEIGHT = 0.9;
const DEFAULT_LIGHT_INTENSITY = 0.6;
const DEFAULT_LIGHT_COLOR = "#fff4d6";
const LIGHT_FIXTURE_MARKER_RADIUS = 0.08;
const DEFAULT_LIGHT_HEIGHT: Record<LightFixtureType, number> = {
  ceiling: 2.9,
  wall: 1.6,
  pendant: 2.2,
  floor_lamp: 1.5,
};

/**
 * Shared PBR-ish material tuning so surfaces read as real building materials
 * instead of flat, unlit-looking color swatches — painted walls/roof stay
 * matte, railings/rails read as brushed metal. No textures, just
 * roughness/metalness on the existing `meshStandardMaterial`s.
 */
const WALL_MATERIAL_PROPS = { roughness: 0.85, metalness: 0.05 };
const ROOF_MATERIAL_PROPS = { roughness: 0.9, metalness: 0 };
const STAIR_MATERIAL_PROPS = { roughness: 0.75, metalness: 0.1 };
const RAILING_MATERIAL_PROPS = { roughness: 0.35, metalness: 0.7 };
const FIXTURE_MATERIAL_PROPS = { roughness: 0.6, metalness: 0.2 };
const FURNITURE_MATERIAL_PROPS = { roughness: 0.7, metalness: 0.05 };

/**
 * User-selectable finish, applied instead of the fixed per-family constants
 * above when a room/furniture item has a `material` set. Still no
 * textures/HDRI — just a different roughness/metalness preset on the same
 * `meshStandardMaterial`. See docs/prd/house.md.
 */
const MATERIAL_PRESETS: Record<MaterialFinish, { roughness: number; metalness: number }> = {
  matte: { roughness: 0.95, metalness: 0 },
  satin: { roughness: 0.55, metalness: 0.05 },
  gloss: { roughness: 0.15, metalness: 0.05 },
  metal: { roughness: 0.3, metalness: 0.9 },
};

/** Reported by a click on a wall/opening/furniture/light-fixture mesh — see `HouseWorkspace`, which opens that entity's own edit dialog. */
export type HouseSelection = {
  kind: "room" | "opening" | "furniture" | "lightFixture";
  id: number;
};

const VIEW_MODES = ["3d", "north", "south", "east", "west"] as const;
type ViewMode = (typeof VIEW_MODES)[number];
const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  "3d": "3D",
  north: "North",
  south: "South",
  east: "East",
  west: "West",
};

const ROOM_TYPE_COLORS: Record<RoomType, string> = {
  bedroom: "#c9ada7",
  bathroom: "#a2d2ff",
  kitchen: "#ffd6a5",
  living: "#caffbf",
  dining: "#fdffb6",
  hallway: "#e0e0e0",
  garage: "#bdbdbd",
  balcony: "#b8e0d2",
  other: "#d4d4d8",
};

const OPENING_COLORS = { door: "#8d5a3b", window: "#7fd8f0" };

const FIXTURE_CATEGORY_COLORS: Record<FixtureCategory, string> = {
  water_inlet: "#4ea8de",
  sump: "#3a6ea5",
  septic_tank: "#6b705c",
  overhead_tank: "#48cae4",
  drain_outlet: "#5c4033",
  electrical_panel: "#f4a261",
  other: "#adb5bd",
};

const FURNITURE_CATEGORY_COLORS: Record<FurnitureCategory, string> = {
  bed: "#e8c1a0",
  sofa: "#8a7e72",
  table: "#a47551",
  chair: "#6f5a44",
  wardrobe: "#54402e",
  desk: "#8d6748",
  tv_unit: "#333333",
  other: "#9a9a9a",
};

/**
 * Click-to-select handlers for a mesh representing one house entity — a
 * pointer cursor on hover plus a click reported up to `HouseWorkspace`, which
 * opens that entity's own edit dialog (the analog of custom3dbuilder's
 * "click a door for its options"). Omitted entirely (no handlers, no cursor
 * change) when the viewer has no `onSelect` — e.g. a future read-only export
 * view could reuse `Scene` without turning every mesh interactive.
 */
function selectableProps(
  onSelect: ((selection: HouseSelection) => void) | undefined,
  selection: HouseSelection,
) {
  if (!onSelect) return {};
  return {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onSelect(selection);
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      document.body.style.cursor = "auto";
    },
  };
}

interface WallGeometry {
  length: number;
  centerX: number;
  centerZ: number;
  /** Which world axis the wall runs along — the other axis is its thickness direction. */
  axis: "x" | "z";
}

function getWallGeometry(room: RoomModel, wall: WallSide): WallGeometry {
  const cx = room.x + room.width / 2;
  const cz = room.z + room.depth / 2;
  switch (wall) {
    case "north":
      return { length: room.width, centerX: cx, centerZ: room.z, axis: "x" };
    case "south":
      return { length: room.width, centerX: cx, centerZ: room.z + room.depth, axis: "x" };
    case "west":
      return { length: room.depth, centerX: room.x, centerZ: cz, axis: "z" };
    case "east":
      return { length: room.depth, centerX: room.x + room.width, centerZ: cz, axis: "z" };
  }
}

/**
 * One of a room's 4 walls — solid (in the room's default color) unless
 * overridden via `room.wallStyles`: `open` (no wall), `railing` (a low kick
 * wall + a rail on posts), or `painted` (still solid, just a different
 * color). A railing wall is a v1 approximation (no individual balusters),
 * used for balcony edges and open-concept landings/hallways overlooking a
 * floor below. See docs/prd/house.md.
 *
 * A wall with openings gets a real CSG-cut hole (via `three-bvh-csg`) rather
 * than a solid box with a panel glued on top — see `cutoutGeometry` below and
 * `OpeningPanel`. A wall with no openings skips CSG entirely and renders the
 * plain box it always has, since `Evaluator.evaluate` isn't free.
 */
function Wall({
  room,
  wall,
  yOffset,
  onSelect,
}: {
  room: RoomModel;
  wall: WallSide;
  yOffset: number;
  onSelect?: (selection: HouseSelection) => void;
}) {
  const geo = getWallGeometry(room, wall);
  // Last match wins if more than one row exists for this wall — see wall-styles.ts.
  const override = room.wallStyles.filter((w) => w.wall === wall).at(-1);
  const color =
    (override?.style === "painted" ? override.color : null) ??
    room.color ??
    ROOM_TYPE_COLORS[room.type];
  const materialProps = room.material ? MATERIAL_PRESETS[room.material] : WALL_MATERIAL_PROPS;
  const wallOpenings = useMemo(
    () => room.openings.filter((o) => o.wall === wall),
    [room.openings, wall],
  );

  const cutoutGeometry = useMemo(() => {
    if (wallOpenings.length === 0) return null;

    const wallSize: [number, number, number] =
      geo.axis === "x"
        ? [geo.length, room.wallHeight, WALL_THICKNESS]
        : [WALL_THICKNESS, room.wallHeight, geo.length];
    const wallBrush = new Brush(new THREE.BoxGeometry(...wallSize));
    wallBrush.position.set(geo.centerX, yOffset + room.wallHeight / 2, geo.centerZ);
    wallBrush.updateMatrixWorld(true);

    const evaluator = new Evaluator();
    let result: Brush = wallBrush;
    for (const opening of wallOpenings) {
      const isDoor = opening.type === "door";
      const cutout = computeOpeningCutout({
        axis: geo.axis,
        centerX: geo.centerX,
        centerZ: geo.centerZ,
        roomX: room.x,
        roomZ: room.z,
        offset: opening.offset,
        width: opening.width,
        height: opening.height ?? (isDoor ? DEFAULT_DOOR_HEIGHT : DEFAULT_WINDOW_HEIGHT),
        sillHeight: opening.sillHeight ?? (isDoor ? DEFAULT_DOOR_SILL : DEFAULT_WINDOW_SILL),
        wallThickness: WALL_THICKNESS,
        wallHeight: room.wallHeight,
        yOffset,
      });
      const cutoutBrush = new Brush(new THREE.BoxGeometry(...cutout.size));
      cutoutBrush.position.set(...cutout.position);
      cutoutBrush.updateMatrixWorld(true);
      result = evaluator.evaluate(result, cutoutBrush, SUBTRACTION);
    }
    return result.geometry;
  }, [
    wallOpenings,
    geo.axis,
    geo.centerX,
    geo.centerZ,
    geo.length,
    room.wallHeight,
    room.x,
    room.z,
    yOffset,
  ]);

  // Three.js BufferGeometry isn't garbage-collected automatically — dispose
  // the previous CSG result whenever a new one replaces it (or on unmount).
  useEffect(() => () => cutoutGeometry?.dispose(), [cutoutGeometry]);

  if (override?.style === "open") return null;

  if (override?.style === "railing") {
    const railingHeight = override.railingHeight ?? DEFAULT_RAILING_HEIGHT;
    const kickHeight = Math.min(RAILING_KICK_HEIGHT, railingHeight);
    const postOffset = geo.length / 2 - RAIL_BAR_THICKNESS / 2;
    return (
      <group>
        <mesh
          castShadow
          receiveShadow
          position={[geo.centerX, yOffset + kickHeight / 2, geo.centerZ]}
        >
          <boxGeometry
            args={
              geo.axis === "x"
                ? [geo.length, kickHeight, WALL_THICKNESS]
                : [WALL_THICKNESS, kickHeight, geo.length]
            }
          />
          <meshStandardMaterial color={color} {...WALL_MATERIAL_PROPS} />
        </mesh>
        <mesh castShadow position={[geo.centerX, yOffset + railingHeight, geo.centerZ]}>
          <boxGeometry
            args={
              geo.axis === "x"
                ? [geo.length, RAIL_BAR_THICKNESS, RAIL_BAR_THICKNESS]
                : [RAIL_BAR_THICKNESS, RAIL_BAR_THICKNESS, geo.length]
            }
          />
          <meshStandardMaterial color={RAILING_COLOR} {...RAILING_MATERIAL_PROPS} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh
            key={side}
            castShadow
            position={[
              geo.axis === "x" ? geo.centerX + side * postOffset : geo.centerX,
              yOffset + railingHeight / 2,
              geo.axis === "z" ? geo.centerZ + side * postOffset : geo.centerZ,
            ]}
          >
            <boxGeometry args={[RAIL_BAR_THICKNESS, railingHeight, RAIL_BAR_THICKNESS]} />
            <meshStandardMaterial color={RAILING_COLOR} {...RAILING_MATERIAL_PROPS} />
          </mesh>
        ))}
      </group>
    );
  }

  if (cutoutGeometry) {
    return (
      <mesh
        castShadow
        receiveShadow
        geometry={cutoutGeometry}
        {...selectableProps(onSelect, { kind: "room", id: room.id })}
      >
        <meshStandardMaterial color={color} {...materialProps} />
      </mesh>
    );
  }

  return (
    <mesh
      castShadow
      receiveShadow
      position={[geo.centerX, yOffset + room.wallHeight / 2, geo.centerZ]}
      {...selectableProps(onSelect, { kind: "room", id: room.id })}
    >
      <boxGeometry
        args={
          geo.axis === "x"
            ? [geo.length, room.wallHeight, WALL_THICKNESS]
            : [WALL_THICKNESS, room.wallHeight, geo.length]
        }
      />
      <meshStandardMaterial color={color} {...materialProps} />
    </mesh>
  );
}

function RoomWalls({
  room,
  yOffset,
  onSelect,
}: {
  room: RoomModel;
  yOffset: number;
  onSelect?: (selection: HouseSelection) => void;
}) {
  return (
    <group>
      {WALL_SIDES.map((wall) => (
        <Wall key={wall} room={room} wall={wall} yOffset={yOffset} onSelect={onSelect} />
      ))}
      {room.openings.map((opening) => (
        <OpeningPanel
          key={opening.id}
          room={room}
          opening={opening}
          yOffset={yOffset}
          onSelect={onSelect}
        />
      ))}
      {room.furniture.map((item) => (
        <FurnitureBox key={item.id} room={room} item={item} yOffset={yOffset} onSelect={onSelect} />
      ))}
      {room.lightFixtures.map((light) => (
        <RoomLight
          key={light.id}
          room={room}
          fixture={light}
          yOffset={yOffset}
          floorHeight={room.wallHeight}
          onSelect={onSelect}
        />
      ))}
    </group>
  );
}

/**
 * A simple placeable item — one colored box, not a 3D model. `item.x`/`z` are
 * room-relative (offset from the room's own origin corner), unlike rooms/
 * fixtures which use absolute floor-plan coordinates — this mirrors how
 * openings are relative to their wall. See docs/prd/house.md.
 */
function FurnitureBox({
  room,
  item,
  yOffset,
  onSelect,
}: {
  room: RoomModel;
  item: FurnitureModel;
  yOffset: number;
  onSelect?: (selection: HouseSelection) => void;
}) {
  const rotY = (item.rotationDegrees * Math.PI) / 180;
  const color = item.color ?? FURNITURE_CATEGORY_COLORS[item.category];
  const materialProps = item.material ? MATERIAL_PRESETS[item.material] : FURNITURE_MATERIAL_PROPS;

  return (
    <group position={[room.x + item.x, yOffset, room.z + item.z]} rotation={[0, rotY, 0]}>
      <mesh
        castShadow
        receiveShadow
        position={[item.width / 2, item.height / 2, item.depth / 2]}
        {...selectableProps(onSelect, { kind: "furniture", id: item.id })}
      >
        <boxGeometry args={[item.width, item.height, item.depth]} />
        <meshStandardMaterial color={color} {...materialProps} />
      </mesh>
    </group>
  );
}

/**
 * An actual light source — a small fixture marker plus a real `pointLight`
 * that illuminates the room, unlike `FixtureMarker` (plumbing/electrical
 * points, markers only). `fixture.x`/`z` are room-relative, same as
 * furniture. Mounting height defaults per `type` when not set.
 */
function RoomLight({
  room,
  fixture,
  yOffset,
  floorHeight,
  onSelect,
}: {
  room: RoomModel;
  fixture: LightFixtureModel;
  yOffset: number;
  floorHeight: number;
  onSelect?: (selection: HouseSelection) => void;
}) {
  const height = Math.min(fixture.height ?? DEFAULT_LIGHT_HEIGHT[fixture.type], floorHeight);
  const color = fixture.color ?? DEFAULT_LIGHT_COLOR;
  const intensity = fixture.intensity ?? DEFAULT_LIGHT_INTENSITY;
  const position: [number, number, number] = [
    room.x + fixture.x,
    yOffset + height,
    room.z + fixture.z,
  ];

  return (
    <group>
      <mesh
        castShadow
        position={position}
        {...selectableProps(onSelect, { kind: "lightFixture", id: fixture.id })}
      >
        <sphereGeometry args={[LIGHT_FIXTURE_MARKER_RADIUS, 12, 12]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.8}
          roughness={0.4}
        />
      </mesh>
      {/* No castShadow — each shadow-casting point light is a full extra
          shadow-map render pass, and a room can have several fixtures. The
          directional light (see Scene) is the only shadow caster. */}
      <pointLight position={position} color={color} intensity={intensity} distance={6} decay={2} />
    </group>
  );
}

/**
 * A door/window leaf, recessed inside its wall's real CSG-cut hole (see
 * `Wall`'s `cutoutGeometry`) rather than glued on top of a solid wall as a
 * flat external panel — the leaf sits centered in the wall's thickness, at
 * the same position/size the cutout used, so it reads as filling the hole.
 */
function OpeningPanel({
  room,
  opening,
  yOffset,
  onSelect,
}: {
  room: RoomModel;
  opening: OpeningModel;
  yOffset: number;
  onSelect?: (selection: HouseSelection) => void;
}) {
  const isDoor = opening.type === "door";
  const height = opening.height ?? (isDoor ? DEFAULT_DOOR_HEIGHT : DEFAULT_WINDOW_HEIGHT);
  const sill = opening.sillHeight ?? (isDoor ? DEFAULT_DOOR_SILL : DEFAULT_WINDOW_SILL);
  const panelY = yOffset + sill + height / 2;
  const color = OPENING_COLORS[opening.type];

  const materialProps = isDoor ? WALL_MATERIAL_PROPS : { roughness: 0.1, metalness: 0.1 };
  const selectProps = selectableProps(onSelect, { kind: "opening", id: opening.id });

  if (opening.wall === "north" || opening.wall === "south") {
    const centerX = room.x + opening.offset + opening.width / 2;
    const z = opening.wall === "north" ? room.z : room.z + room.depth;
    return (
      <mesh castShadow position={[centerX, panelY, z]} {...selectProps}>
        <boxGeometry args={[opening.width, height, OPENING_PANEL_THICKNESS]} />
        <meshStandardMaterial color={color} {...materialProps} />
      </mesh>
    );
  }

  const centerZ = room.z + opening.offset + opening.width / 2;
  const x = opening.wall === "west" ? room.x : room.x + room.width;
  return (
    <mesh castShadow position={[x, panelY, centerZ]} {...selectProps}>
      <boxGeometry args={[OPENING_PANEL_THICKNESS, height, opening.width]} />
      <meshStandardMaterial color={color} {...materialProps} />
    </mesh>
  );
}

/**
 * A rail alongside a stair flight, in the flight's own tilted local frame
 * (see `StairFlight`) so it follows the slope automatically. `side` is ±1 —
 * which of the flight's two lengthwise edges (as seen facing up the stair).
 */
function StairRail({
  slantLength,
  width,
  thickness,
  side,
  railingHeight,
}: {
  slantLength: number;
  width: number;
  thickness: number;
  side: number;
  railingHeight: number;
}) {
  const z = side * (width / 2 - RAIL_BAR_THICKNESS / 2);
  const barY = thickness / 2 + railingHeight;

  return (
    <group>
      <mesh castShadow position={[slantLength / 2, barY, z]}>
        <boxGeometry args={[slantLength, RAIL_BAR_THICKNESS, RAIL_BAR_THICKNESS]} />
        <meshStandardMaterial color={RAILING_COLOR} {...RAILING_MATERIAL_PROPS} />
      </mesh>
      {[0, slantLength].map((x) => (
        <mesh key={x} castShadow position={[x, thickness / 2 + railingHeight / 2, z]}>
          <boxGeometry args={[RAIL_BAR_THICKNESS, railingHeight, RAIL_BAR_THICKNESS]} />
          <meshStandardMaterial color={RAILING_COLOR} {...RAILING_MATERIAL_PROPS} />
        </mesh>
      ))}
    </group>
  );
}

/** One straight flight, drawn as a single sloped box from its `fromFloor` to its `toFloor`, with an optional rail on one/both/neither side. See docs/prd/house.md. */
function StairFlight({ stair }: { stair: StairModel }) {
  const rise = stair.toY - stair.fromY;
  const slantLength = Math.sqrt(stair.run * stair.run + rise * rise);
  const tiltAngle = Math.atan2(rise, stair.run);
  const rotY = (stair.rotationDegrees * Math.PI) / 180;
  const thickness = 0.15;
  const railingHeight = stair.railingHeight ?? DEFAULT_STAIR_RAILING_HEIGHT;
  const railSides =
    stair.railingSide === "both"
      ? [-1, 1]
      : stair.railingSide === "left"
        ? [-1]
        : stair.railingSide === "right"
          ? [1]
          : [];

  return (
    <group position={[stair.x, stair.fromY, stair.z]} rotation={[0, rotY, 0]}>
      <group rotation={[0, 0, tiltAngle]}>
        <mesh castShadow receiveShadow position={[slantLength / 2, 0, 0]}>
          <boxGeometry args={[slantLength, thickness, stair.width]} />
          <meshStandardMaterial color="#9a9a9a" {...STAIR_MATERIAL_PROPS} />
        </mesh>
        {railSides.map((side) => (
          <StairRail
            key={side}
            slantLength={slantLength}
            width={stair.width}
            thickness={thickness}
            side={side}
            railingHeight={railingHeight}
          />
        ))}
      </group>
    </group>
  );
}

function FixtureMarker({ fixture, yOffset }: { fixture: FixtureModel; yOffset: number }) {
  return (
    <mesh castShadow receiveShadow position={[fixture.x, yOffset + 0.15, fixture.z]}>
      <cylinderGeometry args={[0.2, 0.2, 0.3, 12]} />
      <meshStandardMaterial
        color={FIXTURE_CATEGORY_COLORS[fixture.category]}
        {...FIXTURE_MATERIAL_PROPS}
      />
    </mesh>
  );
}

/** A gabled roof: two panels hinged at the eaves, tilting up to meet at a ridge running along the footprint's longer axis. `hip` uses this same shape for v1 — an approximation, not true hip geometry. */
function PitchedRoof({ model }: { model: HouseModel }) {
  const { footprint, roofBaseY, project } = model;
  if (!footprint) return null;

  const width = footprint.maxX - footprint.minX + ROOF_OVERHANG * 2;
  const depth = footprint.maxZ - footprint.minZ + ROOF_OVERHANG * 2;
  const centerX = (footprint.minX + footprint.maxX) / 2;
  const centerZ = (footprint.minZ + footprint.maxZ) / 2;
  const ridgeAlongX = width >= depth;

  const halfSpan = (ridgeAlongX ? depth : width) / 2;
  const ridgeLength = ridgeAlongX ? width : depth;
  const pitch = project.roofPitchDegrees ?? DEFAULT_ROOF_PITCH_DEGREES;
  const rise = halfSpan * Math.tan((pitch * Math.PI) / 180);
  const slantLength = Math.sqrt(halfSpan * halfSpan + rise * rise);
  const tiltAngle = Math.atan2(rise, halfSpan);

  return (
    <group position={[centerX, roofBaseY, centerZ]}>
      {[-1, 1].map((side) => (
        <group
          key={side}
          rotation={ridgeAlongX ? [side * tiltAngle, 0, 0] : [0, 0, -side * tiltAngle]}
        >
          <mesh
            castShadow
            receiveShadow
            position={
              ridgeAlongX ? [0, 0, side * slantLength * 0.5] : [side * slantLength * 0.5, 0, 0]
            }
          >
            <boxGeometry
              args={
                ridgeAlongX ? [ridgeLength, 0.15, slantLength] : [slantLength, 0.15, ridgeLength]
              }
            />
            <meshStandardMaterial color="#8d6a52" {...ROOF_MATERIAL_PROPS} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function FlatRoof({ model }: { model: HouseModel }) {
  const { footprint, roofBaseY } = model;
  if (!footprint) return null;

  const width = footprint.maxX - footprint.minX + ROOF_OVERHANG * 2;
  const depth = footprint.maxZ - footprint.minZ + ROOF_OVERHANG * 2;
  const centerX = (footprint.minX + footprint.maxX) / 2;
  const centerZ = (footprint.minZ + footprint.maxZ) / 2;

  return (
    <mesh castShadow receiveShadow position={[centerX, roofBaseY + 0.1, centerZ]}>
      <boxGeometry args={[width, 0.2, depth]} />
      <meshStandardMaterial color="#8d6a52" {...ROOF_MATERIAL_PROPS} />
    </mesh>
  );
}

/**
 * Fixed North/South/East/West orthographic views — an elevation look at one
 * exterior face, not a full 2D CAD elevation drawing (no dimension lines).
 * Frustum half-extents come from the model's footprint size, widened by the
 * canvas's own aspect ratio so the model isn't cropped in a wide container.
 */
function ElevationCamera({
  direction,
  center,
  worldSize,
}: {
  direction: Exclude<ViewMode, "3d">;
  center: [number, number, number];
  worldSize: number;
}) {
  const { size } = useThree();
  const aspect = size.width / size.height || 1;
  const halfHeight = worldSize * 0.75;
  const halfWidth = halfHeight * aspect;
  const dist = worldSize * 3;
  const [cx, cy, cz] = center;

  const configs: Record<
    Exclude<ViewMode, "3d">,
    { position: [number, number, number]; rotation: [number, number, number] }
  > = {
    north: { position: [cx, cy, cz - dist], rotation: [0, Math.PI, 0] },
    south: { position: [cx, cy, cz + dist], rotation: [0, 0, 0] },
    east: { position: [cx + dist, cy, cz], rotation: [0, Math.PI / 2, 0] },
    west: { position: [cx - dist, cy, cz], rotation: [0, -Math.PI / 2, 0] },
  };
  const { position, rotation } = configs[direction];

  return (
    <OrthographicCamera
      makeDefault
      position={position}
      rotation={rotation}
      left={-halfWidth}
      right={halfWidth}
      top={halfHeight}
      bottom={-halfHeight}
      near={0.1}
      far={dist * 2}
    />
  );
}

function Scene({
  model,
  viewMode,
  onSelect,
}: {
  model: HouseModel;
  viewMode: ViewMode;
  onSelect?: (selection: HouseSelection) => void;
}) {
  const footprint = model.footprint;
  const size = footprint
    ? Math.max(footprint.maxX - footprint.minX, footprint.maxZ - footprint.minZ, 5)
    : 10;
  const centerX = footprint ? (footprint.minX + footprint.maxX) / 2 : 0;
  const centerZ = footprint ? (footprint.minZ + footprint.maxZ) / 2 : 0;
  const centerY = model.roofBaseY / 2;

  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight
        castShadow
        position={[centerX + size, size * 1.8, centerZ + size]}
        target-position={[centerX, 0, centerZ]}
        intensity={1.3}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-size * 1.5}
        shadow-camera-right={size * 1.5}
        shadow-camera-top={size * 1.5}
        shadow-camera-bottom={-size * 1.5}
        shadow-camera-near={0.5}
        shadow-camera-far={size * 6}
        shadow-bias={-0.0005}
      />
      <Grid
        args={[size * 3, size * 3]}
        position={[0, -0.01, 0]}
        cellColor="#d4d4d8"
        sectionColor="#a1a1aa"
      />
      <ContactShadows
        position={[centerX, 0, centerZ]}
        opacity={0.45}
        scale={size * 4}
        blur={2.2}
        far={size * 1.5}
        resolution={512}
        color="#1a1a1a"
      />
      {model.floors.map((floor) => (
        <group key={floor.id}>
          {floor.rooms.map((room) => (
            <RoomWalls key={room.id} room={room} yOffset={floor.yOffset} onSelect={onSelect} />
          ))}
          {floor.fixtures.map((fixture) => (
            <FixtureMarker key={fixture.id} fixture={fixture} yOffset={floor.yOffset} />
          ))}
        </group>
      ))}
      {model.stairs.map((stair) => (
        <StairFlight key={stair.id} stair={stair} />
      ))}
      {model.project.roofType === "flat" ? (
        <FlatRoof model={model} />
      ) : (
        <PitchedRoof model={model} />
      )}
      {viewMode === "3d" ? (
        // Keyed on the rounded footprint size: drei's helper camera components
        // apply their props every render, but re-keying forces a fresh mount
        // (and thus a fresh initial position) only when the model's size
        // actually changes, rather than fighting the user's manual orbit on
        // every unrelated re-render.
        <PerspectiveCamera
          key={Math.round(size)}
          makeDefault
          position={[size * 1.4, size * 1.2, size * 1.4]}
          fov={50}
        />
      ) : (
        <ElevationCamera
          key={viewMode}
          direction={viewMode}
          center={[centerX, centerY, centerZ]}
          worldSize={size}
        />
      )}
      <OrbitControls
        makeDefault
        enableRotate={viewMode === "3d"}
        target={[centerX, centerY, centerZ]}
      />
    </>
  );
}

export function HouseViewer({
  model,
  onSelect,
}: {
  model: HouseModel;
  onSelect?: (selection: HouseSelection) => void;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("3d");
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);

  function handleExport() {
    const canvas = canvasElRef.current;
    if (!canvas) return;
    downloadDataUrl(canvas.toDataURL("image/png"), `${model.project.name}-${viewMode}.png`);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        {VIEW_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`rounded-md border px-3 py-1 text-sm ${
              viewMode === mode
                ? "border-foreground bg-foreground text-background"
                : "border-input bg-background text-foreground"
            }`}
          >
            {VIEW_MODE_LABELS[mode]}
          </button>
        ))}
        <button
          type="button"
          onClick={handleExport}
          className="border-input bg-background text-foreground ml-auto rounded-md border px-3 py-1 text-sm"
        >
          Export PNG
        </button>
      </div>
      <div className="h-120 w-full overflow-hidden rounded-xl ring-1 ring-foreground/10">
        {/* `preserveDrawingBuffer` keeps the last rendered frame in the WebGL
            buffer after paint — without it, `canvas.toDataURL()` in `handleExport`
            can read back a blank/black image since the buffer is cleared post-render. */}
        <Canvas
          shadows
          gl={{ preserveDrawingBuffer: true }}
          onCreated={(state) => (canvasElRef.current = state.gl.domElement)}
        >
          <Scene model={model} viewMode={viewMode} onSelect={onSelect} />
        </Canvas>
      </div>
    </div>
  );
}
