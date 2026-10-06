import "server-only";
import { existsSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertSafeId, getAvatarsDir, PRIVATE_FILE_MODE } from "@/modules/core/env/paths";
import { DomainError } from "@/modules/core/errors";

/**
 * Profile pictures: small (≤256×256, ≤200 KB) WebP or JPEG images, resized in
 * the browser and uploaded as base64. Checked by magic number and by the
 * dimensions in the image header — never trusted from the declared type.
 * Stored at `data/avatars/<userId>.webp` or `.jpg` (plaintext, like other
 * account metadata).
 */

export const AVATAR_MAX_BYTES = 200 * 1024;
export const AVATAR_MAX_DIMENSION = 256;

export type AvatarFormat = "webp" | "jpeg";

const EXTENSIONS: Record<AvatarFormat, string> = { webp: "webp", jpeg: "jpg" };
const CONTENT_TYPES: Record<AvatarFormat, string> = { webp: "image/webp", jpeg: "image/jpeg" };

function webpSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 30) return null;
  const chunk = buf.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
    return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    if (buf[20] !== 0x2f) return null;
    const bits = buf.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
  }
  return null;
}

function jpegSize(buf: Buffer): { width: number; height: number } | null {
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) return null;
    const marker = buf[offset + 1];
    if (marker === 0xff) {
      offset++;
      continue;
    }
    const length = buf.readUInt16BE(offset + 2);
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { height: buf.readUInt16BE(offset + 5), width: buf.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

/** Validates an uploaded avatar. Accepts raw base64 or a `data:image/...;base64,` URL. */
export function parseAvatar(input: string): { format: AvatarFormat; bytes: Buffer } {
  const base64 = input.replace(/^data:image\/[a-z]+;base64,/i, "").replace(/\s/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new DomainError("That image couldn't be read.");
  if ((base64.length * 3) / 4 > AVATAR_MAX_BYTES + 3) {
    throw new DomainError("Pictures can be at most 200 KB.");
  }
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length > AVATAR_MAX_BYTES) throw new DomainError("Pictures can be at most 200 KB.");

  let format: AvatarFormat;
  let size: { width: number; height: number } | null;
  if (
    bytes.length > 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    format = "webp";
    size = webpSize(bytes);
  } else if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    format = "jpeg";
    size = jpegSize(bytes);
  } else {
    throw new DomainError("Upload a WebP or JPEG image.");
  }
  if (!size || size.width < 1 || size.height < 1) {
    throw new DomainError("That image couldn't be read.");
  }
  if (size.width > AVATAR_MAX_DIMENSION || size.height > AVATAR_MAX_DIMENSION) {
    throw new DomainError(
      `Pictures can be at most ${AVATAR_MAX_DIMENSION}×${AVATAR_MAX_DIMENSION} pixels.`,
    );
  }
  return { format, bytes };
}

function avatarPath(userId: string, format: AvatarFormat): string {
  return path.join(getAvatarsDir(), `${assertSafeId(userId)}.${EXTENSIONS[format]}`);
}

export function writeAvatar(userId: string, format: AvatarFormat, bytes: Buffer): void {
  const target = avatarPath(userId, format);
  const tmp = `${target}.tmp`;
  writeFileSync(tmp, bytes, { mode: PRIVATE_FILE_MODE });
  renameSync(tmp, target);
  for (const other of Object.keys(EXTENSIONS) as AvatarFormat[]) {
    if (other !== format) rmSync(avatarPath(userId, other), { force: true });
  }
}

export function deleteAvatar(userId: string): void {
  for (const format of Object.keys(EXTENSIONS) as AvatarFormat[]) {
    rmSync(avatarPath(userId, format), { force: true });
  }
}

/** For the avatar route handler (later phase). */
export function getAvatarFile(userId: string): { path: string; contentType: string } | null {
  for (const format of Object.keys(EXTENSIONS) as AvatarFormat[]) {
    const file = avatarPath(userId, format);
    if (existsSync(file)) return { path: file, contentType: CONTENT_TYPES[format] };
  }
  return null;
}

/** The picture file's mtime (ms), used as a cache-busting `?v=` on its URL so
 * a new upload shows at once despite the route's max-age. Null without one. */
export function getAvatarVersion(userId: string): number | null {
  const file = getAvatarFile(userId);
  if (!file) return null;
  try {
    return Math.floor(statSync(file.path).mtimeMs);
  } catch {
    return null;
  }
}
