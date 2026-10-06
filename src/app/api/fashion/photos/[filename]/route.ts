import { NextResponse } from "next/server";
import { withUser } from "@/modules/core/session/guard";
import { getPhotoFileBytes } from "@/modules/fashion";

/**
 * Streams an uploaded photo's bytes from the current vault's directory. Route
 * Handlers sit outside the protected layout's render tree, so they are NOT
 * covered by its guard: `withUser` checks the session and binds the request
 * scope (skipping it would make photos fetchable by filename guess). See
 * docs/architecture/system-design.md. `no-store`: the same URL serves different
 * bytes per user/space, so it must never be cached.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  return await withUser(() => {
    const file = getPhotoFileBytes(filename);
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
