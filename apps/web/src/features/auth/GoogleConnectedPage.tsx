import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loading } from '../../components/ui.tsx';
import { type ConnectResult, takeConnectReturn } from '../../lib/googleConnect.ts';
import { keys } from '../../lib/queries.ts';

/** google-callback sends the browser here with only a status: never a token (plan 8.1). */
export function GoogleConnectedPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    const target = takeConnectReturn();
    const result: ConnectResult =
      params.get('status') === 'ok'
        ? { status: 'ok' }
        : { status: 'error', reason: params.get('reason') ?? 'internal' };
    void qc.invalidateQueries({ queryKey: keys.google });
    void qc.invalidateQueries({ queryKey: keys.calendars });
    navigate(result.status === 'ok' ? target.ok : target.error, {
      replace: true,
      state: { google: result },
    });
  }, [params, navigate, qc]);

  return (
    <div className="flex min-h-full items-center justify-center">
      <Loading label="Finishing Google connection…" />
    </div>
  );
}
