import { sha256Hex } from '../_shared/crypto.ts';
import { adminClient } from '../_shared/env.ts';
import { handleWebhook, type WebhookChannel } from './handler.ts';

const admin = adminClient();

Deno.serve(async (req) => {
  try {
    return await handleWebhook(req, {
      hash: sha256Hex,
      async channel(id) {
        const { data, error } = await admin.rpc('svc_channel_get', { p_id: id });
        if (error) throw new Error(`svc_channel_get: ${error.code}`);
        return (data as unknown as WebhookChannel) ?? null;
      },
      async queueSync(calendarId) {
        const { error } = await admin.rpc('svc_queue_sync', { p_calendar_id: calendarId });
        if (error) throw new Error(`svc_queue_sync: ${error.code}`);
      },
    });
  } catch (err) {
    console.error('google-webhook failed', err instanceof Error ? err.message : 'unknown');
    // 5xx makes Google retry with backoff.
    return new Response(null, { status: 500 });
  }
});
