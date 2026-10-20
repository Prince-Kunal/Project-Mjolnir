import { useState } from 'react';
import { Button, Card, Loading, Notice } from '../../components/ui.tsx';
import { type ConnectReturn, startGoogleConnect } from '../../lib/googleConnect.ts';
import { useGoogleConnection } from '../../lib/queries.ts';

export function GoogleConnectCard({
  returnTo,
  error,
}: {
  returnTo: ConnectReturn;
  error?: string | null;
}) {
  const { data, isLoading } = useGoogleConnection();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  async function connect() {
    setStarting(true);
    setStartError(null);
    try {
      await startGoogleConnect(returnTo);
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Could not start the Google connection');
      setStarting(false);
    }
  }

  const needsReconnect = data?.connected && data.status === 'reconnect_needed';

  return (
    <Card
      title="Google Calendar"
      description="Mjolnir reads and writes your calendar events. Your Google tokens stay on the server."
    >
      <div className="flex flex-col gap-3">
        {(error || startError) && <Notice tone="error">{error ?? startError}</Notice>}
        {needsReconnect && (
          <Notice tone="error">
            Google stopped accepting Mjolnir’s access. Reconnect to resume syncing.
          </Notice>
        )}
        {isLoading ? (
          <Loading />
        ) : data?.connected ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              Connected as <span className="font-medium">{data.email}</span>
            </p>
            <Button variant="secondary" onClick={connect} disabled={starting}>
              {starting ? 'Opening Google…' : needsReconnect ? 'Reconnect' : 'Connect again'}
            </Button>
          </div>
        ) : (
          <Button onClick={connect} disabled={starting} className="self-start">
            {starting ? 'Opening Google…' : 'Connect Google Calendar'}
          </Button>
        )}
      </div>
    </Card>
  );
}
