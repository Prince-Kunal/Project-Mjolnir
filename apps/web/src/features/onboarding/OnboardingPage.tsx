import { type ColorRule, normalizePrimaries } from '@mjolnir/domain';
import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
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
  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col px-4 py-8">
      <p className="text-xs font-medium tracking-wide text-muted uppercase">
        Step {index + 2} of {TOTAL}
      </p>
      <div className="mt-2 mb-6 flex gap-1.5" aria-hidden>
        {Array.from({ length: TOTAL }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i <= index + 1 ? 'bg-accent' : 'bg-surface-2'}`}
          />
        ))}
      </div>
      {step === 'connect' && <ConnectStep />}
      {step === 'calendars' && <CalendarsStep />}
      {step === 'colours' && <ColoursStep />}
      {step === 'day' && <DayStep />}
      {step === 'areas' && <AreasStep />}
    </main>
  );
}

function StepHeader({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <header className="mb-5">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted">{children}</p>
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

function DayStep() {
  const navigate = useNavigate();
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const [draft, setDraft] = useState<Partial<DayValues>>({});

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
