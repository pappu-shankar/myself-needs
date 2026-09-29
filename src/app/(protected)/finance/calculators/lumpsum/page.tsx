import type { Metadata } from "next";
import { requireUnlocked } from "@/modules/core/session/guard";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { LumpsumCalculator } from "./lumpsum-calculator";

export const metadata: Metadata = {
  title: "Lumpsum Calculator — Personal Life OS",
};

export default async function LumpsumCalculatorPage() {
  await requireUnlocked();
  return (
    <>
      <PageHeader
        title="Lumpsum Calculator"
        description="Future value of a one-time investment."
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

      <LumpsumCalculator />
    </>
  );
}
