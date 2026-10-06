import { NextResponse } from "next/server";
import { getInvitePreview } from "@/modules/core/auth/queries";

/**
 * Public: whether an invite token can still be used, for the /invite page.
 * The token lives in the link's `#fragment` (never sent to the server or
 * written to proxy logs), so the page reads it in the browser and POSTs it
 * here in the body rather than in a URL. Reveals nothing but valid/expiry for
 * a 256-bit token — and no account data.
 */
export async function POST(request: Request) {
  let token = "";
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && "token" in body && typeof body.token === "string") {
      token = body.token.slice(0, 128);
    }
  } catch {
    // Malformed body: treated as an unknown token.
  }
  const preview = token ? getInvitePreview(token) : { valid: false, expiresAt: null };
  return NextResponse.json(preview, { headers: { "Cache-Control": "no-store" } });
}
