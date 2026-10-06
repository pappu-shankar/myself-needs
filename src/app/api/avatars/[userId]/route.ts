import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { getAvatarFile } from "@/modules/core/auth/avatar";
import { withUser } from "@/modules/core/session/guard";

/**
 * A user's profile picture. Any signed-in user may fetch any avatar (they're
 * shown next to names in admin and shared-space screens), but only when signed
 * in — this route sits outside the (protected) layout, so the session check
 * is here. `getAvatarFile` validates the id before touching the filesystem.
 */
function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function GET(_request: Request, { params }: RouteContext<"/api/avatars/[userId]">) {
  return await withUser(async () => {
    const { userId } = await params;
    let file: { path: string; contentType: string } | null;
    let bytes: Buffer;
    try {
      // Throws on an id that isn't a UUID; readFile throws if it was just deleted.
      file = getAvatarFile(userId);
      if (!file) return notFound();
      bytes = await readFile(file.path);
    } catch {
      return notFound();
    }
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.contentType,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
