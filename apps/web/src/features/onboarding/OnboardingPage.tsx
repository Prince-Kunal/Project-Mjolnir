import { type ColorRule, normalizePrimaries } from '@mjolnir/domain';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { HammerMark } from '../../components/Mark.tsx';
import { Button, Card, Loading, Notice } from '../../components/ui.tsx';
import { connectErrorMessage, type ConnectResult } from '../../lib/googleConnect.ts';
import {
  useAreas,
  useCalendars,
  useColorRules,
  useGoogleConnection,
  useProfile,
  useSaveArea,
  useSaveColorRules,
  useUpdateProfile,
} from '../../lib/queries.ts';
import { CalendarPicker } from '../settings/CalendarPicker.tsx';
import { ColorMap } from '../settings/ColorMap.tsx';
import { browserTimezone } from '../../lib/timezone.ts';
import { DaySettings, type DayValues } from '../settings/DaySettings.tsx';
import { GoogleConnectCard } from '../settings/GoogleConnectCard.tsx';
import { AreasEditor } from '../settings/AreasEditor.tsx';
import { HabitsEditor } from '../settings/HabitsEditor.tsx';

// Plan section 11, onboarding. Step 1 (sign in) is done by the time this page shows.
const STEPS = ['connect', 'calendars', 'colours', 'day', 'areas'] as const;
type Step = (typeof STEPS)[number];
const TOTAL = STEPS.length + 1;

export function OnboardingPage() {
  const { step = 'connect' } = useParams();
  const { data: profile } = useProfile();
  if (profile?.onboarded_at) return <Navigate to="/" replace />;
  if (!STEPS.includes(step as Step)) return <Navigate to="/onboarding" replace />;

  const index = STEPS.indexOf(step as Step);
  const plate = PLATES[index]!;
  return (
    <main className="grid min-h-svh gap-3 bg-bg p-3 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <aside className="flex flex-col gap-6 rounded-[20px] bg-surface p-6 lg:sticky lg:top-3 lg:h-[calc(100svh-24px)] lg:p-8">
        <span className="flex items-center gap-2.5 font-display text-[24px]">
          <HammerMark className="size-[0.95em] text-bone" />
          Mjölnir
        </span>
        <div>
          <p className="text-sm text-muted">
            Step {index + 2} of {TOTAL}
          </p>
          <ol className="mt-3 hidden flex-col gap-1.5 text-[16px] lg:flex">
            <li className="flex items-center gap-2.5 text-faint">
              <StepTick /> Sign in
            </li>
            {STEPS.map((s, i) => (
              <li
                key={s}
                aria-current={i === index ? 'step' : undefined}
                className={`flex items-center gap-2.5 ${i === index ? 'text-text' : i < index ? 'text-faint' : 'text-muted'}`}
              >
                {i < index ? (
                  <StepTick />
                ) : (
                  <span
                    className={`size-2 rounded-full ${i === index ? 'bg-text' : 'bg-active'} mx-[3px]`}
                  />
                )}
                {STEP_NAMES[s]}
              </li>
            ))}
          </ol>
          <div className="mt-3 flex gap-1.5 lg:hidden" aria-hidden>
            {Array.from({ length: TOTAL }, (_, i) => (
              <span
                key={i}
                className={`h-1 flex-1 rounded-full ${i <= index + 1 ? 'bg-text' : 'bg-surface-2'}`}
              />
            ))}
          </div>
        </div>
        <figure className="relative mt-auto hidden overflow-hidden rounded-[14px] bg-bone lg:block">
          <img
            key={plate.src}
            src={plate.src}
            alt={plate.alt}
            className="mj-rise aspect-[4/3] w-full object-contain p-5 mix-blend-multiply"
          />
          <figcaption className="px-4 pb-3 text-[13px] text-[#4a4640]">{plate.caption}</figcaption>
        </figure>
      </aside>
      <section className="mx-auto w-full max-w-[680px] px-2 py-6 md:py-12">
        {step === 'connect' && <ConnectStep />}
        {step === 'calendars' && <CalendarsStep />}
        {step === 'colours' && <ColoursStep />}
        {step === 'day' && <DayStep />}
        {step === 'areas' && <AreasStep />}
      </section>
    </main>
  );
}

const STEP_NAMES: Record<Step, string> = {
  connect: 'Connect Google Calendar',
  calendars: 'Pick calendars',
  colours: 'Colours and points',
  day: 'Your day',
  areas: 'Areas and habits',
};

/** One picture of the hammer's world per step (credited on the landing page). */
const PLATES = [
  {
    src: '/landing/thor-s-hammer-erikstorp-east-gotland.jpg',
    alt: 'Engraving of a silver hammer amulet',
    caption: 'Hammer amulet, Erikstorp. Engraving, 1878.',
  },
  {
    src: '/landing/torshammare-hange-historiska-museet-dig-55081.jpg',
    alt: 'A small silver hammer pendant',
    caption: 'Hammer pendant, silver. Swedish History Museum.',
  },
  {
    src: '/landing/torshammare-historiska-museet-dig-56038.jpg',
    alt: 'An iron hammer pendant',
    caption: 'Hammer pendant, iron. Swedish History Museum.',
  },
  {
    src: '/landing/once-again-the-buzzing-fly-came-in.jpg',
    alt: 'Ink drawing of a dwarf at the bellows with a fly circling',
    caption: 'Brokkr at the bellows. Arthur Rackham, 1901.',
  },
  {
    src: '/landing/thor-destroys-the-giant-thrym.jpg',
    alt: 'Line drawing of Thor raising his hammer',
    caption: 'Thor takes his hammer back. Lorenz Frølich, 1906.',
  },
] as const;

function StepTick() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" aria-hidden>
      <path
        d="M3 8.5l3.2 3L13 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StepHeader({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <header className="mb-5">
      <h1 className="text-[28px] leading-tight md:text-[32px]">{title}</h1>
      <p className="mt-3 text-[17px] text-muted">{children}</p>
    </header>
  );
}

function ConnectStep() {
  const navigate = useNavigate();
  const location = useLocation();
  const result = (location.state as { google?: ConnectResult } | null)?.google;
  const { data } = useGoogleConnection();

  return (
    <>
      <StepHeader title="Connect Google Calendar">
        Your schedule stays in Google. Mjolnir turns each block into a task and keeps score.
      </StepHeader>
      <GoogleConnectCard
        returnTo={{ ok: '/onboarding/calendars', error: '/onboarding/connect' }}
        error={result?.status === 'error' ? connectErrorMessage(result.reason) : null}
      />
      <div className="mt-6 flex justify-end">
        <Button onClick={() => navigate('/onboarding/calendars')} disabled={!data?.connected}>
          Continue
        </Button>
      </div>
    </>
  );
}

function CalendarsStep() {
  const navigate = useNavigate();
  const location = useLocation();
  const justConnected =
    (location.state as { google?: ConnectResult } | null)?.google?.status === 'ok';
  const { data: calendars } = useCalendars();
  const anyEnabled = calendars?.some((c) => c.sync_enabled) ?? false;

  return (
    <>
      <StepHeader title="Pick calendars">Choose the calendars you plan your day on.</StepHeader>
      {justConnected && (
        <div className="mb-4">
          <Notice>Google Calendar connected.</Notice>
        </div>
      )}
      <CalendarPicker />
      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={() => navigate('/onboarding/connect')}>
          Back
        </Button>
        <Button onClick={() => navigate('/onboarding/colours')} disabled={!anyEnabled}>
          Continue
        </Button>
      </div>
    </>
  );
}

function ColoursStep() {
  const navigate = useNavigate();
  const { data: saved, isLoading } = useColorRules();
  const { data: calendars } = useCalendars();
  const save = useSaveColorRules();
  const [draft, setDraft] = useState<ColorRule[] | null>(null);
  const rules = draft ?? saved;

  async function next() {
    if (rules) await save.mutateAsync(normalizePrimaries(rules));
    navigate('/onboarding/day');
  }

  return (
    <>
      <StepHeader title="Colours are points">
        Give each event colour 1 to 3 points. Colours at 0 are not tasks: sleep, meals, buffers.
        When two colours share a value, pick the one Mjolnir uses for new events.
      </StepHeader>
      <Card>
        {isLoading || !rules ? (
          <Loading />
        ) : (
          <ColorMap
            rules={rules}
            onChange={setDraft}
            defaultColor={calendars?.find((c) => c.is_primary)?.color}
          />
        )}
      </Card>
      {save.error && (
        <div className="mt-4">
          <Notice tone="error">Could not save colours. Try again.</Notice>
        </div>
      )}
      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={() => navigate('/onboarding/calendars')}>
          Back
        </Button>
        <Button onClick={next} disabled={!rules || save.isPending}>
          Continue
        </Button>
      </div>
    </>
  );
}

/** What the visitor chose in the landing page's first-step dialog, if anything. */
function signupChoice(): Partial<DayValues> {
  try {
    const raw = sessionStorage.getItem('mjolnir.signup');
    if (!raw) return {};
    const { mode, close } = JSON.parse(raw) as { mode?: string; close?: string };
    const hour = close ? Number(close.split(':')[0]) : NaN;
    return {
      ...(mode === 'events' || mode === 'tasks' ? { google_item_type: mode } : {}),
      ...(Number.isInteger(hour) && hour >= 0 && hour <= 23 ? { day_boundary_hour: hour } : {}),
    };
  } catch {
    return {};
  }
}

function DayStep() {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const [draft, setDraft] = useState<Partial<DayValues>>(signupChoice);

  if (!profile) return <Loading />;
  const values: DayValues = {
    // A new profile starts on UTC; suggest the browser's zone instead.
    timezone: profile.timezone === 'UTC' ? browserTimezone() : profile.timezone,
    day_boundary_hour: profile.day_boundary_hour,
    week_start: profile.week_start,
    google_item_type: profile.google_item_type as DayValues['google_item_type'],
    ...draft,
  };

  async function next() {
    await update.mutateAsync(values);
    navigate('/onboarding/areas');
  }

  return (
    <>
      <StepHeader title="Your day">Confirm your timezone and when your day ends.</StepHeader>
      <Card>
        <DaySettings
          values={values}
          onChange={(p) => setDraft((d) => ({ ...d, ...p }) as Partial<DayValues>)}
        />
      </Card>
      {update.error && (
        <div className="mt-4">
          <Notice tone="error">Could not save settings. Try again.</Notice>
        </div>
      )}
      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={() => navigate('/onboarding/colours')}>
          Back
        </Button>
        <Button onClick={next} disabled={update.isPending}>
          Continue
        </Button>
      </div>
    </>
  );
}

const SUGGESTED_AREAS = ['Rich', 'Muscular', 'Intelligent'];

function AreasStep() {
  const navigate = useNavigate();
  const { data: areas, isLoading } = useAreas();
  const saveArea = useSaveArea();
  const update = useUpdateProfile();
  // A ref, not state: StrictMode runs effects twice and must not create the set twice.
  const seeded = useRef(false);

  // Start from the suggested set once; the owner edits or removes them below.
  useEffect(() => {
    if (isLoading || seeded.current || !areas) return;
    seeded.current = true;
    if (areas.length === 0) {
      SUGGESTED_AREAS.forEach((name, i) => saveArea.mutate({ name, sort_order: i }));
    }
  }, [isLoading, areas, saveArea]);

  async function finish() {
    await update.mutateAsync({ onboarded_at: new Date().toISOString() });
    navigate('/', { replace: true });
  }

  return (
    <>
      <StepHeader title="Areas and habits">
        Areas group your work. Habits are daily checks that count toward the score. Both can change
        later in Settings.
      </StepHeader>
      <div className="flex flex-col gap-4">
        <Card title="Areas">
          <AreasEditor />
        </Card>
        <Card title="Habits">
          <HabitsEditor />
        </Card>
      </div>
      <div className="mt-6 flex justify-between">
        <Button variant="ghost" onClick={() => navigate('/onboarding/day')}>
          Back
        </Button>
        <Button onClick={finish} disabled={update.isPending}>
          Finish
        </Button>
      </div>
    </>
  );
}
