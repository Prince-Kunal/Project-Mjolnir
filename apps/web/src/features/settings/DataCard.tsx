import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Notice } from '../../components/ui.tsx';
import { daysCsv, deleteAccount, download, fetchExport, itemsCsv } from '../../lib/account.ts';

/** Export (CSV and JSON) and account deletion (section 13). */
export function DataCard() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const navigate = useNavigate();
  const stamp = new Date().toISOString().slice(0, 10);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card title="Your data">
      <div className="flex flex-col gap-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() =>
              run('json', async () => {
                const data = await fetchExport();
                download(
                  `mjolnir-${stamp}.json`,
                  'application/json',
                  JSON.stringify(data, null, 2),
                );
              })
            }
          >
            {busy === 'json' ? 'Preparing…' : 'Download everything (JSON)'}
          </Button>
          <Button
            variant="secondary"
            disabled={busy !== null}
            onClick={() =>
              run('csv', async () => {
                const data = await fetchExport();
                download(`mjolnir-items-${stamp}.csv`, 'text/csv', itemsCsv(data));
                download(`mjolnir-days-${stamp}.csv`, 'text/csv', daysCsv(data));
              })
            }
          >
            {busy === 'csv' ? 'Preparing…' : 'Download items and days (CSV)'}
          </Button>
        </div>

        <div className="border-t border-border pt-4">
          {!confirming ? (
            <Button
              variant="ghost"
              className="px-0 text-band-not-good"
              onClick={() => setConfirming(true)}
            >
              Delete account…
            </Button>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg border border-band-not-good/40 p-3">
              <p>
                This stops syncing, removes Mjolnir’s access to your Google account, and deletes
                every item, score, deadline and note. Your Google Calendar events stay as they are.
                Download your data first if you want a copy.
              </p>
              <label className="block">
                <span className="mb-1 block text-xs text-muted">Type “delete” to confirm</span>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  className="w-40 rounded-lg border border-border bg-surface-2 px-3 py-1.5"
                />
              </label>
              <div className="flex gap-2">
                <Button
                  className="bg-band-not-good"
                  disabled={typed.trim().toLowerCase() !== 'delete' || busy !== null}
                  onClick={() =>
                    run('delete', async () => {
                      await deleteAccount();
                      navigate('/sign-in', { replace: true });
                    })
                  }
                >
                  {busy === 'delete' ? 'Deleting…' : 'Delete my account'}
                </Button>
                <Button variant="ghost" onClick={() => (setConfirming(false), setTyped(''))}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Card>
  );
}
