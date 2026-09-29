"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUnlocked } from "@/modules/core/session/guard";
import { createProject, updateProject } from "./service/projects";
import { createFloor, updateFloor } from "./service/floors";
import { createRoom, updateRoom } from "./service/rooms";
import { createOpening, updateOpening } from "./service/openings";
import { createStair, updateStair } from "./service/stairs";
import { createFixture, updateFixture } from "./service/fixtures";
import { createWallStyle, updateWallStyle } from "./service/wall-styles";
import { createFurniture, updateFurniture } from "./service/furniture";
import { createLightFixture, updateLightFixture } from "./service/light-fixtures";
import {
  ROOF_TYPES,
  ROOM_TYPES,
  WALL_SIDES,
  OPENING_TYPES,
  DOOR_STYLES,
  WINDOW_STYLES,
  WALL_STYLES,
  STAIR_RAILING_SIDES,
  FIXTURE_CATEGORIES,
  FURNITURE_CATEGORIES,
  LIGHT_FIXTURE_TYPES,
  MATERIAL_FINISHES,
} from "./types";

const projectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  notes: z.string().optional(),
  roofType: z.enum(ROOF_TYPES),
  roofPitchDegrees: z.coerce.number().optional(),
});

export interface AddProjectState {
  error?: string;
}

function parseProjectForm(formData: FormData) {
  return projectSchema.safeParse({
    name: formData.get("name"),
    notes: formData.get("notes") || undefined,
    roofType: formData.get("roofType"),
    roofPitchDegrees: formData.get("roofPitchDegrees") || undefined,
  });
}

export async function addProjectAction(
  _prevState: AddProjectState,
  formData: FormData,
): Promise<AddProjectState> {
  await requireUnlocked();
  const parsed = parseProjectForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid project" };

  createProject({
    name: parsed.data.name,
    notes: parsed.data.notes ?? null,
    roofType: parsed.data.roofType,
    roofPitchDegrees: parsed.data.roofPitchDegrees ?? null,
  });

  revalidatePath("/house");
  return {};
}

export async function updateProjectAction(
  _prevState: AddProjectState,
  formData: FormData,
): Promise<AddProjectState> {
  await requireUnlocked();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { error: "Invalid project" };

  const parsed = parseProjectForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid project" };

  updateProject(id, {
    name: parsed.data.name,
    notes: parsed.data.notes ?? null,
    roofType: parsed.data.roofType,
    roofPitchDegrees: parsed.data.roofPitchDegrees ?? null,
  });

  revalidatePath("/house");
  return {};
}

const floorSchema = z.object({
  projectId: z.coerce.number().int(),
  name: z.string().min(1, "Name is required"),
  level: z.coerce.number().int(),
  floorHeight: z.coerce.number().positive("Must be greater than 0"),
});

export interface AddFloorState {
  error?: string;
}

function parseFloorForm(formData: FormData) {
  return floorSchema.safeParse({
    projectId: formData.get("projectId"),
    name: formData.get("name"),
    level: formData.get("level"),
    floorHeight: formData.get("floorHeight"),
  });
}

export async function addFloorAction(
  _prevState: AddFloorState,
  formData: FormData,
): Promise<AddFloorState> {
  await requireUnlocked();
  const parsed = parseFloorForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid floor" };

  createFloor(parsed.data);
  revalidatePath("/house");
  return {};
}

export async function updateFloorAction(
  _prevState: AddFloorState,
  formData: FormData,
): Promise<AddFloorState> {
  await requireUnlocked();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { error: "Invalid floor" };

  const parsed = parseFloorForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid floor" };

  updateFloor(id, parsed.data);
  revalidatePath("/house");
  return {};
}

const roomSchema = z.object({
  floorId: z.coerce.number().int(),
  name: z.string().min(1, "Name is required"),
  type: z.enum(ROOM_TYPES),
  x: z.coerce.number(),
  z: z.coerce.number(),
  width: z.coerce.number().positive("Must be greater than 0"),
  depth: z.coerce.number().positive("Must be greater than 0"),
  wallHeight: z.coerce.number().positive().optional(),
  color: z.string().optional(),
  material: z.enum(MATERIAL_FINISHES).optional(),
  notes: z.string().optional(),
});

export interface AddRoomState {
  error?: string;
  /** Set on a successful add — lets a caller that invokes this action directly (not through `useActionState`/a form, e.g. draw-to-create in floor-plan-2d.tsx) immediately select the new room. Forms ignore it, same as they already ignore any other unused state field. */
  id?: number;
}

function parseRoomForm(formData: FormData) {
  return roomSchema.safeParse({
    floorId: formData.get("floorId"),
    name: formData.get("name"),
    type: formData.get("type"),
    x: formData.get("x") || 0,
    z: formData.get("z") || 0,
    width: formData.get("width"),
    depth: formData.get("depth"),
    wallHeight: formData.get("wallHeight") || undefined,
    color: formData.get("color") || undefined,
    material: formData.get("material") || undefined,
    notes: formData.get("notes") || undefined,
  });
}

export async function addRoomAction(
  _prevState: AddRoomState,
  formData: FormData,
): Promise<AddRoomState> {
  await requireUnlocked();
  const parsed = parseRoomForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid room" };

  const created = createRoom({
    floorId: parsed.data.floorId,
    name: parsed.data.name,
    type: parsed.data.type,
    x: parsed.data.x,
    z: parsed.data.z,
    width: parsed.data.width,
    depth: parsed.data.depth,
    wallHeight: parsed.data.wallHeight ?? null,
    color: parsed.data.color ?? null,
    material: parsed.data.material ?? null,
    notes: parsed.data.notes ?? null,
  });

  revalidatePath("/house");
  return { id: created.id };
}

export async function updateRoomAction(
  _prevState: AddRoomState,
  formData: FormData,
): Promise<AddRoomState> {
  await requireUnlocked();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { error: "Invalid room" };

  const parsed = parseRoomForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid room" };

  updateRoom(id, {
    floorId: parsed.data.floorId,
    name: parsed.data.name,
    type: parsed.data.type,
    x: parsed.data.x,
    z: parsed.data.z,
    width: parsed.data.width,
    depth: parsed.data.depth,
    wallHeight: parsed.data.wallHeight ?? null,
    color: parsed.data.color ?? null,
    material: parsed.data.material ?? null,
    notes: parsed.data.notes ?? null,
  });

  revalidatePath("/house");
  return {};
}

const openingSchema = z
  .object({
    roomId: z.coerce.number().int(),
    wall: z.enum(WALL_SIDES),
    type: z.enum(OPENING_TYPES),
    style: z.enum([...DOOR_STYLES, ...WINDOW_STYLES]).optional(),
    offset: z.coerce.number(),
    width: z.coerce.number().positive("Must be greater than 0"),
    height: z.coerce.number().positive().optional(),
    sillHeight: z.coerce.number().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (data) =>
      !data.style ||
      (data.type === "door"
        ? (DOOR_STYLES as readonly string[])
        : (WINDOW_STYLES as readonly string[])
      ).includes(data.style),
    {
      message: "Style doesn't match the opening type",
      path: ["style"],
    },
  );

export interface AddOpeningState {
  error?: string;
}

function parseOpeningForm(formData: FormData) {
  return openingSchema.safeParse({
    roomId: formData.get("roomId"),
    wall: formData.get("wall"),
    type: formData.get("type"),
    style: formData.get("style") || undefined,
    offset: formData.get("offset") || 0,
    width: formData.get("width"),
    height: formData.get("height") || undefined,
    sillHeight: formData.get("sillHeight") || undefined,
    notes: formData.get("notes") || undefined,
  });
}

export async function addOpeningAction(
  _prevState: AddOpeningState,
  formData: FormData,
): Promise<AddOpeningState> {
  await requireUnlocked();
  const parsed = parseOpeningForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid opening" };

  createOpening({
    roomId: parsed.data.roomId,
    wall: parsed.data.wall,
    type: parsed.data.type,
    style: parsed.data.style ?? null,
    offset: parsed.data.offset,
    width: parsed.data.width,
    height: parsed.data.height ?? null,
    sillHeight: parsed.data.sillHeight ?? null,
    notes: parsed.data.notes ?? null,
  });

  revalidatePath("/house");
  return {};
}

export async function updateOpeningAction(
  _prevState: AddOpeningState,
  formData: FormData,
): Promise<AddOpeningState> {
  await requireUnlocked();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { error: "Invalid opening" };

  const parsed = parseOpeningForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid opening" };

  updateOpening(id, {
    roomId: parsed.data.roomId,
    wall: parsed.data.wall,
    type: parsed.data.type,
    style: parsed.data.style ?? null,
    offset: parsed.data.offset,
    width: parsed.data.width,
    height: parsed.data.height ?? null,
    sillHeight: parsed.data.sillHeight ?? null,
    notes: parsed.data.notes ?? null,
  });

  revalidatePath("/house");
  return {};
}

const stairSchema = z.object({
  projectId: z.coerce.number().int(),
  fromFloorId: z.coerce.number().int(),
  toFloorId: z.coerce.number().int(),
  name: z.string().min(1, "Name is required"),
  x: z.coerce.number(),
  z: z.coerce.number(),
  width: z.coerce.number().positive("Must be greater than 0"),
  run: z.coerce.number().positive("Must be greater than 0"),
  rotationDegrees: z.coerce.number().optional(),
  railingSide: z.enum(STAIR_RAILING_SIDES).optional(),
  railingHeight: z.coerce.number().positive().optional(),
  notes: z.string().optional(),
});

export interface AddStairState {
  error?: string;
}

function parseStairForm(formData: FormData) {
  return stairSchema.safeParse({
    projectId: formData.get("projectId"),
    fromFloorId: formData.get("fromFloorId"),
    toFloorId: formData.get("toFloorId"),
    name: formData.get("name"),
    x: formData.get("x") || 0,
    z: formData.get("z") || 0,
    width: formData.get("width"),
    run: formData.get("run"),
    rotationDegrees: formData.get("rotationDegrees") || undefined,
    railingSide: formData.get("railingSide") || undefined,
    railingHeight: formData.get("railingHeight") || undefined,
    notes: formData.get("notes") || undefined,
  });
}

export async function addStairAction(
  _prevState: AddStairState,
  formData: FormData,
): Promise<AddStairState> {
  await requireUnlocked();
  const parsed = parseStairForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid stair" };

  createStair({
    projectId: parsed.data.projectId,
    fromFloorId: parsed.data.fromFloorId,
    toFloorId: parsed.data.toFloorId,
    name: parsed.data.name,
    x: parsed.data.x,
    z: parsed.data.z,
    width: parsed.data.width,
    run: parsed.data.run,
    rotationDegrees: parsed.data.rotationDegrees ?? 0,
    railingSide: parsed.data.railingSide ?? "both",
    railingHeight: parsed.data.railingHeight ?? null,
    notes: parsed.data.notes ?? null,
  });

  revalidatePath("/house");
  return {};
}

export async function updateStairAction(
  _prevState: AddStairState,
  formData: FormData,
): Promise<AddStairState> {
  await requireUnlocked();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { error: "Invalid stair" };

  const parsed = parseStairForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid stair" };

  updateStair(id, {
    projectId: parsed.data.projectId,
    fromFloorId: parsed.data.fromFloorId,
    toFloorId: parsed.data.toFloorId,
    name: parsed.data.name,
    x: parsed.data.x,
    z: parsed.data.z,
    width: parsed.data.width,
    run: parsed.data.run,
    rotationDegrees: parsed.data.rotationDegrees ?? 0,
    railingSide: parsed.data.railingSide ?? "both",
    railingHeight: parsed.data.railingHeight ?? null,
    notes: parsed.data.notes ?? null,
  });

  revalidatePath("/house");
  return {};
}

const fixtureSchema = z.object({
  floorId: z.coerce.number().int(),
  name: z.string().min(1, "Name is required"),
  category: z.enum(FIXTURE_CATEGORIES),
  x: z.coerce.number(),
  z: z.coerce.number(),
  notes: z.string().optional(),
});

export interface AddFixtureState {
  error?: string;
}

function parseFixtureForm(formData: FormData) {
  return fixtureSchema.safeParse({
    floorId: formData.get("floorId"),
    name: formData.get("name"),
    category: formData.get("category"),
    x: formData.get("x") || 0,
    z: formData.get("z") || 0,
    notes: formData.get("notes") || undefined,
  });
}

export async function addFixtureAction(
  _prevState: AddFixtureState,
  formData: FormData,
): Promise<AddFixtureState> {
  await requireUnlocked();
  const parsed = parseFixtureForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid fixture" };

  createFixture({
    floorId: parsed.data.floorId,
    name: parsed.data.name,
    category: parsed.data.category,
    x: parsed.data.x,
    z: parsed.data.z,
    notes: parsed.data.notes ?? null,
  });

  revalidatePath("/house");
  return {};
}

export async function updateFixtureAction(
  _prevState: AddFixtureState,
  formData: FormData,
): Promise<AddFixtureState> {
  await requireUnlocked();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { error: "Invalid fixture" };

  const parsed = parseFixtureForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid fixture" };

  updateFixture(id, {
    floorId: parsed.data.floorId,
    name: parsed.data.name,
    category: parsed.data.category,
    x: parsed.data.x,
    z: parsed.data.z,
    notes: parsed.data.notes ?? null,
  });

  revalidatePath("/house");
  return {};
}

const wallStyleSchema = z.object({
  roomId: z.coerce.number().int(),
  wall: z.enum(WALL_SIDES),
  style: z.enum(WALL_STYLES),
  railingHeight: z.coerce.number().positive().optional(),
  color: z.string().optional(),
  notes: z.string().optional(),
});

export interface AddWallStyleState {
  error?: string;
}

function parseWallStyleForm(formData: FormData) {
  return wallStyleSchema.safeParse({
    roomId: formData.get("roomId"),
    wall: formData.get("wall"),
    style: formData.get("style"),
    railingHeight: formData.get("railingHeight") || undefined,
    color: formData.get("color") || undefined,
    notes: formData.get("notes") || undefined,
  });
}

export async function addWallStyleAction(
  _prevState: AddWallStyleState,
  formData: FormData,
): Promise<AddWallStyleState> {
  await requireUnlocked();
  const parsed = parseWallStyleForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid wall style" };

  createWallStyle({
    roomId: parsed.data.roomId,
    wall: parsed.data.wall,
    style: parsed.data.style,
    railingHeight: parsed.data.railingHeight ?? null,
    color: parsed.data.color ?? null,
    notes: parsed.data.notes ?? null,
  });

  revalidatePath("/house");
  return {};
}

export async function updateWallStyleAction(
  _prevState: AddWallStyleState,
  formData: FormData,
): Promise<AddWallStyleState> {
  await requireUnlocked();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { error: "Invalid wall style" };

  const parsed = parseWallStyleForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid wall style" };

  updateWallStyle(id, {
    roomId: parsed.data.roomId,
    wall: parsed.data.wall,
    style: parsed.data.style,
    railingHeight: parsed.data.railingHeight ?? null,
    color: parsed.data.color ?? null,
    notes: parsed.data.notes ?? null,
  });

  revalidatePath("/house");
  return {};
}

const furnitureSchema = z.object({
  roomId: z.coerce.number().int(),
  name: z.string().min(1, "Name is required"),
  category: z.enum(FURNITURE_CATEGORIES),
  x: z.coerce.number(),
  z: z.coerce.number(),
  width: z.coerce.number().positive("Must be greater than 0"),
  depth: z.coerce.number().positive("Must be greater than 0"),
  height: z.coerce.number().positive("Must be greater than 0"),
  rotationDegrees: z.coerce.number().optional(),
  color: z.string().optional(),
  material: z.enum(MATERIAL_FINISHES).optional(),
  notes: z.string().optional(),
});

export interface AddFurnitureState {
  error?: string;
  /** Set on a successful add — see `AddRoomState.id`'s doc comment; same use (catalog drag-and-drop in floor-plan-2d.tsx calling this action directly, not through a form). */
  id?: number;
}

function parseFurnitureForm(formData: FormData) {
  return furnitureSchema.safeParse({
    roomId: formData.get("roomId"),
    name: formData.get("name"),
    category: formData.get("category"),
    x: formData.get("x") || 0,
    z: formData.get("z") || 0,
    width: formData.get("width"),
    depth: formData.get("depth"),
    height: formData.get("height"),
    rotationDegrees: formData.get("rotationDegrees") || undefined,
    color: formData.get("color") || undefined,
    material: formData.get("material") || undefined,
    notes: formData.get("notes") || undefined,
  });
}

export async function addFurnitureAction(
  _prevState: AddFurnitureState,
  formData: FormData,
): Promise<AddFurnitureState> {
  await requireUnlocked();
  const parsed = parseFurnitureForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid furniture" };

  const created = createFurniture({
    roomId: parsed.data.roomId,
    name: parsed.data.name,
    category: parsed.data.category,
    x: parsed.data.x,
    z: parsed.data.z,
    width: parsed.data.width,
    depth: parsed.data.depth,
    height: parsed.data.height,
    rotationDegrees: parsed.data.rotationDegrees ?? 0,
    color: parsed.data.color ?? null,
    material: parsed.data.material ?? null,
    notes: parsed.data.notes ?? null,
  });

  revalidatePath("/house");
  return { id: created.id };
}

export async function updateFurnitureAction(
  _prevState: AddFurnitureState,
  formData: FormData,
): Promise<AddFurnitureState> {
  await requireUnlocked();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { error: "Invalid furniture" };

  const parsed = parseFurnitureForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid furniture" };

  updateFurniture(id, {
    roomId: parsed.data.roomId,
    name: parsed.data.name,
    category: parsed.data.category,
    x: parsed.data.x,
    z: parsed.data.z,
    width: parsed.data.width,
    depth: parsed.data.depth,
    height: parsed.data.height,
    rotationDegrees: parsed.data.rotationDegrees ?? 0,
    color: parsed.data.color ?? null,
    material: parsed.data.material ?? null,
    notes: parsed.data.notes ?? null,
  });

  revalidatePath("/house");
  return {};
}

const lightFixtureSchema = z.object({
  roomId: z.coerce.number().int(),
  name: z.string().min(1, "Name is required"),
  type: z.enum(LIGHT_FIXTURE_TYPES),
  x: z.coerce.number(),
  z: z.coerce.number(),
  height: z.coerce.number().positive().optional(),
  color: z.string().optional(),
  intensity: z.coerce.number().positive().optional(),
  notes: z.string().optional(),
});

export interface AddLightFixtureState {
  error?: string;
}

function parseLightFixtureForm(formData: FormData) {
  return lightFixtureSchema.safeParse({
    roomId: formData.get("roomId"),
    name: formData.get("name"),
    type: formData.get("type"),
    x: formData.get("x") || 0,
    z: formData.get("z") || 0,
    height: formData.get("height") || undefined,
    color: formData.get("color") || undefined,
    intensity: formData.get("intensity") || undefined,
    notes: formData.get("notes") || undefined,
  });
}

export async function addLightFixtureAction(
  _prevState: AddLightFixtureState,
  formData: FormData,
): Promise<AddLightFixtureState> {
  await requireUnlocked();
  const parsed = parseLightFixtureForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid light fixture" };

  createLightFixture({
    roomId: parsed.data.roomId,
    name: parsed.data.name,
    type: parsed.data.type,
    x: parsed.data.x,
    z: parsed.data.z,
    height: parsed.data.height ?? null,
    color: parsed.data.color ?? null,
    intensity: parsed.data.intensity ?? null,
    notes: parsed.data.notes ?? null,
  });

  revalidatePath("/house");
  return {};
}

export async function updateLightFixtureAction(
  _prevState: AddLightFixtureState,
  formData: FormData,
): Promise<AddLightFixtureState> {
  await requireUnlocked();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return { error: "Invalid light fixture" };

  const parsed = parseLightFixtureForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid light fixture" };

  updateLightFixture(id, {
    roomId: parsed.data.roomId,
    name: parsed.data.name,
    type: parsed.data.type,
    x: parsed.data.x,
    z: parsed.data.z,
    height: parsed.data.height ?? null,
    color: parsed.data.color ?? null,
    intensity: parsed.data.intensity ?? null,
    notes: parsed.data.notes ?? null,
  });

  revalidatePath("/house");
  return {};
}
