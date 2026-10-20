import { type ColorRule, normalizePrimaries } from '@mjolnir/domain';
import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button, Card, Loading, Notice } from '../../components/ui.tsx';
import { signOut, useAuth } from '../../lib/auth.ts';
import { connectErrorMessage, type ConnectResult } from '../../lib/googleConnect.ts';
import {
  type ProfileSettings,
  useCalendars,
  useColorRules,
  useProfile,
  useSaveColorRules,
  useUpdateProfile,
} from '../../lib/queries.ts';
import { CalendarPicker } from './CalendarPicker.tsx';
import { ColorMap } from './ColorMap.tsx';
import { DaySettings, type DayValues } from './DaySettings.tsx';
import { GoogleConnectCard } from './GoogleConnectCard.tsx';

export function MorePage() {
  const location = useLocation();
  const result = (location.state as { google?: ConnectResult } | null)?.google;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      {result?.status === 'ok' && <Notice>Google Calendar connected.</Notice>}
      <GoogleConnectCard
        returnTo={{ ok: '/more', error: '/more' }}
        error={result?.status === 'error' ? connectErrorMessage(result.reason) : null}
      />
      <CalendarPicker />
      <ColoursSettings />
      <DaySettingsCard />
      <AccountCard />
    </div>
  );
}

function ColoursSettings() {
  const { data: saved } = useColorRules();
  const { data: calendars } = useCalendars();
  const save = useSaveColorRules();
  const [draft, setDraft] = useState<ColorRule[] | null>(null);
  const rules = draft ?? saved;

  return (
    <Card
      title="Colours and points"
      description="Each event colour is worth 0 to 3 points. 0 means not a task."
    >
      {!rules ? (
        <Loading />
      ) : (
        <>
          <ColorMap
            rules={rules}
            onChange={setDraft}
            defaultColor={calendars?.find((c) => c.is_primary)?.color}
          />
          {draft && (
            <div className="mt-4 flex items-center justify-end gap-2">
              {save.error && <span className="text-sm text-band-not-good">Could not save.</span>}
              <Button variant="ghost" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <Button
                disabled={save.isPending}
                onClick={() =>
                  save.mutate(normalizePrimaries(draft), { onSuccess: () => setDraft(null) })
                }
              >
                Save colours
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function DaySettingsCard() {
  const { data: profile } = useProfile();
  const update = useUpdateProfile();

  if (!profile) return null;
  const values: DayValues = {
    timezone: profile.timezone,
    day_boundary_hour: profile.day_boundary_hour,
    week_start: profile.week_start,
    google_item_type: profile.google_item_type as DayValues['google_item_type'],
  };
  const toggle = (key: keyof ProfileSettings, label: string, hint: string) => (
    <label className="flex cursor-pointer items-start gap-3 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 size-4 accent-[var(--color-accent)]"
        checked={Boolean(profile[key as keyof typeof profile])}
        onChange={(e) => update.mutate({ [key]: e.target.checked })}
      />
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );

  return (
    <Card title="Day and week">
      <div className="flex flex-col gap-5">
        <DaySettings values={values} onChange={(patch) => update.mutate(patch)} />
        {toggle(
          'include_all_day',
          'Include all-day events',
          'Off by default: they are usually birthdays and holidays.',
        )}
        {toggle(
          'writeback_checkmark',
          'Show ✓ in Google Calendar',
          'Ticked tasks get a “✓ ” title prefix, visible in widgets and Apple Calendar.',
        )}
        {update.error && <Notice tone="error">Could not save settings.</Notice>}
      </div>
    </Card>
  );
}

function AccountCard() {
  const email = useAuth((s) => s.session?.user.email);
  return (
    <Card title="Account">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          Signed in as <span className="font-medium">{email}</span>
        </p>
        <Button variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    </Card>
  );
}
