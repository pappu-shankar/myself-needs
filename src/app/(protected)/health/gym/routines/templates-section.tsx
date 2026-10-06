"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { applyTemplateAction } from "@/modules/health/actions/gym/routines";
import { WEEKDAY_LABELS } from "@/modules/health/types";
import type { TemplateSummary } from "@/modules/health";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useRunAction } from "./use-run-action";

/** "Mon, Wed" from weekday numbers (0 = Sunday), Monday first. */
function dayNames(weekdays: readonly number[]): string {
  return [...weekdays]
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((d) => WEEKDAY_LABELS[d].slice(0, 3))
    .join(", ");
}

function TemplateCard({ template }: { template: TemplateSummary }) {
  const router = useRouter();
  const checkboxId = useId();
  const [assignWeek, setAssignWeek] = useState(false);
  const [added, setAdded] = useState<number | null>(null);
  const { pending, error, run } = useRunAction();

  return (
    <Card className="gap-3 px-4">
      <div>
        <h3 className="font-medium">{template.name}</h3>
        <p className="text-muted-foreground text-sm">{template.description}</p>
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
        {template.days.map((day) => (
          <li key={day.name} className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{day.name}</span>
            {day.weekdays.length > 0 && <Badge variant="secondary">{dayNames(day.weekdays)}</Badge>}
            <span className="text-muted-foreground">{day.exercises.join(", ")}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <input
            id={checkboxId}
            type="checkbox"
            checked={assignWeek}
            onChange={(e) => setAssignWeek(e.target.checked)}
            className="size-4"
          />
          <label htmlFor={checkboxId} className="text-sm">
            Also set my weekly plan
          </label>
        </div>
        <Button
          variant="default"
          size="sm"
          disabled={pending}
          aria-label={`Add ${template.name}`}
          onClick={() =>
            run(
              () => applyTemplateAction({ key: template.key, assignWeek }),
              (data) => {
                setAdded(data?.routineIds.length ?? 0);
                router.refresh();
              },
            )
          }
        >
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      {assignWeek && (
        <p className="text-muted-foreground text-sm">
          This replaces your current weekly plan with this program&apos;s days.
        </p>
      )}
      {added !== null && (
        <p role="status" className="text-sm">
          Added {added} {added === 1 ? "routine" : "routines"}.
        </p>
      )}
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </Card>
  );
}

export function TemplatesSection({ templates }: { templates: TemplateSummary[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {templates.map((template) => (
        <TemplateCard key={template.key} template={template} />
      ))}
    </div>
  );
}
