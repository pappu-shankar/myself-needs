import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, History, Play } from "lucide-react";
import { requireUser } from "@/modules/core/session/guard";
import { getActiveWorkout, getGymSettings, listWorkouts } from "@/modules/health";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WorkoutList } from "./workout-list";

export const metadata: Metadata = {
  title: "History — Gym — Personal Life OS",
};

const PAGE_SIZE = 20;

function parsePage(raw: string | string[] | undefined): number {
  const value = Number.parseInt((Array.isArray(raw) ? raw[0] : raw) ?? "", 10);
  return Number.isFinite(value) && value > 1 ? Math.min(value, 100_000) : 1;
}

const pageHref = (page: number) => `/health/gym/history${page > 1 ? `?page=${page}` : ""}`;

export default async function WorkoutHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const page = parsePage((await searchParams).page);
  const { rows, total } = listWorkouts({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const active = getActiveWorkout();
  const { weightUnit } = getGymSettings();
  const linkButton = cn(buttonVariants({ variant: "outline" }), "h-10 px-3");

  return (
    <>
      <PageHeader
        title="History"
        description={
          total > 0
            ? `${total} finished ${total === 1 ? "workout" : "workouts"}. Open one to see its records or fix a set.`
            : "Every finished workout lands here."
        }
      />

      {active && (
        <Link
          href="/health/gym/workout"
          className="bg-primary/10 hover:bg-primary/15 mb-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium"
        >
          <Play className="size-4" aria-hidden="true" />
          {active.name} is in progress — resume it
        </Link>
      )}

      {total === 0 ? (
        <EmptyState
          icon={History}
          title="No workouts yet"
          description="Finish a workout and it shows up here with its records and muscles worked."
          action={
            <Link
              href="/health/gym/workout"
              className={cn(buttonVariants({ variant: "default" }), "h-10")}
            >
              Start a workout
            </Link>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title={`There's no page ${page}`}
          description={`History has ${pages} ${pages === 1 ? "page" : "pages"}.`}
          action={
            <Link href={pageHref(1)} className={linkButton}>
              Back to the newest
            </Link>
          }
        />
      ) : (
        <>
          <WorkoutList rows={rows} weightUnit={weightUnit} />
          {pages > 1 && (
            <nav
              aria-label="History pages"
              className="mt-4 flex items-center justify-between gap-3 text-sm"
            >
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className={linkButton} rel="prev">
                  <ChevronLeft aria-hidden="true" />
                  Newer
                </Link>
              ) : (
                <span />
              )}
              <span className="text-muted-foreground tabular-nums">
                Page {page} of {pages}
              </span>
              {page < pages ? (
                <Link href={pageHref(page + 1)} className={linkButton} rel="next">
                  Older
                  <ChevronRight aria-hidden="true" />
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
