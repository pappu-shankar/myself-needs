import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import { todayIso } from "@/lib/dates";
import { getBodyOverview } from "@/modules/health";
import { NavCard } from "@/components/ui/nav-card";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CompositionCards } from "./composition-cards";
import { MeasurementsSection } from "./measurements-section";
import { ProfileForm } from "./profile-form";
import { StrengthStandards } from "./strength-standards";
import { WeightSection } from "./weight-section";

export const metadata: Metadata = {
  title: "Body — Gym — Personal Life OS",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-4 text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export default async function GymBodyPage() {
  await requireUser();
  const today = todayIso();
  const body = getBodyOverview(today);
  const { settings, weight } = body;

  return (
    <>
      <PageHeader
        title="Body"
        description="Weight, measurements, body composition and strength relative to your size."
      />

      <div className="mb-8">
        <NavCard
          href="/health/gym/body/photos"
          title="Progress photos"
          description="Guided front/side/back photos, compared over time"
        />
      </div>

      <Section title="Weight">
        <WeightSection weight={weight} today={today} unit={settings.weightUnit} />
      </Section>

      <Section title="Profile">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">About you</CardTitle>
          </CardHeader>
          <CardContent>
            <ProfileForm
              sex={settings.sex}
              heightCm={settings.heightCm}
              goalWeightKg={settings.goalWeightKg}
              weightUnit={settings.weightUnit}
            />
          </CardContent>
        </Card>
      </Section>

      <Section title="Measurements">
        <MeasurementsSection series={body.measurements.series} today={today} />
      </Section>

      <Section title="Body composition">
        <CompositionCards
          composition={body.composition}
          sex={settings.sex}
          heightCm={settings.heightCm}
        />
      </Section>

      <Section title="Strength standards">
        <StrengthStandards
          strength={body.strength}
          sex={settings.sex}
          bodyweightKg={weight.latest?.weightKg ?? null}
          unit={settings.weightUnit}
        />
      </Section>
    </>
  );
}
