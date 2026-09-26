"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createPhoto, getPhoto, updateSkinTone } from "./service/photos";
import { createOutfit, deleteOutfit } from "./service/outfits";
import { createGarment, deleteGarment } from "./service/garments";
import { createPhysique } from "./service/physiques";
import { scoreContrast } from "./service/lab-color";
import { PHOTO_MIME_TYPES, GARMENT_CATEGORIES } from "./types";

const HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export interface UploadPhotoState {
  error?: string;
  /** Set on a successful upload — lets the client navigate straight to the
   * new photo's editor. See house's AddRoomState.id for the same pattern. */
  photoId?: number;
}

export async function uploadPhotoAction(
  _prevState: UploadPhotoState,
  formData: FormData,
): Promise<UploadPhotoState> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photo to upload" };
  }
  if (!(PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { error: "Photo must be a JPEG, PNG, or WebP image" };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { error: "Photo must be under 15 MB" };
  }

  const widthPx = Number(formData.get("widthPx"));
  const heightPx = Number(formData.get("heightPx"));
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx <= 0 || heightPx <= 0) {
    return { error: "Missing photo dimensions" };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const created = createPhoto({
    bytes,
    originalName: file.name || null,
    mimeType: file.type as (typeof PHOTO_MIME_TYPES)[number],
    widthPx,
    heightPx,
  });

  revalidatePath("/fashion");
  return { photoId: created.id };
}

const skinToneSchema = z.object({
  photoId: z.coerce.number().int(),
  labL: z.coerce.number(),
  labA: z.coerce.number(),
  labB: z.coerce.number(),
});

export interface UpdateSkinToneState {
  error?: string;
}

/** Separate from uploadPhotoAction because skin-tone sampling only happens
 * after client-side pose/segmentation finishes running (async, post-
 * upload) — the photo row is created first so the upload flow doesn't
 * block on ML inference, then this action patches the sampled tone onto it. */
export async function updateSkinToneAction(
  _prevState: UpdateSkinToneState,
  formData: FormData,
): Promise<UpdateSkinToneState> {
  const parsed = skinToneSchema.safeParse({
    photoId: formData.get("photoId"),
    labL: formData.get("labL"),
    labA: formData.get("labA"),
    labB: formData.get("labB"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid skin tone" };

  updateSkinTone(parsed.data.photoId, {
    l: parsed.data.labL,
    a: parsed.data.labA,
    b: parsed.data.labB,
  });
  revalidatePath("/fashion");
  return {};
}

const outfitSchema = z.object({
  photoId: z.coerce.number().int(),
  name: z.string().min(1, "Name is required"),
  shirtColorHex: z.string().regex(HEX_COLOR_REGEX, "Must be a hex color like #d4a373"),
  pantsColorHex: z.string().regex(HEX_COLOR_REGEX, "Must be a hex color like #d4a373"),
  note: z.string().optional(),
});

export interface SaveOutfitState {
  error?: string;
  outfitId?: number;
}

export async function saveOutfitAction(
  _prevState: SaveOutfitState,
  formData: FormData,
): Promise<SaveOutfitState> {
  const parsed = outfitSchema.safeParse({
    photoId: formData.get("photoId"),
    name: formData.get("name"),
    shirtColorHex: formData.get("shirtColorHex"),
    pantsColorHex: formData.get("pantsColorHex"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid outfit" };

  const photo = getPhoto(parsed.data.photoId);
  if (!photo) return { error: "Photo not found" };

  // Contrast is recomputed here from the photo's cached skin tone rather
  // than trusted from the client's live preview, so a saved score can't
  // drift from — or be spoofed relative to — what's actually stored.
  const skinTone =
    photo.skinToneLabL !== null && photo.skinToneLabA !== null && photo.skinToneLabB !== null
      ? { l: photo.skinToneLabL, a: photo.skinToneLabA, b: photo.skinToneLabB }
      : null;

  const created = createOutfit({
    photoId: parsed.data.photoId,
    name: parsed.data.name,
    shirtColorHex: parsed.data.shirtColorHex,
    pantsColorHex: parsed.data.pantsColorHex,
    shirtContrastScore: skinTone ? scoreContrast(parsed.data.shirtColorHex, skinTone) : null,
    pantsContrastScore: skinTone ? scoreContrast(parsed.data.pantsColorHex, skinTone) : null,
    note: parsed.data.note ?? null,
  });

  revalidatePath("/fashion");
  return { outfitId: created.id };
}

const deleteOutfitSchema = z.object({ id: z.coerce.number().int() });

export interface DeleteOutfitState {
  error?: string;
}

export async function deleteOutfitAction(
  _prevState: DeleteOutfitState,
  formData: FormData,
): Promise<DeleteOutfitState> {
  const parsed = deleteOutfitSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid outfit" };

  deleteOutfit(parsed.data.id);
  revalidatePath("/fashion");
  return {};
}

const uploadGarmentFieldsSchema = z.object({
  category: z.enum(GARMENT_CATEGORIES),
  representativeColorLabL: z.coerce.number(),
  representativeColorLabA: z.coerce.number(),
  representativeColorLabB: z.coerce.number(),
  representativeColorHex: z.string().regex(HEX_COLOR_REGEX),
});

export interface UploadGarmentState {
  error?: string;
  garmentId?: number;
}

/**
 * Unlike uploadPhotoAction, this doesn't need a follow-up action for the
 * representative color the way skin tone does — extracting a garment's
 * color is cheap synchronous canvas math (client/garment-color.ts) with no
 * async model-loading dependency, so it's computed and submitted in the
 * same request as the file.
 */
export async function uploadGarmentAction(
  _prevState: UploadGarmentState,
  formData: FormData,
): Promise<UploadGarmentState> {
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a garment photo to upload" };
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return { error: "Photo must be under 15 MB" };
  }

  const parsed = uploadGarmentFieldsSchema.safeParse({
    category: formData.get("category"),
    representativeColorLabL: formData.get("representativeColorLabL"),
    representativeColorLabA: formData.get("representativeColorLabA"),
    representativeColorLabB: formData.get("representativeColorLabB"),
    representativeColorHex: formData.get("representativeColorHex"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid garment" };

  const bytes = Buffer.from(await file.arrayBuffer());
  const created = createGarment({
    bytes,
    originalName: file.name || null,
    category: parsed.data.category,
    representativeColor: {
      l: parsed.data.representativeColorLabL,
      a: parsed.data.representativeColorLabA,
      b: parsed.data.representativeColorLabB,
      hex: parsed.data.representativeColorHex,
    },
  });

  revalidatePath("/fashion/wardrobe");
  return { garmentId: created.id };
}

const deleteGarmentSchema = z.object({ id: z.coerce.number().int() });

export interface DeleteGarmentState {
  error?: string;
}

export async function deleteGarmentAction(
  _prevState: DeleteGarmentState,
  formData: FormData,
): Promise<DeleteGarmentState> {
  const parsed = deleteGarmentSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "Invalid garment" };

  deleteGarment(parsed.data.id);
  revalidatePath("/fashion/wardrobe");
  return {};
}

const savePhysiqueSchema = z.object({
  photoId: z.coerce.number().int(),
  ratiosJson: z.string().min(1),
  categoriesJson: z.string().min(1),
  description: z.string().min(1),
});

export interface SavePhysiqueState {
  error?: string;
}

/** Same lazy-patch pattern as updateSkinToneAction: the physique summary
 * is computed client-side right after pose/segmentation analysis
 * finishes, then persisted here so it doesn't need recomputing on every
 * later visit to this photo's character view. */
export async function savePhysiqueAction(
  _prevState: SavePhysiqueState,
  formData: FormData,
): Promise<SavePhysiqueState> {
  const parsed = savePhysiqueSchema.safeParse({
    photoId: formData.get("photoId"),
    ratiosJson: formData.get("ratiosJson"),
    categoriesJson: formData.get("categoriesJson"),
    description: formData.get("description"),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid physique summary" };

  try {
    JSON.parse(parsed.data.ratiosJson);
    JSON.parse(parsed.data.categoriesJson);
  } catch {
    return { error: "Invalid physique summary" };
  }

  createPhysique(parsed.data);
  revalidatePath("/fashion");
  return {};
}
