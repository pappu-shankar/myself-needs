import { NextResponse } from "next/server";
import { requireUnlocked } from "@/modules/core/session/guard";
import { getPhotoFileBytes } from "@/modules/fashion";

/**
 * Streams an uploaded photo's bytes. This is the app's first Route
 * Handler — unlike a page/layout under (protected)/, it is NOT covered by
 * ProtectedLayout's requireUnlocked() guard, since Route Handlers sit
 * outside that segment's render tree entirely. requireUnlocked() is called
 * explicitly here as the first statement; skipping it would make uploaded
 * photos fetchable by filename guess with no session check. See
 * docs/architecture/system-design.md.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  await requireUnlocked();

  const { filename } = await params;
  const file = getPhotoFileBytes(filename);
  if (!file) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": file.mimeType,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
