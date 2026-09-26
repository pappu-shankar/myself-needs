export const ROOF_TYPES = ["flat", "gabled", "hip"] as const;
export type RoofType = (typeof ROOF_TYPES)[number];

export const ROOM_TYPES = [
  "bedroom",
  "bathroom",
  "kitchen",
  "living",
  "dining",
  "hallway",
  "garage",
  "balcony",
  "other",
] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

/** Which of a room's 4 walls (see house-viewer.tsx's `RoomWalls`) an opening sits on. */
export const WALL_SIDES = ["north", "south", "east", "west"] as const;
export type WallSide = (typeof WALL_SIDES)[number];

export const OPENING_TYPES = ["door", "window"] as const;
export type OpeningType = (typeof OPENING_TYPES)[number];

export const DOOR_STYLES = ["hinged", "sliding", "french", "flush", "louvered"] as const;
export type DoorStyle = (typeof DOOR_STYLES)[number];

export const WINDOW_STYLES = ["fixed", "casement", "sliding", "awning", "louvered"] as const;
export type WindowStyle = (typeof WINDOW_STYLES)[number];

/** An override for one of a room's walls — the default (no row) is a solid wall in the room's default color. */
export const WALL_STYLES = ["open", "railing", "painted"] as const;
export type WallStyleValue = (typeof WALL_STYLES)[number];

export const FURNITURE_CATEGORIES = [
  "bed",
  "sofa",
  "table",
  "chair",
  "wardrobe",
  "desk",
  "tv_unit",
  "other",
] as const;
export type FurnitureCategory = (typeof FURNITURE_CATEGORIES)[number];

export const LIGHT_FIXTURE_TYPES = ["ceiling", "wall", "pendant", "floor_lamp"] as const;
export type LightFixtureType = (typeof LIGHT_FIXTURE_TYPES)[number];

export const STAIR_RAILING_SIDES = ["none", "left", "right", "both"] as const;
export type StairRailingSide = (typeof STAIR_RAILING_SIDES)[number];

/** A visual finish, mapped to a roughness/metalness preset in the viewer — no textures/HDRI, just tuned PBR params. See docs/prd/house.md. */
export const MATERIAL_FINISHES = ["matte", "satin", "gloss", "metal"] as const;
export type MaterialFinish = (typeof MATERIAL_FINISHES)[number];

export const FIXTURE_CATEGORIES = [
  "water_inlet",
  "sump",
  "septic_tank",
  "overhead_tank",
  "drain_outlet",
  "electrical_panel",
  "other",
] as const;
export type FixtureCategory = (typeof FIXTURE_CATEGORIES)[number];
