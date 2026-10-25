import { useState } from 'react';
import { BAND_COLOR, BAND_LABEL } from '../../lib/bands.ts';
import { PointDots } from '../today/ItemRow.tsx';
import { ScoreRing } from '../today/ScoreRing.tsx';
import { COLOR_HEX, COLOR_MAP, SAMPLE_DAY, type SampleBlock, scoreSample } from './sample.ts';

const STAGES = [
  { name: 'Plan', clause: 'Plan the day in your colours' },
  { name: 'Tick', clause: 'Tick each block as you go' },
  { name: 'Close', clause: 'At four, the day closes' },
  { name: 'Keep', clause: 'The streak keeps one slip' },
] as const;

/**
 * How it works (the live thing): one slider drives a sample day through planning, ticking, the
 * 04:00 close and the streak. On "Tick", the blocks can be ticked and the forge ring fills; past
 * 85% the hammer strikes, at 100% lightning lands.
 */
export function Stages() {
  const [stage, setStage] = useState(1);
  const [blocks, setBlocks] = useState<SampleBlock[]>(SAMPLE_DAY);
  const score = scoreSample(blocks);
  const fill = `${(stage / (STAGES.length - 1)) * 100}%`;

  return (
    <section
      id="how"
      aria-labelledby="how-title"
      className="relative grid grid-cols-1 gap-3 px-3 lg:grid-cols-2"
    >
      <div className="order-2 flex flex-col rounded-[20px] bg-surface-2 p-7 md:p-10 lg:order-1 lg:min-h-[74svh]">
        <h2 id="how-title" className="sr-only">
          How it works
        </h2>
        <p
          key={stage}
          className="mj-rise max-w-[13ch] font-display text-[length:var(--step-display)] leading-[0.98] tracking-[-0.02em]"
          aria-live="polite"
        >
          {STAGES[stage]!.clause}
        </p>
        <p className="mt-8 max-w-[44ch] text-[length:var(--step-body)] leading-relaxed text-muted">
          {stage === 0 &&
            'Give each Google Calendar colour a worth from 0 to 3. Tomato is 3, Banana 2, Peacock 1, Graphite nothing: dinner and buffers never count.'}
          {stage === 1 &&
            'Tick the blocks you finish, here or on your phone. The ring fills band by band, and a check mark appears in Google Calendar. Try it: tick the rest of this sample day.'}
          {stage === 2 &&
            'Sessions run past midnight, so the day ends at 04:00. Anything unticked becomes a miss and waits in the inbox, the way the hammer always comes back.'}
          {stage === 3 &&
            'A day at 50% or more counts. One bad day a week is forgiven, like Brokkr’s pause at the bellows; a second breaks the streak.'}
        </p>
      </div>

      <div className="order-1 flex min-h-[46svh] min-w-0 items-center justify-center overflow-hidden rounded-[20px] bg-surface p-4 md:p-8 lg:order-2">
        <div data-ui className="w-full max-w-[460px]">
          {stage === 0 && <PlanFragment blocks={blocks} />}
          {stage === 1 && (
            <TickFragment
              blocks={blocks}
              score={score}
              onToggle={(id) =>
                setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, done: !b.done } : b)))
              }
            />
          )}
          {stage === 2 && <CloseFragment blocks={blocks} score={score} />}
          {stage === 3 && <KeepFragment todayRate={score.rate} todayBand={score.band} />}
        </div>
      </div>

      <div className="order-3 rounded-[20px] bg-surface px-6 pt-3 pb-5 lg:col-span-2 lg:px-10">
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-active">
            <div
              className="h-full rounded-full bg-text transition-[width] duration-300"
              style={{ width: fill }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={STAGES.length - 1}
            step={1}
            value={stage}
            onChange={(e) => setStage(Number(e.target.value))}
            aria-label="Stage of the day"
            aria-valuetext={STAGES[stage]!.name}
            className="stage-range relative w-full"
          />
        </div>
        <div className="grid grid-cols-4 text-[15px]">
          {STAGES.map((s, i) => (
            <button
              key={s.name}
              onClick={() => setStage(i)}
              className={`py-1 transition ${i === stage ? 'text-text' : 'text-faint hover:text-muted'} ${i === 0 ? 'text-left' : i === STAGES.length - 1 ? 'text-right' : 'text-center'}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function BlockRow({
  b,
  state,
  onToggle,
}: {
  b: SampleBlock;
  state: 'open' | 'done' | 'missed' | 'ignored';
  onToggle?(): void;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className="w-11 shrink-0 text-right text-[14px] text-faint tabular-nums">
        {b.start}
      </span>
      <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: COLOR_HEX[b.color] }} />
      {b.points > 0 ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={state === 'done'}
          aria-label={`${state === 'done' ? 'Untick' : 'Tick'} ${b.title}`}
          disabled={!onToggle}
          onClick={onToggle}
          className={`flex size-[24px] shrink-0 items-center justify-center rounded-[7px] border-2 transition active:scale-90 disabled:cursor-default ${state === 'done' ? 'border-text text-text' : state === 'missed' ? 'border-band-not-good/70' : 'border-border hover:border-muted'}`}
        >
          {state === 'done' && (
            <svg viewBox="0 0 16 16" className="mj-rise size-3.5" aria-hidden>
              <path
                d="M3 8.5l3.2 3L13 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </button>
      ) : (
        <span className="size-[24px] shrink-0" aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[16px] ${state === 'done' ? 'text-faint line-through' : state === 'ignored' ? 'text-faint' : ''}`}
        >
          {b.title}
        </span>
        <span className="block text-[13px] text-faint">
          {state === 'missed' ? (
            <span className="text-band-not-good">Missed</span>
          ) : state === 'ignored' ? (
            '0 points: not a task'
          ) : (
            [b.colorName, b.tag && `#${b.tag}`].filter(Boolean).join(' · ')
          )}
        </span>
      </span>
      <PointDots points={b.points} />
    </li>
  );
}

function PlanFragment({ blocks }: { blocks: SampleBlock[] }) {
  return (
    <div className="rounded-[18px] bg-bg p-5">
      <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 pb-4 text-[15px]">
        {COLOR_MAP.map((c) => (
          <li key={c.key} className="flex items-center gap-2.5">
            <span className="size-3.5 rounded-full" style={{ background: COLOR_HEX[c.key] }} />
            <span className="flex-1">{c.name}</span>
            <PointDots points={c.points} />
          </li>
        ))}
      </ul>
      <ul className="divide-y divide-rule border-t border-rule">
        {blocks.slice(2, 6).map((b) => (
          <BlockRow key={b.id} b={b} state={b.points ? 'open' : 'ignored'} />
        ))}
      </ul>
    </div>
  );
}

function TickFragment({
  blocks,
  score,
  onToggle,
}: {
  blocks: SampleBlock[];
  score: ReturnType<typeof scoreSample>;
  onToggle(id: string): void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-start">
      <ul className="order-2 divide-y divide-rule rounded-[18px] bg-bg px-4 py-1 sm:order-1">
        {blocks.map((b) => (
          <BlockRow
            key={b.id}
            b={b}
            state={b.points === 0 ? 'ignored' : b.done ? 'done' : 'open'}
            onToggle={b.points ? () => onToggle(b.id) : undefined}
          />
        ))}
      </ul>
      <div className="order-1 flex items-center gap-4 rounded-[18px] bg-bg p-4 sm:order-2 sm:flex-col sm:gap-2">
        <ScoreRing rate={score.rate} band={score.band} size={132} live />
        <p className="text-center text-[15px] text-muted">
          <span className="font-display text-[20px] text-text tabular-nums">{score.done}</span> of{' '}
          {score.planned}
        </p>
      </div>
    </div>
  );
}

function CloseFragment({
  blocks,
  score,
}: {
  blocks: SampleBlock[];
  score: ReturnType<typeof scoreSample>;
}) {
  const missed = blocks.filter((b) => b.points > 0 && !b.done);
  return (
    <div className="rounded-[18px] bg-bg p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[15px] text-faint">Sunday 25 October · closed 04:00</p>
          <p className="mt-1 font-display text-[28px] leading-none tabular-nums">
            {score.rate}%{' '}
            <span className="font-sans text-[16px]" style={{ color: BAND_COLOR[score.band] }}>
              {BAND_LABEL[score.band]}
            </span>
          </p>
        </div>
        <p className="text-right text-[14px] text-faint">Score frozen</p>
      </div>
      {missed.length > 0 ? (
        <>
          <p className="mt-5 rounded-[12px] bg-[#2a2213] px-4 py-3 text-[15px] text-[#f0c987]">
            You missed {missed.length} task{missed.length === 1 ? '' : 's'}. Reschedule?
          </p>
          <ul className="mt-2 divide-y divide-rule">
            {missed.slice(0, 3).map((b) => (
              <BlockRow key={b.id} b={b} state="missed" />
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-5 text-[16px] text-muted">
          Every block struck. Nothing waits in the inbox.
        </p>
      )}
    </div>
  );
}

function KeepFragment({
  todayRate,
  todayBand,
}: {
  todayRate: number;
  todayBand: keyof typeof BAND_COLOR;
}) {
  // A sample week: Saturday under 50% uses the rest pass; today is the sample day.
  const week = [
    { d: 'Mon', rate: 92.9, band: 'excellent' },
    { d: 'Tue', rate: 58.3, band: 'fair' },
    { d: 'Wed', rate: 84.6, band: 'fair' },
    { d: 'Thu', rate: 100, band: 'excellent' },
    { d: 'Fri', rate: 81.8, band: 'good' },
    { d: 'Sat', rate: 37.5, band: 'not_good', pass: true },
    { d: 'Sun', rate: todayRate, band: todayBand, today: true },
  ] as const;
  const broke = todayRate < 50;
  return (
    <div className="rounded-[18px] bg-bg p-5">
      <p className="text-[15px] text-muted">
        Streak{' '}
        <span className="font-display text-[30px] text-text tabular-nums">{broke ? 0 : 12}</span>
        {!broke && (
          <span
            className="ml-2 font-display text-[22px] text-bone"
            title="Thurisaz, Thor’s rune: a week unbroken"
          >
            ᚦ
          </span>
        )}
      </p>
      <ol className="mt-5 grid grid-cols-7 gap-2">
        {week.map((w) => (
          <li key={w.d} className="flex flex-col items-center gap-2" title={`${w.d}: ${w.rate}%`}>
            <span
              className={`w-full rounded-full ${'today' in w ? 'outline-2 outline-offset-2 outline-text' : ''}`}
              style={{ height: 'pass' in w ? 12 : 22, background: BAND_COLOR[w.band] }}
            />
            <span className="text-[13px] text-faint">{w.d.slice(0, 1)}</span>
          </li>
        ))}
      </ol>
      <p className="mt-5 text-[15px] text-faint">
        {broke
          ? 'Sunday under 50% after Saturday’s slip: a second bad day breaks the streak. Tick a block on “Tick” and look again.'
          : 'Saturday fell under 50% and used the week’s rest pass, cut short like the hammer’s handle.'}
      </p>
    </div>
  );
}
