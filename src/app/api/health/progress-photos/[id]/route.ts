import { NextResponse } from "next/server";
import { withUser } from "@/modules/core/session/guard";
import { getProgressPhotoImage } from "@/modules/health";

/**
 * Serves a progress photo's bytes from the encrypted vault. Route handlers
 * sit outside the protected layout, so `withUser` checks the session and binds
 * the request scope. `no-store`: body photos shouldn't linger in the browser's
 * disk cache after the session ends.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  return await withUser(() => {
    const photo = Number.isInteger(id) && id > 0 ? getProgressPhotoImage(id) : null;
    if (!photo) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(photo.image), {
      headers: {
        "Content-Type": photo.mimeType,
        "Cache-Control": "private, no-store",
      },
    });
  });
}
