import type { Metadata } from "next";
import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { requireUser } from "@/modules/core/session/guard";
import { listRoutines, listTemplates } from "@/modules/health";
import { POLICY_LABELS } from "@/modules/health/types";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { CreateRoutineForm } from "./create-routine-form";
import { RoutineActions } from "./routine-actions";
import { TemplatesSection } from "./templates-section";

export const metadata: Metadata = {
  title: "Routines — Gym — Personal Life OS",
};

export default async function RoutinesPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  await requireUser();
  const { archived } = await searchParams;
  const showArchived = archived === "1";
  const routines = listRoutines({ includeArchived: showArchived });
  const templates = listTemplates();

  return (
    <>
      <PageHeader
        title="Routines"
        description="Reusable workouts. Loads and reps adjust themselves from your history."
        actions={
          <Link
            href={showArchived ? "/health/gym/routines" : "/health/gym/routines?archived=1"}
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            {showArchived ? "Hide archived" : "Show archived"}
          </Link>
        }
      />

      <section aria-labelledby="new-routine-heading" className="mb-8">
        <h2 id="new-routine-heading" className="mb-3 text-lg font-medium">
          New routine
        </h2>
        <CreateRoutineForm />
      </section>

      <section aria-labelledby="routines-heading" className="mb-8">
        <h2 id="routines-heading" className="mb-3 text-lg font-medium">
          Your routines
        </h2>
        {routines.length === 0 ? (
          <EmptyState
            icon={Dumbbell}
            title="No routines yet"
            description="Create one above, or add a starter program below and edit it to taste."
            action={
              <a
                href="#templates-heading"
                className="text-primary text-sm underline-offset-4 hover:underline"
              >
                Jump to starter programs
              </a>
            }
          />
        ) : (
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-2">
            {routines.map((routine) => (
              <li key={routine.id}>
                <Card className="h-full gap-3 px-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-medium">
                        <Link
                          href={`/health/gym/routines/${routine.id}`}
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {routine.name}
                        </Link>
                      </h3>
                      <p className="text-muted-foreground text-sm tabular-nums">
                        {routine.entryCount} {routine.entryCount === 1 ? "exercise" : "exercises"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {routine.archivedAt && <Badge variant="secondary">Archived</Badge>}
                      <Badge variant="outline">{POLICY_LABELS[routine.progressionPolicy]}</Badge>
                    </div>
                  </div>
                  {routine.exerciseNames.length > 0 && (
                    <p className="text-muted-foreground text-sm">
                      {routine.exerciseNames.join(" · ")}
                      {routine.entryCount > routine.exerciseNames.length ? " …" : ""}
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-2">
                    <Link
                      href={`/health/gym/routines/${routine.id}`}
                      className={cn(buttonVariants({ variant: "default", size: "sm" }))}
                      aria-label={`Open ${routine.name}`}
                    >
                      Open
                    </Link>
                    <RoutineActions
                      id={routine.id}
                      name={routine.name}
                      archived={Boolean(routine.archivedAt)}
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="templates-heading">
        <h2 id="templates-heading" className="mb-1 text-lg font-medium">
          Starter programs
        </h2>
        <p className="text-muted-foreground mb-3 text-sm">
          Adding one creates ordinary routines you can edit. Ticking &ldquo;Also set my weekly
          plan&rdquo; replaces your current weekly plan.
        </p>
        <TemplatesSection templates={templates} />
      </section>
    </>
  );
}
