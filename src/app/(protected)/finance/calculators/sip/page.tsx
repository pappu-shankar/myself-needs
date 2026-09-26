import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { SipCalculator } from "./sip-calculator";

export const metadata: Metadata = {
  title: "SIP Calculator — Personal Life OS",
};

export default function SipCalculatorPage() {
  return (
    <>
      <PageHeader
        title="SIP Calculator"
        description="Future value of a fixed monthly investment."
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

      <SipCalculator />
    </>
  );
}
