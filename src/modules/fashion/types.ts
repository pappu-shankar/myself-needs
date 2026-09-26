export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoMimeType = (typeof PHOTO_MIME_TYPES)[number];

export const GARMENT_CATEGORIES = ["shirt", "pants"] as const;
export type GarmentCategory = (typeof GARMENT_CATEGORIES)[number];

/** How a chosen garment color reads against the photo's sampled skin tone —
 * see service/lab-color.ts's scoreContrast(). */
export const CONTRAST_VERDICTS = ["pops", "washed_out", "neutral"] as const;
export type ContrastVerdict = (typeof CONTRAST_VERDICTS)[number];

export const GENERATION_JOB_STATUSES = ["pending", "running", "done", "failed"] as const;
export type GenerationJobStatus = (typeof GENERATION_JOB_STATUSES)[number];

/** The ~12 panels a full reference-sheet generation produces: 5 body angles,
 * 2 garment flat-lays, and a handful of detail crops. */
export const REFERENCE_SHEET_IMAGE_KINDS = [
  "angle_front",
  "angle_back",
  "angle_left",
  "angle_right",
  "angle_three_quarter",
  "flat_front",
  "flat_back",
  "detail_collar",
  "detail_fabric",
  "detail_stitching",
] as const;
export type ReferenceSheetImageKind = (typeof REFERENCE_SHEET_IMAGE_KINDS)[number];
