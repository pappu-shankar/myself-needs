import type { Metadata } from "next";
import Link from "next/link";
import {
  getFinanceSettings,
  getAllocationReport,
  getTaxSettingsView,
  getTaxSlabsView,
  getInsightsSettingsView,
} from "@/modules/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AllocationSection } from "./allocation-section";
import { TaxSettingsForm } from "./tax-settings-form";
import { SlabsTable } from "./slabs-table";
import { InsightsSettingsForm } from "./insights-settings-form";

export const metadata: Metadata = {
  title: "Finance settings — Personal Life OS",
};

export default function FinanceSettingsPage() {
  const financeSettings = getFinanceSettings();
  const allocationTargets = getAllocationReport();
  const taxSettings = getTaxSettingsView();
  const oldSlabs = getTaxSlabsView("old");
  const newSlabs = getTaxSlabsView("new");
  const insightsSettings = getInsightsSettingsView();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Every editable number Finance uses: allocation targets, tax reference rates, and insight thresholds — none of it hardcoded."
        actions={
          <Button variant="outline" nativeButton={false} render={<Link href="/finance" />}>
            Back to Finance
          </Button>
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-medium">Allocation</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Date of birth (for the age-based suggestion) and target allocation — a formula-driven
            starting point, not financial advice.
          </p>
        </CardHeader>
        <CardContent>
          <AllocationSection targets={allocationTargets} settings={financeSettings} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-medium">Tax reference rates</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Editable — tax rules change with every budget, nothing here is hardcoded.
          </p>
        </CardHeader>
        <CardContent>
          <TaxSettingsForm settings={taxSettings} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-medium">Tax slab rates</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <SlabsTable title="Old regime" slabs={oldSlabs} />
          <SlabsTable title="New regime" slabs={newSlabs} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Insight thresholds</CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Editable — set by your own judgment, nothing here is hardcoded.
          </p>
        </CardHeader>
        <CardContent>
          <InsightsSettingsForm settings={insightsSettings} />
        </CardContent>
      </Card>
    </>
  );
}
