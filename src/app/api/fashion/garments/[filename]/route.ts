import { NextResponse } from "next/server";
import { withUser } from "@/modules/core/session/guard";
import { getGarmentFileBytes } from "@/modules/fashion";

/**
 * Streams a garment's bytes from the current vault's directory — same pattern
 * as the photos Route Handler (src/app/api/fashion/photos/[filename]/route.ts).
 * Route Handlers sit outside the protected layout's render tree, so the
 * session check (and the request scope `getDb()` needs) comes from `withUser`.
 * `no-store`: the same URL serves different bytes per user/space, so it must
 * never be cached.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  return await withUser(() => {
    const file = getGarmentFileBytes(filename);
    if (!file) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": file.mimeType,
        "Cache-Control": "private, no-store",
      },
    });
  });
}
