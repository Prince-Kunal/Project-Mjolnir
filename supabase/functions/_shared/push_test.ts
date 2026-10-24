import { assertEquals, assertRejects } from '@std/assert';
import { type Device, type PushJob, PushSendError, runPush } from './push.ts';

const job: PushJob = {
  kind: 'push',
  user_id: 'u1',
  tag: 'morning',
  title: 'You missed 2 tasks',
  body: '3 points. Reschedule, mark done or dismiss.',
  url: '/missed',
};

function setup(devices: Device[], answer: (d: Device) => number) {
  const log: string[] = [];
  return {
    log,
    deps: {
      devices: () => Promise.resolve(devices),
      send: (d: Device, payload: string, opts: { topic: string }) => {
        log.push(`send ${d.endpoint} ${opts.topic} ${payload}`);
        const status = answer(d);
        return status === 201 ? Promise.resolve() : Promise.reject(new PushSendError(status));
      },
      gone: (endpoint: string) => {
        log.push(`gone ${endpoint}`);
        return Promise.resolve();
      },
    },
  };
}

const device = (n: number): Device => ({
  endpoint: `https://push.example/${n}`,
  p256dh: 'k',
  auth: 'a',
});

Deno.test('a notification goes to every device with what the service worker shows', async () => {
  const { deps, log } = setup([device(1), device(2)], () => 201);
  assertEquals(await runPush(job, deps), 'sent 2');
  assertEquals(
    log[0],
    'send https://push.example/1 morning {"title":"You missed 2 tasks","body":"3 points. Reschedule, mark done or dismiss.","url":"/missed","tag":"morning"}',
  );
});

Deno.test('devices the push service calls gone are forgotten', async () => {
  const { deps, log } = setup([device(1), device(2), device(3)], (d) =>
    d.endpoint.endsWith('1') ? 410 : d.endpoint.endsWith('2') ? 404 : 201,
  );
  assertEquals(await runPush(job, deps), 'sent 1, 2 gone');
  assertEquals(
    log.filter((l) => l.startsWith('gone')),
    ['gone https://push.example/1', 'gone https://push.example/2'],
  );
});

Deno.test('a job with nothing delivered is retried; a partly delivered one is not', async () => {
  await assertRejects(() => runPush(job, setup([device(1)], () => 503).deps), PushSendError);
  const partly = setup([device(1), device(2)], (d) => (d.endpoint.endsWith('1') ? 503 : 201));
  assertEquals(await runPush(job, partly.deps), 'sent 1, some failed');
});

Deno.test('a user with no devices is skipped', async () => {
  assertEquals(await runPush(job, setup([], () => 201).deps), 'no_devices');
});
