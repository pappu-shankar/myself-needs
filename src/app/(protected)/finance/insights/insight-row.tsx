"use client";

import { useActionState } from "react";
import Link from "next/link";
import {
  dismissInsightAction,
  type DismissInsightState,
} from "@/modules/finance/actions/domain/insights";
import type { Insight } from "@/modules/finance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const initialState: DismissInsightState = {};

const SEVERITY_VARIANT = {
  critical: "destructive",
  warning: "secondary",
  info: "outline",
} as const;

const SEVERITY_LABEL = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
} as const;

export function InsightRow({ insight }: { insight: Insight }) {
  const [state, formAction, isPending] = useActionState(dismissInsightAction, initialState);

  return (
    <li className="border-border flex items-start justify-between gap-4 border-b py-3 last:border-0">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <Badge variant={SEVERITY_VARIANT[insight.severity]}>
            {SEVERITY_LABEL[insight.severity]}
          </Badge>
        </div>
        <p className="text-sm">{insight.message}</p>
        <Link
          href={insight.link}
          className="text-primary text-sm underline-offset-4 hover:underline"
        >
          View
        </Link>
      </div>
      <div>
        <form action={formAction}>
          <input type="hidden" name="id" value={insight.id} />
          <Button type="submit" variant="ghost" size="sm" disabled={isPending}>
            {isPending ? "…" : "Dismiss"}
          </Button>
        </form>
        {state.error && (
          <p role="alert" className="text-destructive mt-1 text-right text-xs">
            {state.error}
          </p>
        )}
      </div>
    </li>
  );
}
