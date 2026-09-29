import type { Metadata } from "next";
import { requireUnlocked } from "@/modules/core/session/guard";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { EmiCalculator } from "./emi-calculator";

export const metadata: Metadata = {
  title: "EMI Calculator — Personal Life OS",
};

export default async function EmiCalculatorPage() {
  await requireUnlocked();
  return (
    <>
      <PageHeader
        title="EMI Calculator"
        description="Equated monthly installment — the fixed monthly payment on a loan."
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

      <EmiCalculator />
    </>
  );
}
