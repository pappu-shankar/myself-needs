import type { Metadata } from "next";
import Link from "next/link";
import { getInsights, type Insight, type InsightCategory } from "@/modules/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { InsightRow } from "./insight-row";

export const metadata: Metadata = {
  title: "Insights — Personal Life OS",
};

const CATEGORY_META: Record<InsightCategory, { title: string; description: string }> = {
  audit: { title: "Auditor", description: "Data-quality issues worth a second look." },
  advocate: {
    title: "Advocate",
    description: "Suggestions that could put money back in your pocket.",
  },
  compliance: {
    title: "Compliance watch",
    description: "Limits, thresholds, and dates that need attention.",
  },
};

function CategorySection({
  category,
  insights,
}: {
  category: InsightCategory;
  insights: Insight[];
}) {
  const meta = CATEGORY_META[category];
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base font-medium">{meta.title}</CardTitle>
        <p className="text-muted-foreground mt-1 text-sm">{meta.description}</p>
      </CardHeader>
      <CardContent>
        {insights.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing here right now.</p>
        ) : (
          <ul>
            {insights.map((insight) => (
              <InsightRow key={insight.id} insight={insight} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default function InsightsPage() {
  const insights = getInsights();

  const byCategory: Record<InsightCategory, Insight[]> = {
    audit: [],
    advocate: [],
    compliance: [],
  };
  for (const insight of insights) byCategory[insight.category].push(insight);

  return (
    <>
      <PageHeader
        title="Insights"
        description="Auditor, advocate, and compliance-watch rules — reading the same numbers as the rest of Finance, never a second opinion."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/finance/settings" />}
            >
              Thresholds
            </Button>
            <Button variant="outline" nativeButton={false} render={<Link href="/finance" />}>
              Back to Finance
            </Button>
          </div>
        }
      />

      {insights.length === 0 ? (
        <EmptyState
          title="Nothing to flag right now"
          description="Insights will show up here as your data grows."
          className="mb-6"
        />
      ) : (
        <>
          <CategorySection category="audit" insights={byCategory.audit} />
          <CategorySection category="advocate" insights={byCategory.advocate} />
          <CategorySection category="compliance" insights={byCategory.compliance} />
        </>
      )}
    </>
  );
}
