import { useState } from 'react';
import { BAND_COLOR, BAND_LABEL } from '../../lib/bands.ts';
import { PointDots } from '../today/ItemRow.tsx';
import { COLOR_HEX, SAMPLE_DAY, SAMPLE_WEEK, WEEK_TOTALS } from './sample.ts';

const OUTPUTS = ['Today', 'The week table', 'Sunday review', 'Missed inbox', 'A deadline'] as const;
type Output = (typeof OUTPUTS)[number];

/** What Mjolnir keeps for you: pick a name, and the page it keeps lies on the stage. */
export function Showcase() {
  const [picked, setPicked] = useState<Output>('The week table');
  return (
    <section
      aria-labelledby="showcase-title"
      className="grid grid-cols-1 gap-3 px-3 lg:grid-cols-12"
    >
      <div className="flex min-w-0 flex-col justify-center px-4 py-10 lg:col-span-5 lg:px-10">
        <h2
          id="showcase-title"
          data-reveal
          className="text-[length:var(--step-head)] leading-tight"
        >
          Pages it keeps for you
        </h2>
        <ul
          className="mt-8 flex snap-x gap-5 overflow-x-auto pb-2 lg:flex-col lg:gap-1 lg:overflow-visible"
          data-lenis-prevent-wheel
        >
          {OUTPUTS.map((o, i) => (
            <li
              key={o}
              className="shrink-0 snap-start"
              data-reveal
              style={{ ['--d' as string]: i + 1 }}
            >
              <button
                onClick={() => setPicked(o)}
                aria-pressed={picked === o}
                className={`text-left font-display text-[20px] leading-[1.15] transition lg:text-[length:var(--step-head)] ${picked === o ? 'text-text' : 'text-faint hover:text-muted'}`}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="relative h-[460px] overflow-hidden rounded-[20px] bg-bone lg:col-span-7 lg:h-[560px]">
        <div key={picked} className="mj-rise absolute top-12 left-4 md:top-[104px] md:left-16">
          <div
            data-ui
            className={`rounded-[18px] bg-bg p-6 text-text ${picked === 'Missed inbox' ? 'w-[440px]' : 'w-[560px]'}`}
          >
            {picked === 'Today' && <TodaySheet />}
            {picked === 'The week table' && <WeekSheet />}
            {picked === 'Sunday review' && <ReviewSheet />}
            {picked === 'Missed inbox' && <MissedSheet />}
            {picked === 'A deadline' && <DeadlineSheet />}
          </div>
        </div>
      </div>
    </section>
  );
}

function TodaySheet() {
  const blocks = SAMPLE_DAY.filter((b) => b.points > 0);
  const done = blocks.filter((b) => b.done).reduce((n, b) => n + b.points, 0);
  const planned = blocks.reduce((n, b) => n + b.points, 0);
  return (
    <>
      <p className="font-display text-[26px]">Today</p>
      <p className="text-[15px] text-faint">
        Sunday 25 October · {done} of {planned} points
      </p>
      <ul className="mt-4 divide-y divide-rule">
        {blocks.map((b) => (
          <li key={b.id} className="flex items-center gap-3 py-2.5">
            <span className="w-11 text-right text-[14px] text-faint tabular-nums">{b.start}</span>
            <span className="h-7 w-1 rounded-full" style={{ background: COLOR_HEX[b.color] }} />
            <span className={`flex-1 text-[16px] ${b.done ? 'text-faint line-through' : ''}`}>
              {b.title}
            </span>
            <PointDots points={b.points} />
          </li>
        ))}
      </ul>
    </>
  );
}

function WeekSheet() {
  return (
    <>
      <p className="font-display text-[26px]">Week of 19 October</p>
      <p className="text-[15px] text-faint">
        {WEEK_TOTALS.done} of {WEEK_TOTALS.planned} points · {WEEK_TOTALS.rate}% ·{' '}
        {WEEK_TOTALS.counted} of 7 days counted
      </p>
      <table className="mt-4 w-full text-[15px]">
        <thead>
          <tr className="text-left text-[13px] text-faint">
            <th className="pb-2 font-normal">Day</th>
            <th className="pb-2 text-right font-normal">Points</th>
            <th className="pb-2 text-right font-normal">Success</th>
            <th className="pb-2 pl-5 font-normal">Note</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {SAMPLE_WEEK.map((d) => (
            <tr key={d.day}>
              <td className="py-2">{d.day}</td>
              <td className="py-2 text-right tabular-nums">
                {d.done}
                <span className="text-faint">/{d.planned}</span>
              </td>
              <td className="py-2 text-right tabular-nums">
                <span className="inline-flex items-center gap-2">
                  {d.rate}%
                  <span
                    className="size-2 rounded-full"
                    style={{ background: BAND_COLOR[d.band] }}
                    title={BAND_LABEL[d.band]}
                  />
                </span>
              </td>
              <td className="max-w-0 truncate py-2 pl-5 text-faint">{d.note || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ReviewSheet() {
  const best = [...SAMPLE_WEEK].sort((a, b) => b.rate - a.rate)[0]!;
  return (
    <>
      <p className="font-display text-[26px]">Sunday review</p>
      <p className="text-[15px] text-faint">19 – 25 October</p>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {[
          ['Success', `${WEEK_TOTALS.rate}%`],
          ['Days counted', `${WEEK_TOTALS.counted} / 7`],
          ['Points', `${WEEK_TOTALS.done} / ${WEEK_TOTALS.planned}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[12px] bg-surface p-3">
            <p className="text-[13px] text-faint">{k}</p>
            <p className="mt-1 font-display text-[22px] tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <p className="mt-5 text-[16px]">
        Best day: <span className="text-bone">{best.day}</span>, {best.rate}%. Saturday used the
        rest pass.
      </p>
      <p className="mt-4 text-[14px] text-faint">What will you change next week?</p>
      <p className="mt-1 rounded-[12px] bg-surface px-4 py-3 text-[15px] text-muted">
        Move the proposal block before dinner; evenings keep slipping.
      </p>
    </>
  );
}

function MissedSheet() {
  return (
    <>
      <p className="font-display text-[26px]">Missed</p>
      <p className="text-[15px] text-faint">2 tasks from Saturday · 5 points</p>
      <ul className="mt-4 divide-y divide-rule">
        {[
          ['Revise DBMS notes', 'Banana · 2 points', 'Tomorrow 19:00'],
          ['GSoC proposal draft', 'Tomato · 3 points', 'Mon 16:00'],
        ].map(([t, m, slot]) => (
          <li key={t} className="py-3">
            <p className="text-[16px]">{t}</p>
            <p className="text-[13px] text-faint">{m}</p>
            <div className="mt-2.5 flex gap-2">
              <span className="rounded-full bg-text px-3 py-1 text-[13px] font-medium text-bg">
                {slot}
              </span>
              <span className="rounded-full bg-surface-2 px-3 py-1 text-[13px]">Dismiss</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function DeadlineSheet() {
  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <p className="font-display text-[26px]">5 PRs raised</p>
          <p className="text-[15px] text-faint">Due Thu 5 Nov · 11 days left · #lfx</p>
        </div>
        <span className="flex items-center gap-1.5 text-[14px] text-band-excellent">
          <span className="size-2 rounded-full bg-band-excellent" />
          On track
        </span>
      </div>
      <div className="mt-5 h-2 rounded-full bg-surface-2">
        <div className="h-full w-[40%] rounded-full bg-text" />
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3 text-[15px]">
        {[
          ['Sessions done', '2 / 5'],
          ['Upcoming', '2'],
          ['Hours done', '4h 30m'],
          ['Next session', 'Mon 11:30'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-[12px] bg-surface p-3">
            <dt className="text-[13px] text-faint">{k}</dt>
            <dd className="mt-0.5 tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 inline-block rounded-full bg-[#2a2213] px-3 py-1 text-[13px] text-[#f0c987]">
        Needs more sessions
      </p>
    </>
  );
}
