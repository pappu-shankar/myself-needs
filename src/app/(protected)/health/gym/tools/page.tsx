import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import { getGymSettings } from "@/modules/health";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OneRmCalculator } from "./one-rm-calculator";
import { PlateCalculator } from "./plate-calculator";
import { RpeTool } from "./rpe-tool";
import { loadStepKg } from "./tool-utils";
import { TrainingMaxTool } from "./training-max";
import { UnitConverter } from "./unit-converter";
import { WarmupGenerator } from "./warmup-generator";

export const metadata: Metadata = {
  title: "Tools — Gym — Personal Life OS",
};

function Tool({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function GymToolsPage() {
  await requireUser();
  const settings = getGymSettings();
  const unit = settings.weightUnit;
  const stepKg = loadStepKg(settings.platesKg, unit);

  return (
    <>
      <PageHeader
        title="Tools"
        description="Calculators that run in your browser. Nothing here is saved."
      />
      <div className="grid gap-6">
        <Tool title="Plate calculator">
          <PlateCalculator
            barWeightKg={settings.barWeightKg}
            platesKg={settings.platesKg}
            unit={unit}
          />
        </Tool>
        <Tool title="Warm-up generator">
          <WarmupGenerator
            barWeightKg={settings.barWeightKg}
            platesKg={settings.platesKg}
            stepKg={stepKg}
            unit={unit}
          />
        </Tool>
        <Tool title="1RM calculator">
          <OneRmCalculator formula={settings.e1rmFormula} unit={unit} />
        </Tool>
        <Tool title="RPE chart">
          <RpeTool stepKg={stepKg} unit={unit} />
        </Tool>
        <Tool title="Training max (5/3/1)">
          <TrainingMaxTool stepKg={stepKg} unit={unit} />
        </Tool>
        <Tool title="kg ↔ lb">
          <UnitConverter />
        </Tool>
      </div>
    </>
  );
}
