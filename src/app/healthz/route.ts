import { getAppVersionLabel } from "@/modules/core/env/app-version";

export const dynamic = "force-dynamic";

/** Public liveness probe. Deliberately reveals nothing but a version string. */
export function GET() {
  return Response.json(
    { ok: true, version: getAppVersionLabel() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
