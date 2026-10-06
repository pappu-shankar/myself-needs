"use client";

import { ChartCard } from "@/components/ui/chart-card";
import { parseIsoDate } from "@/lib/dates";

type Level = 0 | 1 | 2 | 3 | 4;

export interface HeatmapDay {
  date: string;
  minutes: number;
  sessions: number;
  level: Level;
}

interface ActivityHeatmapProps {
  /** Whole Mon–Sun weeks, oldest first. */
  days: HeatmapDay[];
  title: string;
  description?: string;
}

const CELL_FILL: Record<Level, string> = {
  0: "color-mix(in oklab, var(--muted-foreground) 14%, var(--card))",
  1: "color-mix(in oklab, var(--primary) 28%, var(--card))",
  2: "color-mix(in oklab, var(--primary) 50%, var(--card))",
  3: "color-mix(in oklab, var(--primary) 75%, var(--card))",
  4: "var(--primary)",
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CELL = 14;
const GAP = 3;

/** Monday = 0 … Sunday = 6. */
function weekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function describeDay(day: HeatmapDay): string {
  const d = parseIsoDate(day.date);
  const label = `${WEEKDAYS[weekdayIndex(d)]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (day.sessions === 0 && day.minutes === 0) return `${label} — rest day`;
  return `${label} — ${day.sessions} ${day.sessions === 1 ? "session" : "sessions"}, ${day.minutes} min`;
}

export function ActivityHeatmap({ days, title, description }: ActivityHeatmapProps) {
  const weeks: HeatmapDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  // A month label sits above the first week whose Monday starts a new month.
  // Labels need ~3 columns of room, so when a month starts within 2 weeks of
  // the previous label (the partial first month of the window), that earlier
  // label gives way to the full month after it instead of overlapping.
  const monthLabels: string[] = weeks.map(() => "");
  let lastMonth = -1;
  let lastLabelAt = -1;
  weeks.forEach((week, index) => {
    const month = parseIsoDate(week[0].date).getMonth();
    if (month === lastMonth) return;
    lastMonth = month;
    if (lastLabelAt >= 0 && index - lastLabelAt < 3) monthLabels[lastLabelAt] = "";
    monthLabels[index] = MONTHS[month];
    lastLabelAt = index;
  });

  const active = days.filter((d) => d.sessions > 0 || d.minutes > 0);
  const totalSessions = active.reduce((s, d) => s + d.sessions, 0);
  const totalHours = active.reduce((s, d) => s + d.minutes, 0) / 60;
  const summary = `${totalSessions} ${totalSessions === 1 ? "session" : "sessions"} · ${totalHours.toFixed(1)} h · ${active.length} active ${active.length === 1 ? "day" : "days"}`;

  return (
    <ChartCard
      title={title}
      description={description}
      tableData={active}
      tableColumns={[
        { key: "date", label: "Date", render: (d) => describeDay(d).split(" — ")[0] },
        { key: "sessions", label: "Sessions", align: "right", render: (d) => d.sessions },
        { key: "minutes", label: "Minutes", align: "right", render: (d) => d.minutes },
      ]}
      emptyTitle="No training logged"
      emptyDescription="Finish a workout to start filling the grid."
    >
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm tabular-nums">{summary}</p>
        <div className="overflow-x-auto pb-1">
          <div
            role="img"
            aria-label={`Training activity, ${weeks.length} weeks. ${summary}.`}
            className="inline-grid text-xs"
            style={{
              gridTemplateColumns: `auto repeat(${weeks.length}, ${CELL}px)`,
              gridTemplateRows: `auto repeat(7, ${CELL}px)`,
              gap: GAP,
            }}
          >
            <span />
            {monthLabels.map((m, i) => (
              <span
                key={i}
                data-testid="month-label"
                className="text-muted-foreground overflow-visible whitespace-nowrap"
              >
                {m}
              </span>
            ))}
            {WEEKDAYS.map((name, row) => (
              <WeekdayRow key={name} name={name} row={row} weeks={weeks} />
            ))}
          </div>
        </div>
        <div className="text-muted-foreground flex items-center justify-end gap-1.5 text-xs">
          <span>Less</span>
          {([0, 1, 2, 3, 4] as const).map((l) => (
            <span
              key={l}
              className="border-border size-3.5 rounded-sm border"
              style={{ backgroundColor: CELL_FILL[l] }}
            />
          ))}
          <span>More</span>
        </div>
      </div>
    </ChartCard>
  );
}

function WeekdayRow({ name, row, weeks }: { name: string; row: number; weeks: HeatmapDay[][] }) {
  return (
    <>
      <span
        className="text-muted-foreground pr-1 leading-[14px]"
        style={{ gridRow: row + 2, gridColumn: 1 }}
        aria-hidden="true"
      >
        {row % 2 === 0 && row < 5 ? name : ""}
      </span>
      {weeks.map((week, col) => {
        const day = week[row];
        if (!day) return null;
        return (
          <span
            key={day.date}
            data-testid="heatmap-cell"
            data-level={day.level}
            title={describeDay(day)}
            className="border-border rounded-[3px] border"
            style={{
              gridRow: row + 2,
              gridColumn: col + 2,
              backgroundColor: CELL_FILL[day.level],
            }}
          />
        );
      })}
    </>
  );
}
