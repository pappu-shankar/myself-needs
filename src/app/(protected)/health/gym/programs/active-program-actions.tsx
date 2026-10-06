"use client";

import { endProgramAction } from "@/modules/health/actions/gym/programs";
import { Button } from "@/components/ui/button";
import { useRunAction } from "../routines/use-run-action";

/** Ends the running program as completed, or archives it. */
export function ActiveProgramActions({ id, name }: { id: number; name: string }) {
  const { pending, error, run } = useRunAction();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          aria-label={`End ${name} as completed`}
          onClick={() => run(() => endProgramAction({ id, status: "completed" }))}
        >
          End program
        </Button>
        <Button
          size="sm"
          disabled={pending}
          aria-label={`Archive ${name}`}
          onClick={() => run(() => endProgramAction({ id, status: "archived" }))}
        >
          Archive
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  );
}
