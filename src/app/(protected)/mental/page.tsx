import type { Metadata } from "next";
import { getMedications, getTodaysMedications } from "@/modules/mental";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MedicationForm } from "./medication-form";
import { TodaysMedications } from "./todays-medications";

export const metadata: Metadata = {
  title: "Mental — Personal Life OS",
};

export default function MentalPage() {
  const medications = getMedications();
  const today = new Date().toISOString().slice(0, 10);
  const todaysMedications = getTodaysMedications(today);

  return (
    <>
      <PageHeader
        title="Mental"
        description="Mental-health medications — a starting skeleton, deepened later."
      />

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
