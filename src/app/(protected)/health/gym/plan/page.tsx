import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/modules/core/session/guard";
import {
  getWeekPlan,
  getWeekSchedule,
  listRoutines,
  listScheduleOverrides,
} from "@/modules/health";
import { addDays, todayIso } from "@/lib/dates";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatPlanDate } from "./plan-format";
import { RevertButton, WeekCalendar } from "./week-calendar";
import { WeekdayPlanForm } from "./weekday-plan-form";

export const metadata: Metadata = {
  title: "Weekly plan — Gym — Personal Life OS",
};

export default async function GymPlanPage() {
  await requireUser();
  const today = todayIso();
  const routines = listRoutines().map((r) => ({ id: r.id, name: r.name }));
  const schedule = getWeekSchedule();
  const thisWeek = getWeekPlan(today);
  const nextWeek = getWeekPlan(addDays(today, 7));
  const overrides = listScheduleOverrides(today, addDays(today, 60));

  return (
    <>
      <PageHeader
        title="Weekly plan"
        description="Which routine you train on each weekday, plus one-off changes for particular dates."
      />

      <div className="flex flex-col gap-8">
        <section aria-labelledby="repeat-heading">
          <h2 id="repeat-heading" className="mb-3 text-lg font-medium">
            Every week
          </h2>
          {routines.length === 0 ? (
            <EmptyState
              title="Create a routine first"
              description="The plan picks from your routines."
              action={
                <Link
                  href="/health/gym/routines"
                  className="text-primary text-sm underline-offset-4 hover:underline"
                >
                  Go to routines
                </Link>
              }
            />
          ) : (
            <Card className="max-w-2xl px-4">
              <WeekdayPlanForm schedule={schedule} routines={routines} />
            </Card>
          )}
        </section>

        <section aria-labelledby="this-week-heading">
          <h2 id="this-week-heading" className="mb-3 text-lg font-medium">
            This week
          </h2>
          <WeekCalendar days={thisWeek} today={today} routines={routines} />
        </section>

        <section aria-labelledby="next-week-heading">
          <h2 id="next-week-heading" className="mb-3 text-lg font-medium">
            Next week
          </h2>
          <WeekCalendar days={nextWeek} today={today} routines={routines} />
        </section>

        <section aria-labelledby="changes-heading">
          <h2 id="changes-heading" className="mb-3 text-lg font-medium">
            Upcoming one-off changes
          </h2>
          {overrides.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No one-off changes in the next 60 days. Use &ldquo;Move / replace&rdquo; on a day
              above to plan an exception.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {overrides.map((o) => (
                <li
                  key={o.date}
                  className="border-border flex flex-wrap items-center justify-between gap-2 border-b pb-2"
                >
                  <div>
                    <span className="font-medium tabular-nums">{formatPlanDate(o.date)}</span>
                    <span className="text-muted-foreground">
                      {" — "}
                      {o.routineName
                        ? `${o.routineName}${o.routineArchived ? " (archived)" : ""}`
                        : "Rest day"}
                      {o.note ? ` · ${o.note}` : ""}
                    </span>
                  </div>
                  <RevertButton date={o.date} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
