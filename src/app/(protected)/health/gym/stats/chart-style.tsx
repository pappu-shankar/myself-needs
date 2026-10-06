import { parseIsoDate } from "@/lib/dates";

/** Shared recharts styling for the gym stats and body charts — tokens only, as in metric-trend-chart. */
export const AXIS_TICK = { fill: "var(--muted-foreground)", fontSize: 12 } as const;
export const AXIS_LINE = { stroke: "var(--border)" } as const;

export function yAxisLabel(value: string) {
  return {
    value,
    angle: -90,
    position: "insideLeft",
    fill: "var(--muted-foreground)",
    fontSize: 12,
  } as const;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "4 Oct" for an ISO date. */
export function shortDate(iso: string): string {
  const d = parseIsoDate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Tooltip card matching the other charts; `render` draws the point's content. */
export function PointTooltip<T>({
  active,
  payload,
  render,
}: {
  active?: boolean;
  payload?: { payload: T }[];
  render: (point: T) => React.ReactNode;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card ring-foreground/10 rounded-md px-3 py-2 text-sm tabular-nums shadow-md ring-1">
      {render(payload[0].payload)}
    </div>
  );
}
