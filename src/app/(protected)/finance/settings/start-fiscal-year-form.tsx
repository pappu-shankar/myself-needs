"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { startFiscalYearAction } from "@/modules/finance/actions/config/tax";
import type { ActionState } from "@/modules/core/action/types";
import { useActionSuccess } from "@/lib/use-action-success";
import { Button } from "@/components/ui/button";

const initialState: ActionState<{ fiscalYear: string }> = {};

/** Creates an FY by copying the most recent FY's tax settings and slabs, then switches to it. */
export function StartFiscalYearForm({
  candidates,
  defaultValue,
  copyFrom,
}: {
  candidates: string[];
  defaultValue: string;
  copyFrom: string;
}) {
  const [state, formAction, isPending] = useActionState(startFiscalYearAction, initialState);
  const router = useRouter();
  useActionSuccess(state, (data) => {
    if (data) router.push(`/finance/settings?fy=${data.fiscalYear}`);
  });

  if (candidates.length === 0) return null;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <label htmlFor="start-fiscal-year" className="text-sm">
        Start FY
      </label>
      <select
        id="start-fiscal-year"
        name="fiscalYear"
        defaultValue={defaultValue}
        className="border-input h-8 rounded-lg border bg-transparent px-2 text-sm"
      >
        {candidates.map((fy) => (
          <option key={fy} value={fy}>
            {fy}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? "Starting…" : "Start"}
      </Button>
      <span className="text-muted-foreground text-xs">
        Copies FY {copyFrom}&apos;s settings and slabs — then edit what that year&apos;s budget
        changed.
      </span>
      {state.error && (
        <p role="alert" className="text-destructive w-full text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}
