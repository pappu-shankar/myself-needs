import type { SearchResult } from "@/types/search";
import { searchMedicationsByName, searchMetricsByLabel } from "../db/queries/search";

export function searchHealth(query: string): SearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const metrics: SearchResult[] = searchMetricsByLabel(trimmed).map((m) => ({
    type: "metric",
    id: m.id,
    label: m.label,
    subtitle: m.date,
    href: "/health",
  }));

  const medications: SearchResult[] = searchMedicationsByName(trimmed).map((m) => ({
    type: "medication",
    id: m.id,
    label: m.name,
    subtitle: m.dosage ?? undefined,
    href: "/health",
  }));

  return [...metrics, ...medications];
}
