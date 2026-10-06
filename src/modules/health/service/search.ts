import type { SearchResult } from "@/types/search";
import {
  searchExercisesByName,
  searchMedicationsByName,
  searchMetricsByLabel,
  searchRoutinesByName,
} from "../db/queries/search";
import { ensureExerciseCatalog } from "./gym/catalog";

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

  ensureExerciseCatalog();
  const exercises: SearchResult[] = searchExercisesByName(trimmed).map((e) => ({
    type: "exercise",
    id: e.id,
    label: e.name,
    subtitle: `${e.bodyPart} · ${e.equipment}`,
    href: `/health/gym/library/${e.id}`,
  }));

  const routines: SearchResult[] = searchRoutinesByName(trimmed).map((r) => ({
    type: "routine",
    id: r.id,
    label: r.name,
    subtitle: "Gym routine",
    href: `/health/gym/routines/${r.id}`,
  }));

  return [...metrics, ...medications, ...routines, ...exercises];
}
