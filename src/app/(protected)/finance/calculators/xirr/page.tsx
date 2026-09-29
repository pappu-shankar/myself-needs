import type { Metadata } from "next";
import { requireUnlocked } from "@/modules/core/session/guard";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { XirrCalculator } from "./xirr-calculator";

export const metadata: Metadata = {
  title: "XIRR Calculator — Personal Life OS",
};

export default async function XirrCalculatorPage() {
  await requireUnlocked();
  return (
    <>
      <PageHeader
        title="XIRR Calculator"
        description="Internal rate of return for cash flows on irregular dates."
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

      <XirrCalculator />
    </>
  );
}
