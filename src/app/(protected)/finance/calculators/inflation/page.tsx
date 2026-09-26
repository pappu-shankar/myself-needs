import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { InflationCalculator } from "./inflation-calculator";

export const metadata: Metadata = {
  title: "Inflation Calculator — Personal Life OS",
};

export default function InflationCalculatorPage() {
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
