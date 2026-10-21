// google-webhook: Google's push notifications (plan 8.6). No JWT arrives; the channel token,
// compared in constant time against its stored hash, proves the call is ours. Answers at once.
import { timingSafeEqual } from '../_shared/crypto.ts';

export interface WebhookChannel {
  calendar_id: string | null;
  token_hash: string;
  stopped_at: string | null;
}

export interface WebhookDeps {
  channel(id: string): Promise<WebhookChannel | null>;
  queueSync(calendarId: string): Promise<void>;
  hash(token: string): Promise<string>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function handleWebhook(req: Request, deps: WebhookDeps): Promise<Response> {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const id = req.headers.get('x-goog-channel-id') ?? '';
  const token = req.headers.get('x-goog-channel-token') ?? '';
  const state = req.headers.get('x-goog-resource-state');

  const channel = UUID.test(id) ? await deps.channel(id) : null;
  if (!channel || channel.stopped_at) return new Response(null, { status: 404 });
  if (!timingSafeEqual(await deps.hash(token), channel.token_hash)) {
    return new Response(null, { status: 401 });
  }
  // "sync" only announces that notifications are starting.
  if (state !== 'sync' && channel.calendar_id) await deps.queueSync(channel.calendar_id);
  return new Response(null, { status: 200 });
}
