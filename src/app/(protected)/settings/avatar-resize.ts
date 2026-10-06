/**
 * Browser-side avatar preparation: centre-crops the picked image to a square,
 * scales it to at most 256×256 and encodes it as WebP (JPEG where the browser
 * can't encode WebP), lowering quality until it fits in 200 KB. The server
 * re-checks all of this (`parseAvatar`), so this is about a good upload, not trust.
 */

export const AVATAR_MAX_DIMENSION = 256;
export const AVATAR_MAX_BYTES = 200 * 1024;

const QUALITIES = [0.9, 0.8, 0.7, 0.55, 0.4];

/** Decoded byte size of a base64 data URL. */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

/** The square source rectangle and output size for a `width`×`height` image. */
export function squareCrop(width: number, height: number) {
  const side = Math.min(width, height);
  return {
    sx: Math.floor((width - side) / 2),
    sy: Math.floor((height - side) / 2),
    side,
    size: Math.min(AVATAR_MAX_DIMENSION, side),
  };
}

/** Returns a `data:image/webp;base64,…` (or jpeg) URL ready for `uploadAvatarAction`. */
export async function resizeAvatar(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That picture couldn't be read. Try a JPEG, PNG or WebP image.");
  }
  const { sx, sy, side, size } = squareCrop(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Your browser couldn't resize that picture.");
  }
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();

  for (const type of ["image/webp", "image/jpeg"]) {
    for (const quality of QUALITIES) {
      const url = canvas.toDataURL(type, quality);
      // A browser that can't encode `type` silently returns PNG instead.
      if (!url.startsWith(`data:${type};`)) break;
      if (dataUrlBytes(url) <= AVATAR_MAX_BYTES) return url;
    }
  }
  throw new Error("That picture couldn't be made small enough. Try a different one.");
}
