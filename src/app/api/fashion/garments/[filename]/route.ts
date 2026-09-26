import { NextResponse } from "next/server";
import { requireUnlocked } from "@/modules/core/session/guard";
import { getGarmentFileBytes } from "@/modules/fashion";

/**
 * Streams a garment's bytes — same pattern as the photos Route Handler
 * (src/app/api/fashion/photos/[filename]/route.ts): explicitly guarded
 * with requireUnlocked() since Route Handlers sit outside the protected
 * layout's render tree and are not covered by its guard automatically.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  await requireUnlocked();

  const { filename } = await params;
  const file = getGarmentFileBytes(filename);
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
