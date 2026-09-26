import Link from "next/link";
import type { Insight } from "@/modules/finance";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SEVERITY_VARIANT = {
  critical: "destructive",
  warning: "secondary",
  info: "outline",
} as const;

const CATEGORY_LABEL = {
  audit: "Audit",
  advocate: "Advocate",
  compliance: "Compliance",
} as const;

const MAX_SHOWN = 3;

/** Inline surface on the finance home page — the same rules/numbers as `/finance/insights`, just the top few. See docs/prd/finance/insights.md. */
export function InsightsBanner({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;

  const shown = insights.slice(0, MAX_SHOWN);

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-medium">Insights</CardTitle>
        <Link
          href="/finance/insights"
          className="text-primary text-sm underline-offset-4 hover:underline"
        >
          View all ({insights.length})
        </Link>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {shown.map((insight) => (
            <li key={insight.id} className="flex items-start gap-2 text-sm">
              <Badge variant={SEVERITY_VARIANT[insight.severity]} className="mt-0.5">
                {CATEGORY_LABEL[insight.category]}
              </Badge>
              <span>{insight.message}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
