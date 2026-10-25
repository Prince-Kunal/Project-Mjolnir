import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Effects } from '../../components/Effects.tsx';
import { HammerMark, RUNES } from '../../components/Mark.tsx';
import { useAuth } from '../../lib/auth.ts';
import { BAND_COLOR } from '../../lib/bands.ts';
import { useSmoothScroll } from '../../lib/smoothScroll.ts';
import { PointDots } from '../today/ItemRow.tsx';
import { Features } from './Features.tsx';
import './landing.css';
import { COLOR_HEX, COLOR_MAP } from './sample.ts';
import { Showcase } from './Showcase.tsx';
import { Stages } from './Stages.tsx';
import { useChapter, useReveal } from './useLandingMotion.ts';

/** The sticky stage's pictures, one per chapter, with what each one shows. */
const STAGE = [
  {
    src: '/landing/thor-s-hammer-erikstorp-east-gotland.jpg',
    w: 1357,
    h: 1400,
    alt: 'Engraving of a Viking-age silver hammer amulet on its chain, with knotwork on the head',
    caption: 'Thor’s hammer amulet, silver, Erikstorp, Östergötland. Engraving, 1878.',
    print: true,
  },
  {
    src: '/landing/torshammare-hange-historiska-museet-dig-55081.jpg',
    w: 1400,
    h: 1120,
    alt: 'A small silver Thor’s hammer pendant photographed against white',
    caption: 'Hammer pendant, silver. Swedish History Museum, Stockholm.',
    print: true,
  },
  {
    src: '/landing/thor-destroys-the-giant-thrym.jpg',
    w: 1400,
    h: 959,
    alt: 'Line drawing of Thor raising his hammer against the giant Thrym in his hall',
    caption: 'Thor takes his hammer back from the giant Thrym. Lorenz Frølich, 1906.',
    print: true,
  },
  {
    src: '/landing/once-again-the-buzzing-fly-came-in.jpg',
    w: 1017,
    h: 1400,
    alt: 'Ink drawing of a dwarf working the bellows of a forge while a fly circles in the smoke',
    caption: 'Loki, as a fly, stings Brokkr at the bellows. Arthur Rackham, 1901.',
    print: true,
  },
  {
    video: '/landing/lightning-trumbull-county-ohio.webm',
    src: '/landing/lightning-trumbull-county-ohio-poster.jpg',
    w: 1280,
    h: 800,
    alt: 'Lightning forking out of a night cloud behind bare branches',
    caption: 'Lightning over Trumbull County, Ohio, filmed at high speed in 2012.',
    print: false,
  },
] as const;

export function LandingPage() {
  const root = useRef<HTMLDivElement>(null);
  const split = useRef<HTMLDivElement>(null);
  useSmoothScroll();
  useReveal(root);
  const chapter = useChapter(split);
  const signedIn = useAuth((s) => Boolean(s.session));

  return (
    <div ref={root} className="min-h-svh bg-bg text-text">
      <div ref={split} className="grid grid-cols-1 gap-3 p-3 lg:grid-cols-2">
        {/* The sticky stage: the hammer's world, changing as the chapters pass. */}
        <div className="sticky top-3 z-0 h-[44svh] overflow-hidden rounded-[20px] bg-bone md:h-[56svh] lg:order-2 lg:h-[calc(100svh-24px)]">
          {STAGE.map((s, i) => (
            <figure
              key={s.src}
              className="stage-layer absolute inset-0 bg-bone"
              data-on={i === chapter ? '' : undefined}
            >
              {'video' in s ? (
                <video
                  className="drift size-full object-cover"
                  src={s.video}
                  poster={s.src}
                  muted
                  loop
                  playsInline
                  autoPlay
                  aria-label={s.alt}
                />
              ) : (
                <img
                  className={`drift size-full ${s.print ? 'on-bone object-contain p-[9%] pb-[calc(9%+56px)]' : 'object-cover'}`}
                  src={s.src}
                  width={s.w}
                  height={s.h}
                  alt={s.alt}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                />
              )}
            </figure>
          ))}
          <p
            key={chapter}
            aria-live="polite"
            className={`mj-rise absolute top-5 left-6 max-w-[34ch] text-[15px] leading-snug ${STAGE[chapter]!.print ? 'text-[#4a4640]' : 'text-[#e4e1dc]'}`}
          >
            {STAGE[chapter]!.caption}
          </p>
          <div className="absolute inset-x-0 bottom-0 flex h-14 items-center justify-between gap-4 bg-surface px-6 text-[15px] text-muted">
            <span>The day closes at 04:00</span>
            <span>Excellent from 85%</span>
          </div>
        </div>

        {/* The reading column: one sheet, from the name to the last chapter. */}
        <div className="relative z-10 -mt-[8svh] rounded-[20px] bg-surface lg:order-1 lg:mt-0">
          <header className="flex flex-col px-6 pt-5 pb-14 md:px-12 lg:min-h-[calc(100svh-24px)]">
            <nav
              aria-label="Main"
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-[15px] whitespace-nowrap"
            >
              <a href="#how" className="text-muted transition hover:text-text">
                How it works
              </a>
              <span className="flex items-center gap-2.5 font-display text-[26px] md:text-[34px]">
                <ThrowableHammer />
                Mjölnir
              </span>
              <Link
                to={signedIn ? '/' : '/sign-in'}
                className="justify-self-end text-muted transition hover:text-text"
              >
                {signedIn ? 'Open' : 'Sign in'}
              </Link>
            </nav>
            <div className="mx-auto mt-10 flex w-full max-w-[640px] flex-col items-center text-center md:mt-[16svh] lg:mt-[18svh]">
              <h1
                data-reveal
                className="text-[length:var(--step-display)] leading-[0.98] tracking-[-0.02em]"
              >
                Your day, forged
                <br />
                into a score
              </h1>
              <p
                data-reveal
                style={{ ['--d' as string]: 1 }}
                className="mt-8 max-w-[40ch] text-[length:var(--step-lead)] leading-relaxed text-muted"
              >
                Colour your Google Calendar blocks by worth. Tick them off as you go, and Mjolnir
                scores the day and keeps your streak.
              </p>
              <div data-reveal style={{ ['--d' as string]: 2 }} className="mt-9">
                <Link
                  to={signedIn ? '/' : '/sign-in'}
                  className="inline-flex h-12 items-center rounded-full bg-accent px-7 text-[17px] font-semibold text-bg transition hover:bg-[#b7d9ff] active:scale-[0.97]"
                >
                  {signedIn ? 'Open today' : 'Sign in with Google'}
                </Link>
              </div>
            </div>
            {/* The card's foot, like a menu's prices: what each colour is worth. */}
            <ul
              data-reveal
              style={{ ['--d' as string]: 3 }}
              aria-label="Sample colour map"
              className="mx-auto mt-16 flex flex-wrap justify-center gap-x-7 gap-y-3 text-[15px] text-muted lg:mt-auto"
            >
              {COLOR_MAP.map((c) => (
                <li key={c.key} className="flex items-center gap-2.5">
                  <span className="size-3 rounded-full" style={{ background: COLOR_HEX[c.key] }} />
                  {c.name}
                  <PointDots points={c.points} />
                </li>
              ))}
            </ul>
          </header>

          <Chapter
            index={1}
            title="Colour is the score"
            text="You already colour your blocks. Mjolnir reads Tomato as 3 points, Banana as 2, Peacock as 1 and Graphite as nothing, or whatever map you choose. Dinner and buffers never count against you."
          >
            <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {COLOR_MAP.map((c) => (
                <li key={c.key} className="flex items-center gap-3 text-[16px]">
                  <span className="size-4 rounded-full" style={{ background: COLOR_HEX[c.key] }} />
                  <span className="flex-1">{c.name}</span>
                  <PointDots points={c.points} />
                </li>
              ))}
            </ul>
          </Chapter>

          <Chapter
            index={2}
            title="A moved block is a missed one"
            text="Drag a block to tomorrow before it starts and it simply moves. Drag it after it started and today records a miss, because it was one. Misses wait in the inbox, the way the hammer always returns to Thor’s hand."
          >
            <div className="flex items-center gap-3 text-[16px]">
              <span className="h-9 w-1 rounded-full" style={{ background: COLOR_HEX['11'] }} />
              <div className="min-w-0 flex-1">
                <p>GSoC proposal draft</p>
                <p className="text-[14px] text-band-not-good">Missed · moved after it started</p>
              </div>
              <span className="rounded-full bg-text px-3.5 py-1.5 text-[14px] font-medium text-bg">
                Tomorrow 16:00
              </span>
            </div>
          </Chapter>

          <Chapter
            index={3}
            title="One slip a week, like Brokkr"
            text="While the dwarves forged Mjölnir, Loki as a fly stung Brokkr until he let go of the bellows once. The handle came out short, and it was still the best of their treasures. Your streak forgives one bad day a week. A second one breaks it."
          >
            <ol className="grid grid-cols-7 gap-2" aria-label="A week with one rest pass">
              {(
                [
                  'excellent',
                  'good',
                  'excellent',
                  'excellent',
                  'fair',
                  'not_good',
                  'excellent',
                ] as const
              ).map((b, i) => (
                <li key={i} className="flex flex-col items-center gap-2">
                  <span
                    className="w-full rounded-full"
                    style={{ height: b === 'not_good' ? 12 : 24, background: BAND_COLOR[b] }}
                  />
                  <span className="text-[13px] text-faint">{'MTWTFSS'[i]}</span>
                </li>
              ))}
            </ol>
          </Chapter>

          <Chapter
            index={4}
            title="Excellent strikes at 85%"
            text="A day is points done over points planned. 85% is Excellent, 75% Good, 50% Fair, and 50% keeps the streak alive. The day closes at four in the morning, so a late session counts for the day you planned it."
          >
            <div aria-label="Bands: Not good under 50%, Fair from 50%, Good from 75%, Excellent from 85%">
              <div className="flex h-3 gap-[3px]">
                <span
                  className="rounded-l-full"
                  style={{ width: '50%', background: BAND_COLOR.not_good }}
                />
                <span style={{ width: '25%', background: BAND_COLOR.fair }} />
                <span style={{ width: '10%', background: BAND_COLOR.good }} />
                <span
                  className="rounded-r-full"
                  style={{ width: '15%', background: BAND_COLOR.excellent }}
                />
              </div>
              <div className="relative mt-2 h-5 text-[13px] text-faint tabular-nums">
                {[0, 50, 75, 85, 100].map((n) => (
                  <span
                    key={n}
                    className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
                    style={{ left: `${n}%` }}
                  >
                    {n}%
                  </span>
                ))}
              </div>
            </div>
          </Chapter>
          <div className="h-[8svh]" />
        </div>
      </div>

      <div className="mt-20 md:mt-32">
        <Stages />
      </div>

      <div className="mt-24 md:mt-40">
        <Showcase />
      </div>

      <div className="mt-24 md:mt-32">
        <Features />
      </div>

      <Letter />

      <Closing signedIn={signedIn} />

      <Footer />
      <Effects />
    </div>
  );
}

function Chapter({
  index,
  title,
  text,
  children,
}: {
  index: number;
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-chapter={index}
      className="flex min-h-[78svh] flex-col justify-center px-6 py-16 md:px-12 lg:min-h-[92svh]"
    >
      <div className="mx-auto w-full max-w-[46ch]">
        <h2 data-reveal className="text-[length:var(--step-head)] leading-[1.05]">
          {title}
        </h2>
        <p
          data-reveal
          style={{ ['--d' as string]: 1 }}
          className="mt-5 text-[length:var(--step-body)] leading-relaxed"
        >
          {text}
        </p>
        <div
          data-reveal
          data-ui
          style={{ ['--d' as string]: 2 }}
          className="mt-9 rounded-[16px] bg-bg p-5"
        >
          {children}
        </div>
      </div>
    </section>
  );
}

function Letter() {
  return (
    <section
      aria-labelledby="letter-title"
      className="mx-auto max-w-[560px] px-6 pt-24 pb-20 md:pt-40 md:pb-32"
    >
      <img
        src="/landing/torshammare-historiska-museet-dig-56038.jpg"
        alt="An iron hammer pendant from the Swedish History Museum"
        width={44}
        height={44}
        loading="lazy"
        className="size-11 rounded-full object-cover object-[52%_60%]"
      />
      <h2
        id="letter-title"
        data-reveal
        className="mt-7 text-[length:var(--step-head)] leading-tight"
      >
        Why it is called Mjölnir
      </h2>
      <div className="mt-6 flex flex-col gap-5 text-[length:var(--step-body)] leading-[1.6]">
        <p data-reveal>
          I plan my days in Google Calendar, one coloured block at a time. For a long while I kept
          the score by hand: a Notion table, a row for each day, a percentage and a coloured dot. It
          worked until the week got busy, which is when it mattered.
        </p>
        <p data-reveal>
          Mjolnir does the counting. The colour I already give a block is its worth, the day closes
          at four in the morning, and a block dragged to tomorrow after it started counts as missed,{' '}
          <span className="bg-[#3a3014] px-1 text-[#f0d79b]">because it was</span>.
        </p>
        <p data-reveal>
          The name comes from the forge. When the dwarves made Thor’s hammer, Loki, as a fly, stung
          Brokkr until he let go of the bellows once. The handle came out short, and it was still
          the best thing they made. So the streak forgives one slip a week, and no more.
        </p>
        <p data-reveal>
          I built it for my own semester. If you plan the same way, it may fit you too.
        </p>
      </div>
      <p className="mt-8 text-[length:var(--step-lead)] italic">Prince Kunal</p>
      <p className="text-[15px] text-faint">Maker of Mjolnir</p>
    </section>
  );
}

/** The product's first step, already open: where the day lives, and when it closes. */
function Closing({ signedIn }: { signedIn: boolean }) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'events' | 'tasks'>('events');
  const [close, setClose] = useState('04:00');
  return (
    <section
      aria-labelledby="closing-title"
      className="mx-3 grid min-h-[84svh] grid-cols-1 gap-10 rounded-[20px] bg-accent p-6 text-bg md:p-10 lg:min-h-[76svh] lg:grid-cols-12 lg:grid-rows-[1fr]"
    >
      <div className="flex flex-col justify-start lg:col-span-5 lg:justify-end">
        <h2
          id="closing-title"
          data-reveal
          className="max-w-[9ch] text-[length:var(--step-display)] leading-[0.92] tracking-[-0.03em]"
        >
          Start with today
        </h2>
        <p
          data-reveal
          style={{ ['--d' as string]: 1 }}
          className="mt-6 max-w-[38ch] text-[length:var(--step-body)] leading-relaxed text-bg/80"
        >
          Sign in with Google, connect your calendar, then give each colour its points. Your history
          starts the day you finish.
        </p>
      </div>
      <div className="flex items-end lg:col-span-6 lg:col-start-7 lg:items-center">
        <form
          data-ui
          data-reveal
          onSubmit={(e) => {
            e.preventDefault();
            try {
              sessionStorage.setItem('mjolnir.signup', JSON.stringify({ mode, close }));
            } catch {
              // The choice is offered again during setup.
            }
            navigate(signedIn ? '/' : '/sign-in');
          }}
          className="w-full max-w-[440px] rounded-[22px] bg-surface p-7 text-text shadow-[0_30px_80px_rgba(14,13,12,.45)]"
        >
          <p className="font-display text-[length:var(--step-lead)]">Where does your day live?</p>
          <p className="mt-1 text-[15px] text-muted">You can change both later in Settings.</p>
          <div
            role="radiogroup"
            aria-label="Where your day lives"
            className="mt-6 grid grid-cols-2 rounded-full bg-surface-2 p-1"
          >
            {(
              [
                ['events', 'Calendar events'],
                ['tasks', 'Google Tasks'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={mode === v}
                onClick={() => setMode(v)}
                className={`h-10 rounded-full text-[15px] transition ${mode === v ? 'bg-text font-medium text-bg' : 'text-muted hover:text-text'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="mt-5 block">
            <span className="mb-2 block text-[14px] font-medium">The day closes at</span>
            <input
              type="time"
              value={close}
              onChange={(e) => setClose(e.target.value)}
              className="h-11 w-full rounded-[12px] bg-surface-2 px-4 text-[16px] tabular-nums"
            />
          </label>
          <button
            type="submit"
            className="mt-6 h-[52px] w-full rounded-full bg-primary text-[16px] font-semibold text-on-primary transition hover:bg-bone active:scale-[0.98]"
          >
            {signedIn ? 'Open today' : 'Sign in with Google'}
          </button>
        </form>
      </div>
    </section>
  );
}

function Footer() {
  const [runes, setRunes] = useState(false);
  return (
    <footer className="mt-24 px-6 pb-8 md:mt-40 md:px-10">
      <div className="grid gap-2 text-[15px] md:grid-cols-[1fr_auto_1fr] md:items-baseline">
        <p className="text-faint">A daily planner on Google Calendar</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-6">
          <a href="#how" className="text-text hover:text-bone">
            How it works
          </a>
          <Link to="/sign-in" className="text-text hover:text-bone">
            Sign in
          </Link>
          <a href="#credits" className="text-text hover:text-bone">
            Picture credits
          </a>
        </nav>
        <p className="text-faint md:text-right">
          2026 ·{' '}
          <button
            type="button"
            onMouseEnter={() => setRunes(true)}
            onMouseLeave={() => setRunes(false)}
            onFocus={() => setRunes(true)}
            onBlur={() => setRunes(false)}
            onClick={() => setRunes((r) => !r)}
            aria-label="Mjolnir in Elder Futhark runes"
            className="inline-block min-w-[7ch] text-left text-muted"
          >
            {runes ? 'Mjolnir' : RUNES}
          </button>
        </p>
      </div>
      <Credits />
    </footer>
  );
}

const CREDITS = [
  [
    'Torshammare hänge, Historiska museet, DIG 55081',
    'Ola Myrin',
    'CC BY 4.0',
    'https://commons.wikimedia.org/wiki/File:Torshammare_h%C3%A4nge_-_Historiska_museet_-_DIG_55081.jpg',
  ],
  [
    'Torshammare, Historiska museet, DIG 56038',
    'Ola Myrin',
    'CC BY 4.0',
    'https://commons.wikimedia.org/wiki/File:Torshammare_-_Historiska_museet_-_DIG_56038.jpg',
  ],
  [
    'Thor’s hammer, Erikstorp, East Gotland',
    'Heliotype by Pacht',
    'public domain',
    'https://commons.wikimedia.org/wiki/File:Thor%27s_hammer,_Erikstorp,_East_Gotland.jpg',
  ],
  [
    'Thor Destroys the Giant Thrym',
    'Lorenz Frølich',
    'public domain',
    'https://commons.wikimedia.org/wiki/File:Thor_Destroys_the_Giant_Thrym.jpg',
  ],
  [
    'Once again the buzzing fly came in at the window',
    'Arthur Rackham',
    'public domain',
    'https://commons.wikimedia.org/wiki/File:Once_again_the_buzzing_fly_came_in_at_the_window_(1901)_by_Arthur_Rackham.jpg',
  ],
  [
    'Lightning Trumbull County Ohio',
    'Nathan Boor of Aimed Research',
    'CC BY-SA 3.0',
    'https://commons.wikimedia.org/wiki/File:Lightning_Trumbull_County_Ohio.ogv',
  ],
] as const;

function Credits() {
  return (
    <p id="credits" className="mt-8 max-w-[110ch] text-[15px] leading-relaxed text-muted">
      Pictures and footage, via Wikimedia Commons:{' '}
      {CREDITS.map(([title, by, licence, href], i) => (
        <span key={href}>
          <a
            href={href}
            className="text-text underline decoration-active underline-offset-2 hover:text-bone"
          >
            “{title}”
          </a>{' '}
          by {by}, {licence}
          {i < CREDITS.length - 1 ? '; ' : '.'}
        </span>
      ))}
    </p>
  );
}

/** Three quick taps on the hammer throw it; it comes back. */
function ThrowableHammer() {
  const [throwing, setThrowing] = useState(false);
  const taps = useRef<number[]>([]);
  return (
    <button
      type="button"
      aria-label="The hammer"
      className="text-bone"
      onClick={() => {
        const now = Date.now();
        taps.current = [...taps.current.filter((t) => now - t < 700), now];
        if (taps.current.length >= 3) {
          taps.current = [];
          setThrowing(true);
        }
      }}
    >
      <HammerMark
        className={`size-[0.95em] ${throwing ? 'mj-throw' : ''}`}
        onAnimationEnd={() => setThrowing(false)}
      />
    </button>
  );
}
