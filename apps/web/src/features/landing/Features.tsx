import type { ReactNode } from 'react';
import { HammerMark } from '../../components/Mark.tsx';
import { COLOR_HEX } from './sample.ts';

/** Small proofs beside text: each claim with the exact piece of the product that shows it. */
export function Features() {
  return (
    <section aria-labelledby="features-title" className="mx-auto max-w-[1200px] px-5 md:px-8">
      <div className="lg:ml-[14%]">
        <h2 id="features-title" data-reveal className="text-[length:var(--step-head)]">
          Around the score
        </h2>
        <div className="mt-16 flex flex-col gap-24">
          <Module
            title="A check mark in your Calendar"
            body={[
              'Tick a block and Mjolnir puts a check mark in front of its title in Google Calendar, about ten seconds later.',
              'So the score shows in phone widgets and Apple Calendar too, without opening the app.',
            ]}
          >
            <div className="flex flex-col gap-1.5 p-4">
              {(
                [
                  ['Gym', '07:00', '5', true],
                  ['DSA practice', '09:30', '5', true],
                  ['LFX PR review', '11:30', '11', false],
                ] as const
              ).map(([t, at, c, ticked]) => (
                <div
                  key={t}
                  className="flex items-center justify-between rounded-[6px] px-2.5 py-1.5 text-[15px]"
                  style={{ background: COLOR_HEX[c], color: c === '5' ? '#1d1a12' : '#fff' }}
                >
                  <span className="flex items-center gap-1">
                    {ticked && (
                      <svg viewBox="0 0 16 16" className="size-3.5" aria-label="Ticked">
                        <path
                          d="M3 8.5l3.2 3L13 4.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                    {t}
                  </span>
                  <span className="text-[12px] opacity-80">{at}</span>
                </div>
              ))}
            </div>
          </Module>

          <Module
            title="Phone to laptop in under two seconds"
            body={[
              'Ticks go straight to the database, so the laptop on your desk updates while you are still holding the phone.',
              'Nothing waits on a server to wake up.',
            ]}
          >
            <div className="flex h-full items-center gap-3 p-5 text-[15px]">
              <div className="flex-1 rounded-[12px] bg-surface-2 p-3">
                <p className="text-[13px] text-faint">Phone, 18:02:11</p>
                <p className="mt-1">Ticked Gym</p>
              </div>
              <svg viewBox="0 0 24 12" className="w-6 shrink-0 text-faint" aria-hidden>
                <path
                  d="M1 6h20M16 1l5 5-5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div className="flex-1 rounded-[12px] bg-surface-2 p-3">
                <p className="text-[13px] text-faint">Laptop, 18:02:12</p>
                <p className="mt-1">72% · Fair</p>
              </div>
            </div>
          </Module>

          <Module
            title="Ticks wait out a dead signal"
            body={[
              'On the metro with no network, tick anyway. The tick is kept on the phone and sent when you are back online.',
              'Ticks from another account are never sent as yours.',
            ]}
          >
            <p className="m-4 rounded-[10px] bg-[#2a2213] px-4 py-3 text-[15px] text-[#f0c987]">
              Offline: 2 ticks saved on this device, sent when you are back online.
            </p>
          </Module>

          <Module
            title="Deadlines fed by tags"
            body={[
              'Make a deadline with a tag, such as “5 PRs raised” with #lfx, and every #lfx block counts toward it: sessions, hours, and what is still upcoming.',
              'It warns when a deadline is close and nothing is scheduled.',
            ]}
          >
            <div className="p-4">
              <div className="flex items-baseline justify-between">
                <p className="font-display text-[18px]">GSoC proposal</p>
                <span className="text-[13px] text-band-not-good">Urgent</span>
              </div>
              <p className="text-[13px] text-faint">Due Wed 28 Oct · 3 days left · #gsoc</p>
              <p className="mt-3 inline-block rounded-full bg-[#2a2213] px-3 py-1 text-[13px] text-[#f0c987]">
                No sessions scheduled
              </p>
            </div>
          </Module>

          <Module
            title="Suggestions you can dismiss"
            body={[
              'An untagged block that names a tag, like “read lfx notes”, lands in the Unassigned tray with Link and Dismiss.',
              'Link adds the tag without touching the Google title. A dismissal is remembered.',
            ]}
          >
            <div className="flex items-center gap-3 p-4 text-[15px]">
              <div className="min-w-0 flex-1">
                <p className="truncate">read lfx notes</p>
                <p className="text-[13px] text-faint">Mon 26 Oct</p>
              </div>
              <span className="text-[13px] text-muted">#lfx</span>
              <span className="rounded-full bg-text px-3 py-1 text-[13px] font-medium text-bg">
                Link
              </span>
              <span className="text-[13px] text-faint">Dismiss</span>
            </div>
          </Module>

          <Module
            title="Notifications only when there is news"
            body={[
              'A morning note when yesterday left misses, a deadline warning, an evening reminder while points are still open. Silence otherwise.',
              'Each one can be turned off, and the times are yours.',
            ]}
          >
            <div className="m-4 flex gap-3 rounded-[14px] bg-surface-2 p-3.5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-bg text-bone">
                <HammerMark className="size-5" />
              </span>
              <div className="min-w-0 text-[14px]">
                <p className="font-medium">You missed 2 tasks</p>
                <p className="text-faint">5 points. Reschedule, mark done or dismiss.</p>
              </div>
              <span className="ml-auto shrink-0 text-[12px] text-faint">08:00</span>
            </div>
          </Module>
        </div>
      </div>
    </section>
  );
}

function Module({ title, body, children }: { title: string; body: string[]; children: ReactNode }) {
  return (
    <article className="flex max-w-[900px] flex-col gap-5 sm:flex-row sm:items-start sm:gap-8">
      <div
        data-reveal
        data-ui
        className="w-full shrink-0 overflow-hidden rounded-[16px] bg-surface sm:w-[420px]"
      >
        {children}
      </div>
      <div data-reveal style={{ ['--d' as string]: 1 }} className="sm:max-w-[400px] sm:flex-1">
        <h3 className="font-sans text-[length:var(--step-body)] font-semibold leading-snug">
          {title}
        </h3>
        {body.map((p) => (
          <p key={p} className="mt-2 text-[length:var(--step-body)] leading-relaxed text-muted">
            {p}
          </p>
        ))}
      </div>
    </article>
  );
}
