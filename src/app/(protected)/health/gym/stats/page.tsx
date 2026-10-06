import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/modules/core/session/guard";
import { getGymSettings, getGymStats, STATS_RANGES } from "@/modules/health";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toDisplayWeight } from "@/modules/health/engine/units";
import { cn } from "@/lib/utils";
import { ActivityHeatmap } from "../_components/activity-heatmap";
import { EffortCharts } from "./effort-charts";
import { MuscleMapCard } from "./muscle-map-card";
import { LoadCharts } from "./load-charts";
import { StatTile } from "./stat-tile";
import { TonnageChart } from "./tonnage-chart";
import { VolumeLandmarks } from "./volume-landmarks";
import {
  parseRange,
  pushPullReading,
  quadHamReading,
  RANGE_LABELS,
  ZONE_INFO,
  type Reading,
} from "./stats-helpers";

export const metadata: Metadata = {
  title: "Stats — Gym — Personal Life OS",
};

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description && <p className="text-muted-foreground mt-1 mb-4 text-sm">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </section>
  );
}

function BalanceCard({
  title,
  left,
  right,
  ratio,
  reading,
}: {
  title: string;
  left: { label: string; sets: number };
  right: { label: string; sets: number };
  ratio: number | null;
  reading: Reading;
}) {
  const total = left.sets + right.sets;
  const leftPct = total > 0 ? (left.sets / total) * 100 : 50;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">
          {ratio === null ? "—" : `${ratio.toFixed(2)} : 1`}
          <span className="text-muted-foreground ml-2 text-sm font-normal">{reading.label}</span>
        </p>
        <div aria-hidden="true" className="bg-muted mt-3 flex h-3 overflow-hidden rounded-full">
          <div style={{ width: `${leftPct}%`, background: "var(--chart-1)" }} />
          <div className="flex-1" style={{ background: "var(--chart-2)" }} />
        </div>
        <p className="mt-2 flex justify-between text-sm tabular-nums">
          <span>
            {left.label} {left.sets} sets
          </span>
          <span>
            {right.label} {right.sets} sets
          </span>
        </p>
        <p className="text-muted-foreground mt-3 text-sm">{reading.text}</p>
      </CardContent>
    </Card>
  );
}

export default async function GymStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[]; map?: string | string[] }>;
}) {
  await requireUser();
  const params = await searchParams;
  const range = parseRange(params.range);
  const mapView =
    (Array.isArray(params.map) ? params.map[0] : params.map) === "hard" ? "hard" : "all";
  const stats = getGymStats(range);
  const settings = getGymSettings();
  const { totals, streak, muscles, hardMuscles, balance, effort, load } = stats;
  const unit = settings.weightUnit;
  const zone = load.zone ? ZONE_INFO[load.zone] : null;

  return (
    <>
      <PageHeader
        title="Stats"
        description="What your training adds up to — all derived from your logged sets."
      />

      <nav aria-label="Time range" className="-mt-2 mb-6 flex flex-wrap gap-2">
        {STATS_RANGES.map((r) => (
          <Link
            key={r}
            href={`/health/gym/stats?range=${r}`}
            aria-current={r === range ? "page" : undefined}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              r === range
                ? "bg-primary text-primary-foreground border-primary"
                : "hover:bg-muted text-foreground",
            )}
          >
            {RANGE_LABELS[r]}
          </Link>
        ))}
      </nav>

      <Section title={`Totals — ${RANGE_LABELS[range].toLowerCase()}`}>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile label="Sessions" value={totals.sessions.toLocaleString()} />
          <StatTile
            label="Time trained"
            value={totals.minutes < 60 ? String(totals.minutes) : (totals.minutes / 60).toFixed(1)}
            unit={totals.minutes < 60 ? "min" : "h"}
          />
          <StatTile label="Working sets" value={totals.sets.toLocaleString()} />
          <StatTile
            label="Tonnage"
            value={Math.round(toDisplayWeight(totals.tonnageKg, unit)).toLocaleString()}
            unit={unit}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatTile
            label="Current streak"
            value={String(streak.current)}
            unit={streak.current === 1 ? "week" : "weeks"}
            detail="Consecutive weeks with a session"
          />
          <StatTile
            label="Longest streak"
            value={String(streak.longest)}
            unit={streak.longest === 1 ? "week" : "weeks"}
          />
        </div>
      </Section>

      <Section title="Activity">
        <ActivityHeatmap days={stats.heatmap} title="Last year" />
      </Section>

      <Section
        title="Muscles trained"
        description={`Working sets per muscle over ${RANGE_LABELS[range].toLowerCase()}. Supporting muscles get half credit for compound lifts.`}
      >
        <MuscleMapCard
          muscles={muscles}
          hardMuscles={hardMuscles}
          figure={settings.sex ?? "male"}
          initialView={mapView}
        />
      </Section>

      <Section
        title="Volume vs landmarks"
        description="Hard sets in the last 7 days against research-informed weekly targets (Renaissance Periodization). A hard set is a working set within about 3 reps of failure; unrated sets count."
      >
        <Card>
          <CardContent>
            <dl className="text-muted-foreground mb-5 grid gap-1 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-foreground inline font-medium">MEV </dt>
                <dd className="inline">minimum effective volume: below it, little growth.</dd>
              </div>
              <div>
                <dt className="text-foreground inline font-medium">MAV </dt>
                <dd className="inline">
                  maximum adaptive volume: the shaded green band, where most progress happens.
                </dd>
              </div>
              <div>
                <dt className="text-foreground inline font-medium">MRV </dt>
                <dd className="inline">
                  maximum recoverable volume: beyond it, you recover poorly.
                </dd>
              </div>
            </dl>
            <VolumeLandmarks volume={stats.volume} />
            <p className="text-muted-foreground mt-5 text-xs">
              Landmarks are population averages and vary by person and experience. Use them as a
              starting range, not a rule.
            </p>
          </CardContent>
        </Card>
      </Section>

      <Section
        title="Balance"
        description="Hard sets over the last 4 weeks. Rules of thumb, not medical advice."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <BalanceCard
            title="Push : pull"
            left={{ label: "Push", sets: balance.pushPull.push }}
            right={{ label: "Pull", sets: balance.pushPull.pull }}
            ratio={balance.pushPull.ratio}
            reading={pushPullReading(
              balance.pushPull.ratio,
              balance.pushPull.push,
              balance.pushPull.pull,
            )}
          />
          <BalanceCard
            title="Quads : hamstrings"
            left={{ label: "Quads", sets: balance.quadHam.quad }}
            right={{ label: "Hamstrings", sets: balance.quadHam.ham }}
            ratio={balance.quadHam.ratio}
            reading={quadHamReading(
              balance.quadHam.ratio,
              balance.quadHam.quad,
              balance.quadHam.ham,
            )}
          />
        </div>
      </Section>

      <Section title="Weekly tonnage">
        <TonnageChart weekly={stats.weeklyTonnage} today={stats.to} unit={unit} />
      </Section>

      {effort.summary.rated > 0 && (
        <Section
          title="Effort"
          description="From the sets you rated with RIR or RPE. RPE 8 is about 2 reps in reserve (RIR 2)."
        >
          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label="Average RIR"
              value={effort.summary.avgRir === null ? "—" : effort.summary.avgRir.toFixed(1)}
              detail={effort.summary.avgRir === null ? "Needs at least 5 rated sets" : undefined}
            />
            <StatTile
              label="Hard sets"
              value={
                effort.summary.hardPct === null
                  ? "—"
                  : `${Math.round(effort.summary.hardPct * 100)}%`
              }
              detail="Rated sets within 3 reps of failure"
            />
            <StatTile
              label="Sets rated"
              value={`${effort.summary.rated} / ${effort.summary.done}`}
              detail="Rated of completed working sets"
            />
          </div>
          <EffortCharts histogram={effort.histogram} weekly={effort.weekly} />
        </Section>
      )}

      <Section
        title="Training load"
        description="Load = session minutes × session RPE (Foster 2001). The acute:chronic ratio compares the last 7 days with the last 28 (Gabbett 2016)."
      >
        <Card className="mb-4">
          <CardContent>
            {load.today.ratio === null || !zone ? (
              <p className="text-muted-foreground text-sm">
                Not enough history for a ratio yet: it needs about three weeks of training.
              </p>
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums">
                  {load.today.ratio.toFixed(2)}
                  <span className="ml-2 inline-flex items-center gap-1.5 text-sm font-normal">
                    <span
                      aria-hidden="true"
                      className="inline-block size-2.5 rounded-full"
                      style={{ background: zone.color }}
                    />
                    {zone.label}
                  </span>
                </p>
                <p className="text-muted-foreground mt-1 text-sm tabular-nums">
                  7-day average {load.today.acute} AU/day · 28-day average {load.today.chronic}{" "}
                  AU/day
                </p>
                <p className="mt-2 text-sm">{zone.text}</p>
              </>
            )}
            <p className="text-muted-foreground mt-3 text-xs">
              The ratio is a rough guide to how sudden your workload changes are. It does not
              predict injury for any one person, and sessions without a rating assume RPE 5.
            </p>
          </CardContent>
        </Card>
        <LoadCharts series={load.series} />
      </Section>
    </>
  );
}
