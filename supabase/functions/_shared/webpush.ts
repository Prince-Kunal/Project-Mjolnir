// Web Push with VAPID through @negrel/webpush, which runs on WebCrypto alone (checked on the Edge
// runtime in Phase 8). Keys come from `pnpm gen:vapid`.
import {
  ApplicationServer,
  type ExportedVapidKeys,
  importVapidKeys,
  PushMessageError,
  Urgency,
} from '@negrel/webpush';
import { type Device, PushSendError } from './push.ts';

/** Notifications older than this are dropped by the push service rather than shown late. */
const TTL_SECONDS = 6 * 3600;

export function createSender(vapidKeysJson: string, subject: string) {
  let server: Promise<ApplicationServer> | null = null;
  const app = () =>
    (server ??= importVapidKeys(JSON.parse(vapidKeysJson) as ExportedVapidKeys, {}).then(
      (vapidKeys) => ApplicationServer.new({ contactInformation: subject, vapidKeys }),
    ));

  return async (device: Device, payload: string, opts: { topic: string }): Promise<void> => {
    const subscriber = (await app()).subscribe({
      endpoint: device.endpoint,
      keys: { p256dh: device.p256dh, auth: device.auth },
    });
    try {
      await subscriber.pushTextMessage(payload, {
        urgency: Urgency.Normal,
        ttl: TTL_SECONDS,
        topic: opts.topic,
      });
    } catch (err) {
      if (err instanceof PushMessageError) throw new PushSendError(err.response.status);
      throw err;
    }
  };
}
