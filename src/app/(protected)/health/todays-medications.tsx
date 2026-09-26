"use client";

import { useActionState } from "react";
import { logDoseAction, type LogDoseState } from "@/modules/health/actions/medications";
import type { getTodaysMedications } from "@/modules/health";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

type TodaysMedication = ReturnType<typeof getTodaysMedications>[number];

const initialState: LogDoseState = {};

function MedicationRow({ medication, today }: { medication: TodaysMedication; today: string }) {
  const [state, formAction, isPending] = useActionState(logDoseAction, initialState);

  return (
    <li className="border-border flex items-center justify-between gap-4 border-b py-3 last:border-0">
      <div>
        <p className="font-medium">{medication.name}</p>
        <p className="text-muted-foreground text-sm">
          {[medication.dosage, medication.frequency].filter(Boolean).join(" · ") || "—"}
          {medication.dosesLoggedToday > 0 && (
            <span className="ml-2">
              · {medication.dosesLoggedToday} dose{medication.dosesLoggedToday === 1 ? "" : "s"}{" "}
              logged today
            </span>
          )}
        </p>
      </div>
      <form action={formAction}>
        <input type="hidden" name="medicationId" value={medication.id} />
        <input type="hidden" name="date" value={today} />
        <Button type="submit" variant="outline" size="sm" disabled={isPending}>
          {isPending ? "…" : "Log dose"}
        </Button>
      </form>
      {state.error && (
        <p role="alert" className="text-destructive text-xs">
          {state.error}
        </p>
      )}
    </li>
  );
}

export function TodaysMedications({
  medications,
  today,
}: {
  medications: TodaysMedication[];
  today: string;
}) {
  if (medications.length === 0) {
    return (
      <EmptyState
        title="No active medications"
        description="Add one below to start tracking doses."
      />
    );
  }

  return (
    <ul>
      {medications.map((m) => (
        <MedicationRow key={m.id} medication={m} today={today} />
      ))}
    </ul>
  );
}
