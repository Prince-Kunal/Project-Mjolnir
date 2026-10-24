// `push` jobs (section 10): one notification to every device a user turned notifications on for.
// Devices the push service reports gone (404, 410) are forgotten.

export interface PushJob {
  kind: 'push';
  user_id: string;
  tag: string;
  title: string;
  body: string;
  url: string;
}

export interface Device {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** A push service refused a message; `status` is its HTTP status. */
export class PushSendError extends Error {
  constructor(readonly status: number) {
    super(`push service answered ${status}`);
  }
}

export interface PushDeps {
  devices(userId: string): Promise<Device[]>;
  /** Encrypts and posts one message. Throws PushSendError when the service refuses it. */
  send(device: Device, payload: string, opts: { topic: string }): Promise<void>;
  gone(endpoint: string): Promise<void>;
}

export async function runPush(job: PushJob, deps: PushDeps): Promise<string> {
  const devices = await deps.devices(job.user_id);
  if (!devices.length) return 'no_devices';

  // What the service worker shows (apps/web/public/push-sw.js).
  const payload = JSON.stringify({ title: job.title, body: job.body, url: job.url, tag: job.tag });
  let sent = 0;
  let gone = 0;
  let failed: unknown = null;
  for (const device of devices) {
    try {
      await deps.send(device, payload, { topic: job.tag });
      sent++;
    } catch (err) {
      if (err instanceof PushSendError && (err.status === 404 || err.status === 410)) {
        await deps.gone(device.endpoint);
        gone++;
      } else {
        failed = err;
      }
    }
  }
  // Retry only when nothing went out, so no device gets the same notification twice.
  if (sent === 0 && failed) throw failed;
  return `sent ${sent}${gone ? `, ${gone} gone` : ''}${failed ? ', some failed' : ''}`;
}
