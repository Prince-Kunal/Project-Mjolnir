import { addDays, weekKey } from '@mjolnir/domain';
import { type ReactNode, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Loading, Notice } from '../../components/ui.tsx';
import {
  AREA_COLORS,
  NO_AREA_COLOR,
  summarise,
  type TrendDay,
  useAreasReport,
  useMisses,
  useTrend,
} from '../../lib/analytics.ts';
import { BAND_LABEL } from '../../lib/bands.ts';
import { useDay } from '../../lib/day.ts';
import { formatDayMonth, formatMinutes, formatWeekday } from '../../lib/format.ts';
import { useAreas, useProfile } from '../../lib/queries.ts';
import { MissGrid } from './MissGrid.tsx';

const RANGES = [
  { key: '4w', label: '4 weeks', days: 28 },
  { key: '12w', label: '12 weeks', days: 84 },
  { key: '1y', label: 'Year', days: 365 },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

const AXIS = { stroke: 'var(--color-border)', tick: { fill: 'var(--color-muted)', fontSize: 11 } };
const GRID = <CartesianGrid stroke="var(--color-border)" strokeOpacity={0.5} vertical={false} />;

/** Screen 8: trends, areas, hours, misses, streaks, tags and estimates over a chosen range. */
export function AnalyticsPage() {
  const { data: day } = useDay();
  const { data: profile } = useProfile();
  const [rangeKey, setRangeKey] = useState<RangeKey>('4w');
  if (!day || !profile) return <Loading />;
  const range = RANGES.find((r) => r.key === rangeKey)!;
  const to = day.today;
  // Whole weeks, so the weekly charts never start with a partial week.
  const from = weekKey(addDays(to, -(range.days - 1)), profile.week_start);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] leading-tight md:text-[32px]">Analytics</h1>
        <div
          role="radiogroup"
          aria-label="Range"
          className="flex rounded-full bg-surface-2 p-1 text-sm"
        >
          {RANGES.map((r) => (
            <button
              key={r.key}
              role="radio"
              aria-checked={rangeKey === r.key}
              onClick={() => setRangeKey(r.key)}
              className={`rounded-md px-3 py-1 ${rangeKey === r.key ? 'bg-text font-medium text-bg' : 'text-muted'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>
      <Report key={`${from}:${to}`} from={from} to={to} />
    </div>
  );
}

function Report({ from, to }: { from: string; to: string }) {
  const trend = useTrend(from, to);
  const areas = useAreasReport(from, to);
  const misses = useMisses(from, to);

  if (trend.isLoading || areas.isLoading || misses.isLoading) return <Loading />;
  if (trend.error || areas.error || misses.error || !trend.data || !areas.data || !misses.data)
    return <Notice tone="error">Could not load analytics. Try again.</Notice>;

  const s = summarise(trend.data);
  const est = misses.data.estimate;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          label="Success rate"
          value={s.rate === null ? '—' : `${s.rate}%`}
          note="closed days, points-weighted"
        />
        <StatTile label="Days counted" value={`${s.counted} / ${s.closed}`} note="50% or more" />
        <StatTile label="Best streak" value={String(s.bestStreak)} note="in this range" />
        <StatTile
          label="Estimates"
          value={est.ratio === null ? '—' : `${Math.round(est.ratio * 100)}%`}
          note={
            est.count
              ? `actual of planned time, ${est.count} task${est.count === 1 ? '' : 's'}`
              : 'enter actual minutes when ticking'
          }
        />
      </div>

      <Panel
        title="Daily success rate"
        legend={
          <>
            <LegendKey color={RATE_BAR} label="Daily rate" />
            <LegendKey color="var(--color-accent)" label="7-day average" line />
          </>
        }
      >
        {trend.data.length ? <RateChart days={trend.data} /> : <Empty />}
      </Panel>

      <div className="grid gap-5 md:grid-cols-2">
        <AreasPanel weeks={areas.data.areas} />
        <Panel
          title="Planned vs done hours"
          note="Calendar blocks per week"
          legend={
            <>
              <LegendKey color={PLANNED} label="Planned" />
              <LegendKey color={AREA_COLORS[0]!} label="Done" />
            </>
          }
        >
          {areas.data.hours.length ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={areas.data.hours.map((h) => ({
                  week: h.week,
                  planned: h.planned_minutes / 60,
                  done: h.done_minutes / 60,
                }))}
                barGap={2}
              >
                {GRID}
                <XAxis dataKey="week" tickFormatter={formatDayMonth} {...AXIS} />
                <YAxis {...AXIS} width={32} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'var(--color-surface-2)' }}
                  content={<ChartTip format={(v) => formatMinutes(Math.round(v * 60))} />}
                />
                <Bar
                  isAnimationActive={false}
                  dataKey="planned"
                  name="Planned"
                  fill={PLANNED}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={18}
                />
                <Bar
                  isAnimationActive={false}
                  dataKey="done"
                  name="Done"
                  fill="var(--color-accent)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={18}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty />
          )}
        </Panel>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Panel title="When tasks get missed" note="Missed share of planned points, by start time">
          {misses.data.slots.length ? <MissGrid slots={misses.data.slots} /> : <Empty />}
        </Panel>
        <Panel title="Streak">
          {trend.data.some((d) => d.streak_after !== null) ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend.data}>
                {GRID}
                <XAxis dataKey="date" tickFormatter={formatDayMonth} minTickGap={24} {...AXIS} />
                <YAxis {...AXIS} width={32} allowDecimals={false} />
                <Tooltip
                  cursor={{ stroke: 'var(--color-muted)' }}
                  content={<ChartTip format={(v) => `${v} day${v === 1 ? '' : 's'}`} />}
                />
                <Line
                  isAnimationActive={false}
                  type="stepAfter"
                  dataKey="streak_after"
                  name="Streak"
                  stroke="var(--color-accent)"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty />
          )}
        </Panel>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Panel title="Top tags by hours done">
          {areas.data.tags.length ? <TagBars tags={areas.data.tags} /> : <Empty />}
        </Panel>
        <Panel title="Reschedule chains" note="Missed tasks moved again and again">
          {misses.data.chains.length ? (
            <ul className="divide-y divide-rule text-sm">
              {misses.data.chains.slice(0, 8).map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="text-xs text-muted tabular-nums">
                    {formatWeekday(c.logical_date)} {formatDayMonth(c.logical_date)}
                  </span>
                  <span className="w-28 text-right text-xs tabular-nums">
                    moved {c.times}× ·{' '}
                    <span
                      className={
                        c.last_status === 'done' ? 'text-band-excellent' : 'text-band-not-good'
                      }
                    >
                      {c.last_status === 'done'
                        ? 'done'
                        : c.last_status === 'pending'
                          ? 'open'
                          : c.last_status}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty text="No task was rescheduled after a miss." />
          )}
        </Panel>
      </div>
    </>
  );
}

const PLANNED = '#5f5a53';
const RATE_BAR = '#6d675f';
const RATE_OPEN = '#3d3934';

function RateChart({ days }: { days: TrendDay[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart
        data={days}
        barCategoryGap={days.length > 120 ? 0 : 2}
        margin={{ top: 4, right: 72, bottom: 0, left: 0 }}
      >
        {GRID}
        <XAxis dataKey="date" tickFormatter={formatDayMonth} minTickGap={24} {...AXIS} />
        <YAxis {...AXIS} width={36} domain={[0, 100]} ticks={[0, 50, 75, 85, 100]} unit="%" />
        <Tooltip cursor={{ fill: 'var(--color-surface-2)' }} content={<RateTip />} />
        {/* The band edges as reference lines; the bars stay neutral so the one hue is the average. */}
        {(
          [
            [50, 'Fair'],
            [75, 'Good'],
            [85, 'Excellent'],
          ] as const
        ).map(([y, label]) => (
          <ReferenceLine
            key={y}
            y={y}
            stroke="var(--color-border)"
            strokeDasharray="3 3"
            label={{
              value: label,
              position: 'right',
              fill: 'var(--color-faint)',
              fontSize: 12,
            }}
          />
        ))}
        <Bar
          dataKey="rate"
          name="Daily rate"
          radius={[3, 3, 0, 0]}
          maxBarSize={16}
          isAnimationActive={false}
        >
          {days.map((d) => (
            <Cell
              key={d.date}
              fill={!d.planned ? 'transparent' : d.finalized ? RATE_BAR : RATE_OPEN}
            />
          ))}
        </Bar>
        <Line
          isAnimationActive={false}
          type="linear"
          dataKey="avg7"
          name="7-day average"
          stroke="var(--color-accent)"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function RateTip({ active, payload }: { active?: boolean; payload?: { payload: TrendDay }[] }) {
  const d = payload?.[0]?.payload;
  if (!active || !d) return null;
  return (
    <TipBox title={`${formatWeekday(d.date)} ${formatDayMonth(d.date)}`}>
      <p>
        {d.planned > 0
          ? `${d.rate}% · ${BAND_LABEL[d.band]} · ${d.done} of ${d.planned} points`
          : 'Nothing planned'}
        {!d.finalized && ' (so far)'}
      </p>
      <p className="text-muted">7-day average {d.avg7}%</p>
    </TipBox>
  );
}

function AreasPanel({
  weeks,
}: {
  weeks: { week: string; area_id: string | null; planned: number; done: number }[];
}) {
  const { data: areas = [] } = useAreas();
  const name = (id: string | null) => areas.find((a) => a.id === id)?.name ?? 'No area';
  const color = (id: string | null) => {
    const i = areas.findIndex((a) => a.id === id);
    return i >= 0 && i < AREA_COLORS.length ? AREA_COLORS[i]! : NO_AREA_COLOR;
  };
  const keys = [...new Set(weeks.map((w) => w.area_id ?? 'none'))].sort(
    (a, b) =>
      (areas.findIndex((x) => x.id === a) + 1 || 99) -
      (areas.findIndex((x) => x.id === b) + 1 || 99),
  );
  const rows = [...new Set(weeks.map((w) => w.week))].map((week) => {
    const row: Record<string, number | string> = { week };
    for (const w of weeks.filter((x) => x.week === week)) {
      row[w.area_id ?? 'none'] = w.done;
      row[`${w.area_id ?? 'none'}:planned`] = w.planned;
    }
    return row;
  });

  return (
    <Panel
      title="Points by area"
      note="Done points per week"
      legend={keys.map((k) => {
        const id = k === 'none' ? null : k;
        return <LegendKey key={k} color={color(id)} label={name(id)} />;
      })}
    >
      {rows.length ? (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={rows}>
            {GRID}
            <XAxis dataKey="week" tickFormatter={formatDayMonth} {...AXIS} />
            <YAxis {...AXIS} width={32} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'var(--color-surface-2)' }}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as Record<string, number | string> | undefined;
                if (!active || !row) return null;
                return (
                  <TipBox title={`Week of ${formatDayMonth(String(row.week))}`}>
                    {keys
                      .filter((k) => row[`${k}:planned`] !== undefined)
                      .map((k) => (
                        <p key={k}>
                          {name(k === 'none' ? null : k)}: {row[k] ?? 0} of {row[`${k}:planned`]}{' '}
                          points
                        </p>
                      ))}
                  </TipBox>
                );
              }}
            />
            {keys.map((k, i) => (
              <Bar
                isAnimationActive={false}
                key={k}
                dataKey={k}
                stackId="done"
                name={name(k === 'none' ? null : k)}
                fill={color(k === 'none' ? null : k)}
                stroke="var(--color-surface)"
                strokeWidth={2}
                radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0}
                maxBarSize={28}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <Empty />
      )}
    </Panel>
  );
}

function TagBars({ tags }: { tags: { tag_id: string; name: string; minutes_done: number }[] }) {
  const max = Math.max(...tags.map((t) => t.minutes_done), 1);
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {tags.map((t) => (
        <li key={t.tag_id} className="grid grid-cols-[6rem_1fr_4rem] items-center gap-3">
          <span className="truncate">#{t.name}</span>
          <span className="h-2.5 rounded-full bg-surface-2">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${(t.minutes_done / max) * 100}%`,
                background: AREA_COLORS[0],
              }}
            />
          </span>
          <span className="text-right text-xs tabular-nums">{formatMinutes(t.minutes_done)}</span>
        </li>
      ))}
    </ul>
  );
}

function ChartTip({
  active,
  payload,
  label,
  format,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number }[];
  label?: string;
  format(v: number): string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <TipBox title={label ? formatDayMonth(String(label)) : ''}>
      {payload.map((p) => (
        <p key={p.name}>
          {p.name}: {format(Number(p.value ?? 0))}
        </p>
      ))}
    </TipBox>
  );
}

function TipBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-inner)] bg-surface-2 px-3 py-2 text-xs shadow-lg">
      {title && <p className="mb-1 font-medium">{title}</p>}
      {children}
    </div>
  );
}

function Panel({
  title,
  note,
  legend,
  children,
}: {
  title: string;
  note?: string;
  legend?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-[var(--radius-card)] bg-surface p-4">
      <h2 className="text-sm">{title}</h2>
      {note && <p className="text-xs text-muted">{note}</p>}
      {legend && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">{legend}</div>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function LegendKey({ color, label, line }: { color: string; label: string; line?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      <span
        className={line ? 'h-0.5 w-3 rounded' : 'size-2.5 rounded-sm'}
        style={{ background: color }}
        aria-hidden
      />
      {label}
    </span>
  );
}

function StatTile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-[var(--radius-card)] bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 font-display text-[28px] tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-muted">{note}</p>
    </div>
  );
}

function Empty({ text = 'Not enough closed days yet.' }: { text?: string }) {
  return <p className="py-8 text-center text-sm text-muted">{text}</p>;
}
