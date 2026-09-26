import type { Metadata } from "next";
import { getMetrics, getMetricTrend, getMedications, getTodaysMedications } from "@/modules/health";
import { HEALTH_METRIC_TYPES, type HealthMetricType } from "@/modules/health/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricForm } from "./metric-form";
import { MetricTrendChart } from "./metric-trend-chart";
import { MedicationForm } from "./medication-form";
import { TodaysMedications } from "./todays-medications";

export const metadata: Metadata = {
  title: "Health — Personal Life OS",
};

export default function HealthPage() {
  const metrics = getMetrics();
  const medications = getMedications();
  const today = new Date().toISOString().slice(0, 10);
  const todaysMedications = getTodaysMedications(today);

  const trendsByType = Object.fromEntries(
    HEALTH_METRIC_TYPES.map((t) => [t, getMetricTrend(t)]),
  ) as Record<HealthMetricType, ReturnType<typeof getMetricTrend>>;

  return (
    <>
      <PageHeader title="Health" description="Vitals and medications." />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-medium">Add entry</CardTitle>
        </CardHeader>
        <CardContent>
          <MetricForm />
        </CardContent>
      </Card>

      <div className="mb-6">
        <MetricTrendChart trendsByType={trendsByType} />
      </div>

      {metrics.length === 0 ? (
        <EmptyState
          title="No entries yet"
          description="Add your first metric above to start tracking."
          className="mb-6"
        />
      ) : (
        <Card className="mb-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Label</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="tabular-nums">{m.date}</TableCell>
                  <TableCell>{m.label}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.value ?? "—"} {m.unit}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{m.note ?? ""}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-medium">Today&apos;s medications</CardTitle>
        </CardHeader>
        <CardContent>
          <TodaysMedications medications={todaysMedications} today={today} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Add medication</CardTitle>
        </CardHeader>
        <CardContent>
          <MedicationForm />
          {medications.length > 0 && (
            <p className="text-muted-foreground mt-4 text-sm">
              {medications.map((m) => m.name).join(", ")}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  );
}
