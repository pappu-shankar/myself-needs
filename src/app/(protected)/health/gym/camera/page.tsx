import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import { getGymSettings } from "@/modules/health";
import { CAMERA_MOVEMENTS, CAMERA_MOVEMENT_LABELS } from "@/modules/health/types";
// Pure config data (no browser APIs), shared with the panel so the placement
// guidance here can't drift from what the counter actually measures.
import { MOVEMENT_CONFIGS } from "@/modules/health/client/pose/movements";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RepCounterPanel } from "../_components/camera/rep-counter-panel";

export const metadata: Metadata = {
  title: "Camera rep counter — Personal Life OS",
};

export default async function CameraRepCounterPage() {
  await requireUser();
  const settings = getGymSettings();

  return (
    <>
      <PageHeader
        title="Camera rep counter"
        description="Counts reps from your webcam, scores range of motion and flags common form faults."
      />

      <Card className="mb-6">
        <CardContent>
          <RepCounterPanel voiceCoach={settings.voiceCoach} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Camera placement</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <p className="text-muted-foreground">
            Prop the camera up at roughly hip height and step back until the joints that matter are
            in frame — the counter pauses and asks you to step back rather than guess. Good, even
            light and a plain background help.
          </p>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {CAMERA_MOVEMENTS.map((movement) => {
              const config = MOVEMENT_CONFIGS[movement];
              return (
                <div key={movement}>
                  <dt className="font-medium">
                    {CAMERA_MOVEMENT_LABELS[movement]}{" "}
                    <span className="text-muted-foreground font-normal">
                      · {config.view === "side" ? "side view" : "front view"}
                    </span>
                  </dt>
                  <dd className="text-muted-foreground">{config.placement}</dd>
                </div>
              );
            })}
          </dl>
          <p className="text-muted-foreground">
            Form cues are a guide from 2-D landmarks, not a coach: back rounding, for one,
            can&apos;t be seen this way, so it isn&apos;t flagged.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
