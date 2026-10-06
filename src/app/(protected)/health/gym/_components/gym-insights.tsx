"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { dismissGymInsightAction } from "@/modules/health/actions/gym/insights";
import type { GymInsight } from "@/modules/health";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const SEVERITY = {
  critical: { label: "Important", variant: "destructive" },
  warning: { label: "Heads up", variant: "secondary" },
  info: { label: "Note", variant: "outline" },
} as const;

const CATEGORY_LABEL: Record<GymInsight["category"], string> = {
  progress: "Progress",
  recovery: "Recovery",
  balance: "Balance",
  consistency: "Consistency",
  body: "Body",
};

function InsightItem({ insight }: { insight: GymInsight }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const severity = SEVERITY[insight.severity];

  return (
    <li className="border-border flex items-start justify-between gap-3 border-b py-3 last:border-0">
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2">
          <Badge variant={severity.variant}>{severity.label}</Badge>
          <span className="text-muted-foreground text-xs">{CATEGORY_LABEL[insight.category]}</span>
        </div>
        <p className="text-sm">{insight.message}</p>
        <Link
          href={insight.link}
          className="text-primary text-sm underline-offset-4 hover:underline"
        >
          View
        </Link>
        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await dismissGymInsightAction({ id: insight.id });
            if (result.error) setError(result.error);
          })
        }
      >
        Dismiss
      </Button>
    </li>
  );
}

/** Coach-style notes from the gym insight rules; each can be dismissed (only that exact instance). */
export function GymInsights({ insights, limit }: { insights: GymInsight[]; limit?: number }) {
  const shown = limit ? insights.slice(0, limit) : insights;
  if (shown.length === 0) {
    return <p className="text-muted-foreground text-sm">Nothing to flag right now.</p>;
  }
  return (
    <ul>
      {shown.map((insight) => (
        <InsightItem key={insight.id} insight={insight} />
      ))}
    </ul>
  );
}
