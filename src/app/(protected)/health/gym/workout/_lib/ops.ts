import type { WorkoutDetailEntry, WorkoutSet } from "@/modules/health";

/** Optimistic changes to a workout's entries/sets, applied until the server confirms. */
export type Op =
  | { type: "patch"; setId: number; patch: Partial<WorkoutSet> }
  | { type: "remove-set"; setId: number }
  | { type: "remove-entry"; entryId: number }
  | { type: "order"; entryIds: number[] };

/** Applies one optimistic change; unknown ids leave the list untouched. */
export function applyOp(entries: WorkoutDetailEntry[], op: Op): WorkoutDetailEntry[] {
  switch (op.type) {
    case "patch":
      return entries.map((entry) =>
        entry.sets.some((s) => s.id === op.setId)
          ? {
              ...entry,
              sets: entry.sets.map((s) => (s.id === op.setId ? { ...s, ...op.patch } : s)),
            }
          : entry,
      );
    case "remove-set":
      return entries.map((entry) =>
        entry.sets.some((s) => s.id === op.setId)
          ? { ...entry, sets: entry.sets.filter((s) => s.id !== op.setId) }
          : entry,
      );
    case "remove-entry":
      return entries.filter((entry) => entry.id !== op.entryId);
    case "order": {
      const byId = new Map(entries.map((entry) => [entry.id, entry]));
      const ordered = op.entryIds.flatMap((id) => byId.get(id) ?? []);
      return ordered.length === entries.length ? ordered : entries;
    }
  }
}
