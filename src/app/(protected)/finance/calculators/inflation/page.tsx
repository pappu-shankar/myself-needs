import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { InflationCalculator } from "./inflation-calculator";

export const metadata: Metadata = {
  title: "Inflation Calculator — Personal Life OS",
};

export default async function InflationCalculatorPage() {
  await requireUser();
  return (
    <>
      <PageHeader
        title="Inflation Calculator"
        description="Inflation-adjusted future value and real rate of return."
        actions={
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link href="/finance/calculators" />}
          >
            Back to Calculators
          </Button>
        }
      />

      <InflationCalculator />
    </>
  );
}
