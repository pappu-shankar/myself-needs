import type { Metadata } from "next";
import { requireUser } from "@/modules/core/session/guard";
import { getGoals } from "@/modules/plans";
// Cross-module composition at the app layer, not a plans→finance import —
// see docs/prd/finance/goal-linked-investments.md.
import { getHoldingsByGoalId } from "@/modules/finance";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { GoalForm } from "./goal-form";
import { GoalRow } from "./goal-row";

export const metadata: Metadata = {
  title: "Plans — Personal Life OS",
};

export default async function PlansPage() {
  await requireUser();
  const goals = getGoals();

  return (
    <>
      <PageHeader
        title="Plans"
        description="Financial and non-financial goals, sorted by priority."
      />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base font-medium">Add goal</CardTitle>
        </CardHeader>
        <CardContent>
          <GoalForm />
        </CardContent>
      </Card>

      {goals.length === 0 ? (
        <EmptyState
          title="No goals yet"
          description="Add your first goal above to start tracking."
        />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Target date</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {goals.map((g) => (
                <GoalRow
                  key={g.id}
                  goal={g}
                  linkedHoldings={g.type === "financial" ? getHoldingsByGoalId(g.id) : []}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
