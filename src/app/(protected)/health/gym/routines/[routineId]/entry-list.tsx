"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Link2, Link2Off, Pencil, Trash2 } from "lucide-react";
import {
  linkSupersetAction,
  removeRoutineEntryAction,
  reorderRoutineEntriesAction,
  unlinkSupersetAction,
} from "@/modules/health/actions/gym/routines";
import type { ProgressionPolicy } from "@/modules/health/types";
import type { RoutineEntry } from "@/modules/health";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { groupSupersets, movedOrder, summarizeEntry } from "../entry-summary";
import { useRunAction } from "../use-run-action";
import type { WeightUnit } from "@/modules/health/gym-types";
import { EntryEditor } from "./entry-editor";

interface EntryRowProps {
  routineId: number;
  entry: RoutineEntry;
  index: number;
  order: number[];
  routinePolicy: ProgressionPolicy;
  weightUnit: WeightUnit;
  /** Whether the next entry exists and is not already in this entry's superset. */
  canLinkNext: boolean;
}

function EntryRow({
  routineId,
  entry,
  index,
  order,
  routinePolicy,
  weightUnit,
  canLinkNext,
}: EntryRowProps) {
  const [editing, setEditing] = useState(false);
  const { pending, error, run } = useRunAction();
  const name = entry.exercise.name;
  const up = movedOrder(order, index, -1);
  const down = movedOrder(order, index, 1);

  return (
    <Card size="sm" className="px-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="font-medium">
            <Link
              href={`/health/gym/library/${entry.exercise.id}`}
              className="text-primary underline-offset-4 hover:underline"
            >
              {name}
            </Link>
          </p>
          <p className="text-muted-foreground text-sm tabular-nums">
            {summarizeEntry(entry, weightUnit)}
          </p>
          {entry.targetRpe !== null && (
            <p className="text-muted-foreground text-sm">
              Target RPE {entry.targetRpe} — load set from your recent e1RM.
            </p>
          )}
          {entry.notes && <p className="text-sm">{entry.notes}</p>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="icon-sm"
            disabled={pending || !up}
            aria-label={`Move ${name} up`}
            onClick={() =>
              up && run(() => reorderRoutineEntriesAction({ routineId, entryIds: up }))
            }
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            size="icon-sm"
            disabled={pending || !down}
            aria-label={`Move ${name} down`}
            onClick={() =>
              down && run(() => reorderRoutineEntriesAction({ routineId, entryIds: down }))
            }
          >
            <ArrowDown aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          aria-expanded={editing}
          aria-label={`Edit ${name}`}
          onClick={() => setEditing((v) => !v)}
        >
          <Pencil aria-hidden="true" /> Edit
        </Button>
        {entry.supersetGroup !== null && (
          <Button
            size="sm"
            disabled={pending}
            aria-label={`Remove ${name} from superset`}
            onClick={() => run(() => unlinkSupersetAction({ entryId: entry.id }))}
          >
            <Link2Off aria-hidden="true" /> Remove from superset
          </Button>
        )}
        {canLinkNext && (
          <Button
            size="sm"
            disabled={pending}
            aria-label={`Superset ${name} with next exercise`}
            onClick={() => run(() => linkSupersetAction({ entryId: entry.id }))}
          >
            <Link2 aria-hidden="true" /> Superset with next
          </Button>
        )}
        <Button
          size="sm"
          variant="destructive"
          disabled={pending}
          aria-label={`Remove ${name} from routine`}
          onClick={() => run(() => removeRoutineEntryAction({ id: entry.id }))}
        >
          <Trash2 aria-hidden="true" /> Remove
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {editing && (
        <EntryEditor
          entry={entry}
          routinePolicy={routinePolicy}
          weightUnit={weightUnit}
          onDone={() => setEditing(false)}
        />
      )}
    </Card>
  );
}

interface EntryListProps {
  routineId: number;
  entries: RoutineEntry[];
  routinePolicy: ProgressionPolicy;
  weightUnit: WeightUnit;
}

/** The routine's exercises in order; adjacent entries in one superset are boxed together. */
export function EntryList({ routineId, entries, routinePolicy, weightUnit }: EntryListProps) {
  const order = entries.map((e) => e.id);
  const groups = groupSupersets(entries);
  let index = 0;

  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      {groups.map((group) => {
        const grouped = group.length > 1;
        const rows = group.map((entry) => {
          const i = index++;
          const next = entries[i + 1];
          return (
            <li key={entry.id}>
              <EntryRow
                routineId={routineId}
                entry={entry}
                index={i}
                order={order}
                routinePolicy={routinePolicy}
                weightUnit={weightUnit}
                canLinkNext={
                  Boolean(next) &&
                  !(entry.supersetGroup !== null && next.supersetGroup === entry.supersetGroup)
                }
              />
            </li>
          );
        });
        return (
          <li key={group[0].id}>
            {grouped ? (
              <div className={cn("border-primary/40 rounded-xl border-l-4 pl-3")}>
                <Badge variant="secondary" className="mb-2">
                  Superset
                </Badge>
                <ol className="m-0 flex list-none flex-col gap-2 p-0">{rows}</ol>
              </div>
            ) : (
              <ol className="m-0 list-none p-0">{rows}</ol>
            )}
          </li>
        );
      })}
    </ol>
  );
}
