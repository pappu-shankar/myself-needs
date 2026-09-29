import type { Metadata } from "next";
import { requireUnlocked } from "@/modules/core/session/guard";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { IrrCalculator } from "./irr-calculator";

export const metadata: Metadata = {
  title: "IRR Calculator — Personal Life OS",
};

export default async function IrrCalculatorPage() {
  await requireUnlocked();
  return (
    <>
      <PageHeader
        title="IRR Calculator"
        description="Internal rate of return for evenly-spaced periods."
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

      <IrrCalculator />
    </>
  );
}
