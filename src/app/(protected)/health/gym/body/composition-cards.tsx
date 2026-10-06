import { Card, CardContent } from "@/components/ui/card";
import { bmiCategory, bodyFatCategory } from "@/modules/health/engine/body-composition";
import type { BodyComposition } from "@/modules/health/engine/types";
import type { Sex } from "@/modules/health/types";

interface CompositionCardsProps {
  composition: BodyComposition;
  sex: Sex | null;
  heightCm: number | null;
}

function MetricCard({
  label,
  value,
  unit,
  detail,
  missing,
}: {
  label: string;
  value: string | null;
  unit?: string;
  detail?: string;
  missing: string;
}) {
  return (
    <Card size="sm" data-testid="composition-card">
      <CardContent>
        <p className="text-muted-foreground text-sm">{label}</p>
        {value === null ? (
          <p className="text-muted-foreground mt-1 text-sm">{missing}</p>
        ) : (
          <>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {value}
              {unit && (
                <span className="text-muted-foreground ml-1 text-sm font-normal">{unit}</span>
              )}
            </p>
            {detail && <p className="text-muted-foreground mt-1 text-xs">{detail}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const BMI_WORDS = {
  underweight: "Underweight (below 18.5)",
  normal: "Normal range (18.5–24.9)",
  overweight: "Overweight (25–29.9)",
  obese: "Obese range (30 and over)",
} as const;

const FAT_WORDS = {
  essential: "Essential or very lean",
  athletes: "Athletic",
  fitness: "Fit",
  average: "Average",
  obese: "High",
} as const;

export function CompositionCards({ composition: c, sex, heightCm }: CompositionCardsProps) {
  const needFat = "Add neck and waist measurements (and hips for women), or a measured body fat %.";
  const fatSource =
    c.bodyFatSource === "measured"
      ? "Measured value you logged"
      : "Estimated from tape (US Navy formula), typically within ±3–4 percentage points";
  const fatCategory =
    c.bodyFatPct !== null && sex ? `${FAT_WORDS[bodyFatCategory(sex, c.bodyFatPct)]}. ` : "";
  const whtr = c.waistToHeight;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard
          label="BMI"
          value={c.bmi === null ? null : c.bmi.toFixed(1)}
          detail={
            c.bmi === null
              ? undefined
              : `${BMI_WORDS[bmiCategory(c.bmi)]}. Misreads muscular people, so read it beside body fat.`
          }
          missing="Add your height and log your weight to see this."
        />
        <MetricCard
          label="Body fat"
          value={c.bodyFatPct === null ? null : c.bodyFatPct.toFixed(1)}
          unit="%"
          detail={c.bodyFatPct === null ? undefined : `${fatCategory}${fatSource}.`}
          missing={sex ? needFat : `Set your sex and height. ${needFat}`}
        />
        <MetricCard
          label="Lean mass"
          value={c.leanMassKg === null ? null : c.leanMassKg.toFixed(1)}
          unit="kg"
          detail="Everything that is not fat: muscle, bone, organs and water."
          missing="Needs a body fat value and your weight."
        />
        <MetricCard
          label="FFMI (normalized)"
          value={c.normalizedFfmi === null ? null : c.normalizedFfmi.toFixed(1)}
          detail={
            c.ffmi === null
              ? undefined
              : `Raw ${c.ffmi.toFixed(1)}, adjusted to 1.8 m (Kouri 1995). Few natural lifters were found above about 25. A rough guide only.`
          }
          missing="Needs lean mass and your height."
        />
        <MetricCard
          label="Waist-to-height"
          value={whtr === null ? null : whtr.toFixed(2)}
          detail={
            whtr === null
              ? undefined
              : whtr < 0.5
                ? "Below 0.5, the commonly used guideline."
                : "At or above 0.5; a smaller waist than your height / 2 is the usual target."
          }
          missing={
            heightCm === null
              ? "Add your height and a waist measurement."
              : "Add a waist measurement."
          }
        />
      </div>
      <p className="text-muted-foreground text-xs">
        These are screening numbers. Tape estimates move with how you measure, so compare your own
        readings over time rather than chasing one value.
      </p>
    </div>
  );
}
