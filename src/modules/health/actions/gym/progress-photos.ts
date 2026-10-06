"use server";

import { z } from "zod";
import { defineAction } from "@/modules/core/action/define-action";
import { PHOTO_POSES } from "../../gym-types";
import {
  addProgressPhoto,
  deleteProgressPhoto,
  MAX_PHOTO_BYTES,
  PROGRESS_PHOTO_MIME_TYPES,
  updateProgressPhotoNote,
} from "../../service/gym/progress-photos";

/**
 * The capture component sends the already-downscaled image as base64 (JSON
 * Server Action), with the pose landmarks it found. Decoded size is checked
 * again in the service.
 */
export const addProgressPhotoAction = defineAction(
  z.object({
    date: z.iso.date(),
    pose: z.enum(PHOTO_POSES),
    imageBase64: z.string().max(Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 8),
    mimeType: z.enum(PROGRESS_PHOTO_MIME_TYPES),
    width: z.number().int(),
    height: z.number().int(),
    landmarks: z
      .array(z.tuple([z.number(), z.number(), z.number()]))
      .length(33)
      .nullable(),
    note: z.string().max(500).optional(),
  }),
  ({ imageBase64, ...input }) => {
    const photo = addProgressPhoto({ ...input, image: Buffer.from(imageBase64, "base64") });
    return { id: photo.id };
  },
  { name: "health:add-progress-photo" },
);

export const updateProgressPhotoNoteAction = defineAction(
  z.object({ id: z.number().int().positive(), note: z.string().max(500).nullable() }),
  ({ id, note }) => {
    updateProgressPhotoNote(id, note);
  },
  { name: "health:update-progress-photo-note" },
);

export const deleteProgressPhotoAction = defineAction(
  z.object({ id: z.number().int().positive() }),
  ({ id }) => {
    deleteProgressPhoto(id);
  },
  { name: "health:delete-progress-photo" },
);
