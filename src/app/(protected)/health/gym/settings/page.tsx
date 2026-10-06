import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import { getGymSettings, getLandmarkOverrides, listEquipmentOptions } from "@/modules/health";
import { DEFAULT_LANDMARKS } from "@/modules/health/engine/volume";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GymSettingsForm } from "./gym-settings-form";
import { LandmarkOverrides } from "./landmark-overrides";
import { UnitSwitch } from "./unit-switch";

export const metadata: Metadata = {
  title: "Settings — Gym — Personal Life OS",
};

export default async function GymSettingsPage() {
  await requireUser();
  const settings = getGymSettings();
  const equipment = listEquipmentOptions().map((e) => e.equipment);
  const overrides = getLandmarkOverrides();

  return (
    <>
      <PageHeader
        title="Gym settings"
        description="How workouts are logged, timed and calculated. Everything stays on this device."
      />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-medium">Weight unit</CardTitle>
        </CardHeader>
        <CardContent>
          <UnitSwitch unit={settings.weightUnit} />
        </CardContent>
      </Card>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-medium">Preferences</CardTitle>
        </CardHeader>
        <CardContent>
          <GymSettingsForm settings={settings} equipment={equipment} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Weekly volume landmarks</CardTitle>
          <p className="text-muted-foreground text-sm">
            Hard sets per muscle per week. MEV is the least that tends to grow a muscle, MAV the
            range most people progress best in, MRV the most they can recover from. Defaults follow
            Renaissance Periodization&apos;s guidelines — adjust any muscle to fit you.
          </p>
        </CardHeader>
        <CardContent>
          <LandmarkOverrides defaults={DEFAULT_LANDMARKS} overrides={overrides} />
        </CardContent>
      </Card>
    </>
  );
}
