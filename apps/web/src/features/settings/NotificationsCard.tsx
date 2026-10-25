import { useEffect, useState } from 'react';
import { Button, Card, Notice } from '../../components/ui.tsx';
import {
  disablePush,
  enablePush,
  type PushState,
  pushState,
  sendTestPush,
} from '../../lib/push.ts';
import { type ProfileSettings, useProfile, useUpdateProfile } from '../../lib/queries.ts';

const STATE_TEXT: Record<PushState, string> = {
  unsupported: 'This browser cannot receive notifications.',
  needs_install:
    'On iPhone and iPad, notifications work from the Home Screen app: tap Share, then Add to Home Screen, and open Mjolnir from there.',
  not_configured: 'Notifications are not set up for this build.',
  denied:
    'Notifications are blocked for this site. Allow them in the browser settings, then reload.',
  off: 'Off on this device.',
  on: 'On for this device.',
};

/** Web Push (section 10): this device's subscription, what to send, and when. */
export function NotificationsCard() {
  const { data: profile } = useProfile();
  const update = useUpdateProfile();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);

  useEffect(() => {
    void pushState().then(setState);
  }, []);

  async function run(action: () => Promise<void>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      setState(await pushState());
      setMessage({ tone: 'info', text: done });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  if (!profile || !state) return null;
  const toggle = (
    key: keyof ProfileSettings,
    label: string,
    hint: string,
    time?: keyof ProfileSettings,
  ) => (
    <div className="flex items-start justify-between gap-3 text-sm">
      <label className="flex cursor-pointer items-start gap-3">
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
      {time && (
        <input
          type="time"
          aria-label={`${label} time`}
          value={String(profile[time as keyof typeof profile] ?? '').slice(0, 5)}
          onChange={(e) => e.target.value && update.mutate({ [time]: e.target.value })}
          className="rounded-[var(--radius-inner)] bg-surface-2 px-2 py-1 text-xs"
        />
      )}
    </div>
  );

  return (
    <Card title="Notifications" description={STATE_TEXT[state]}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          {state === 'off' && (
            <Button
              disabled={busy}
              onClick={() => run(enablePush, 'Notifications are on for this device.')}
            >
              Turn on for this device
            </Button>
          )}
          {state === 'on' && (
            <>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() => run(sendTestPush, 'Test sent. It should arrive within a minute.')}
              >
                Send a test
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => run(disablePush, 'Notifications are off for this device.')}
              >
                Turn off
              </Button>
            </>
          )}
        </div>
        {message && <Notice tone={message.tone}>{message.text}</Notice>}
        {toggle(
          'notify_morning',
          'Morning: missed tasks',
          'When yesterday left tasks in the missed inbox.',
          'morning_prompt_time',
        )}
        {toggle(
          'notify_deadlines',
          'Morning: deadline warnings',
          'Overdue deadlines, and ones due soon with no sessions scheduled.',
        )}
        {toggle(
          'notify_evening',
          'Evening: points still open',
          'When today still has unticked tasks.',
          'evening_reminder_time',
        )}
        {update.error && <Notice tone="error">Could not save settings.</Notice>}
      </div>
    </Card>
  );
}
