import type { Metadata } from "next";
import { requireUnlocked } from "@/modules/core/session/guard";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { CagrCalculator } from "./cagr-calculator";

export const metadata: Metadata = {
  title: "CAGR Calculator — Personal Life OS",
};

export default async function CagrCalculatorPage() {
  await requireUnlocked();
  return (
    <>
      <PageHeader
        title="CAGR Calculator"
        description="Compound annual growth rate between a start and end value."
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

      <CagrCalculator />
    </>
  );
}
