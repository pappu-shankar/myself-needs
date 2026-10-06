import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import {
  getFinanceSettings,
  getAllocationReport,
  getTaxPolicyView,
  listTaxPolicyYears,
  getInsightsSettingsView,
  currentFiscalYear,
  parseFiscalYearLabel,
  shiftFiscalYear,
  type FiscalYear,
} from "@/modules/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AllocationSection } from "./allocation-section";
import { TaxSettingsForm } from "./tax-settings-form";
import { SlabsTable } from "./slabs-table";
import { InsightsSettingsForm } from "./insights-settings-form";
import { StartFiscalYearForm } from "./start-fiscal-year-form";
import { FiscalYearPicker } from "../tax/fiscal-year-picker";

export const metadata: Metadata = {
  title: "Finance settings — Personal Life OS",
};

/** FYs that could be started: from five years before the earliest on record through next FY, minus those that exist — newest first. */
function startableFiscalYears(existing: string[]): string[] {
  const current = currentFiscalYear();
  const startYearOf = (fy: FiscalYear) => Number(fy.start.slice(0, 4));
  const earliest = parseFiscalYearLabel(existing[0]) ?? current;
  const labels: string[] = [];
  for (let offset = 1; offset >= startYearOf(earliest) - startYearOf(current) - 5; offset--) {
    const label = shiftFiscalYear(current, offset).label;
    if (!existing.includes(label)) labels.push(label);
  }
  return labels;
}

export default async function FinanceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ fy?: string | string[] }>;
}) {
  await requireUser();
  const { fy: fyParam } = await searchParams;
  const financeSettings = getFinanceSettings();
  const allocationTargets = getAllocationReport();
  const current = currentFiscalYear();
  const selectedFy = (typeof fyParam === "string" && parseFiscalYearLabel(fyParam)) || current;
  const taxPolicy = getTaxPolicyView(selectedFy.label);
  const policyYears = listTaxPolicyYears();
  const pickerYears = [...new Set([...policyYears, current.label, selectedFy.label])]
    .sort()
    .reverse();
  const startable = startableFiscalYears(policyYears);
  const latestPolicyYear = policyYears.at(-1) ?? taxPolicy.settings.fiscalYear;
  const nextAfterLatest = shiftFiscalYear(
    parseFiscalYearLabel(latestPolicyYear) ?? current,
    1,
  ).label;
  const defaultStart = [selectedFy.label, nextAfterLatest].find((fy) => startable.includes(fy));
  const insightsSettings = getInsightsSettingsView();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Every editable number Finance uses: allocation targets, tax reference rates, and insight thresholds — none of it hardcoded."
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
          <AllocationSection report={allocationTargets} settings={financeSettings} />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Tax reference rates — FY {selectedFy.label}
          </CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Stored per financial year (April–March) and editable — tax rules change with every
            budget, nothing here is hardcoded. A year without its own values uses the closest
            earlier year&apos;s.
          </p>
        </CardHeader>
        <CardContent>
          <FiscalYearPicker
            basePath="/finance/settings"
            years={pickerYears}
            selected={selectedFy.label}
            current={current.label}
          />
          <div className="mb-4">
            <StartFiscalYearForm
              candidates={startable}
              defaultValue={defaultStart ?? startable[0] ?? ""}
              copyFrom={latestPolicyYear}
            />
          </div>
          {!taxPolicy.hasOwnSettings && (
            <p role="status" className="bg-muted mb-4 rounded-lg p-3 text-sm">
              FY {selectedFy.label} hasn&apos;t been started, so calculations for it use FY{" "}
              {taxPolicy.settings.fiscalYear}&apos;s values shown below (read-only here). Start FY{" "}
              {selectedFy.label} above to give it its own settings and slabs.
            </p>
          )}
          <TaxSettingsForm
            key={selectedFy.label}
            fiscalYear={selectedFy.label}
            settings={taxPolicy.settings}
            editable={taxPolicy.hasOwnSettings}
          />
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Tax slab brackets — FY {selectedFy.label}
          </CardTitle>
          <p className="text-muted-foreground mt-1 text-sm">
            Each bracket runs from the previous bracket&apos;s upper limit to its own; leave the top
            bracket&apos;s upper limit blank.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SlabsTable
            key={`old-${selectedFy.label}`}
            title="Old regime"
            fiscalYear={selectedFy.label}
            regime="old"
            slabs={taxPolicy.oldSlabs}
            editable={
              taxPolicy.hasOwnSettings &&
              taxPolicy.oldSlabs.every((slab) => slab.fiscalYear === selectedFy.label)
            }
          />
          <SlabsTable
            key={`new-${selectedFy.label}`}
            title="New regime"
            fiscalYear={selectedFy.label}
            regime="new"
            slabs={taxPolicy.newSlabs}
            editable={
              taxPolicy.hasOwnSettings &&
              taxPolicy.newSlabs.every((slab) => slab.fiscalYear === selectedFy.label)
            }
          />
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
