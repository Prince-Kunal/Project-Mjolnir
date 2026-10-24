import { assertEquals, assertRejects } from "@std/assert";
import {
  type ChannelDeps,
  runStop,
  runWatch,
  type WatchContext,
} from "./channels.ts";
import { CALENDAR_API, ReconnectNeededError } from "./google.ts";
import { fakeFetch } from "./testing.ts";

const NOW = new Date("2026-10-21T10:00:00Z");
const inHours = (h: number) =>
  new Date(NOW.getTime() + h * 3_600_000).toISOString();

function setup(
  ctx: WatchContext | null,
  opts: {
    tokenFails?: boolean;
    stopStatus?: number;
    watchError?: [number, string];
  } = {},
) {
  const log: string[] = [];
  const stored = new Map([
    [
      "old",
      {
        id: "old",
        user_id: "u1",
        resource_id: "res-old",
        stopped_at: null as string | null,
      },
    ],
  ]);
  const fetchFn = fakeFetch({
    [`${CALENDAR_API}/calendars/me%40x.com/events/watch`]: (req) => {
      const body = JSON.parse(req.body);
      log.push(`watch ${body.id} ${body.address} ${body.type}`);
      if (opts.watchError) {
        const [status, reason] = opts.watchError;
        return Response.json(
          { error: { code: status, errors: [{ reason }], message: reason } },
          { status },
        );
      }
      return Response.json({
        resourceId: "res-new",
        expiration: String(NOW.getTime() + 7 * 86_400_000),
      });
    },
    [`${CALENDAR_API}/channels/stop`]: (req) => {
      log.push(`google-stop ${JSON.parse(req.body).id}`);
      return new Response(null, { status: opts.stopStatus ?? 204 });
    },
  });
  const deps: ChannelDeps = {
    fetchFn,
    now: () => NOW,
    context: () => Promise.resolve(ctx),
    channel: (id) => Promise.resolve(stored.get(id) ?? null),
    save: (c) => {
      log.push(`save ${c.id} ${c.resource_id} ${c.token_hash} ${c.expires_at}`);
      return Promise.resolve();
    },
    stopped: (id) => {
      log.push(`stopped ${id}`);
      return Promise.resolve();
    },
    pushUnsupported: (calendarId, reason) => {
      log.push(`unsupported ${calendarId} ${reason}`);
      return Promise.resolve();
    },
    accessToken: () =>
      opts.tokenFails
        ? Promise.reject(new ReconnectNeededError())
        : Promise.resolve("at"),
    newId: () => "new-id",
    newSecret: () => "secret",
    hash: (s) => Promise.resolve(`hash(${s})`),
  };
  return { deps, log, fetchFn };
}

const ctx = (channels: WatchContext["channels"] = []): WatchContext => ({
  user_id: "u1",
  google_calendar_id: "me@x.com",
  sync_enabled: true,
  channels,
});

const job = (replace: string | null = null) =>
  ({
    kind: "watch",
    calendar_id: "cal-1",
    replace,
    address: "https://x.supabase.co/functions/v1/google-webhook",
  }) as const;

Deno.test("watch creates a channel and stores only the token hash", async () => {
  const { deps, log } = setup(ctx());
  assertEquals(await runWatch(job(), deps), "watching");
  assertEquals(log, [
    "watch new-id https://x.supabase.co/functions/v1/google-webhook web_hook",
    "save new-id res-new hash(secret) 2026-10-28T10:00:00.000Z",
  ]);
});

Deno.test("a renewal creates the new channel before stopping the old one", async () => {
  const { deps, log } = setup(
    ctx([{ id: "old", resource_id: "res-old", expires_at: inHours(5) }]),
  );
  assertEquals(await runWatch(job("old"), deps), "watching");
  assertEquals(
    log.map((l) => l.split(" ")[0]),
    ["watch", "save", "google-stop", "stopped"],
  );
});

Deno.test("watch is idempotent while a healthy channel exists", async () => {
  const { deps, log } = setup(
    ctx([{ id: "other", resource_id: "r", expires_at: inHours(100) }]),
  );
  assertEquals(await runWatch(job(), deps), "already_watching");
  assertEquals(log, []);
});

Deno.test("a duplicate renewal still stops the replaced channel", async () => {
  const { deps, log } = setup(
    ctx([{ id: "other", resource_id: "r", expires_at: inHours(100) }]),
  );
  assertEquals(await runWatch(job("old"), deps), "already_watching");
  assertEquals(log, ["google-stop old", "stopped old"]);
});

Deno.test("a disabled or removed calendar is not watched", async () => {
  assertEquals(
    await runWatch(job(), setup({ ...ctx(), sync_enabled: false }).deps),
    "skipped",
  );
  assertEquals(await runWatch(job(), setup(null).deps), "skipped");
});

Deno.test(
  "stop tells Google and marks the channel stopped; unknown channels are skipped",
  async () => {
    const { deps, log } = setup(ctx());
    assertEquals(
      await runStop({ kind: "stop_channel", channel_id: "old" }, deps),
      "stopped",
    );
    assertEquals(log, ["google-stop old", "stopped old"]);
    assertEquals(
      await runStop({ kind: "stop_channel", channel_id: "nope" }, deps),
      "skipped",
    );
  },
);

Deno.test(
  "a channel Google no longer knows, or an account that needs reconnecting, is still marked stopped",
  async () => {
    const gone = setup(ctx(), { stopStatus: 404 });
    assertEquals(
      await runStop({ kind: "stop_channel", channel_id: "old" }, gone.deps),
      "stopped",
    );
    const noAccess = setup(ctx(), { tokenFails: true });
    assertEquals(
      await runStop({ kind: "stop_channel", channel_id: "old" }, noAccess.deps),
      "stopped",
    );
    assertEquals(noAccess.log, ["stopped old"]);
  },
);

Deno.test("a calendar Google refuses to watch is marked and not retried", async () => {
  const { deps, log } = setup(ctx(), {
    watchError: [400, "pushNotSupportedForRequestedResource"],
  });
  assertEquals(await runWatch(job(), deps), "push_unsupported");
  assertEquals(
    log.at(-1),
    "unsupported cal-1 400 pushNotSupportedForRequestedResource",
  );
});

Deno.test("rate limits and server errors still retry", async () => {
  for (
    const [status, reason] of [
      [403, "rateLimitExceeded"],
      [429, "rateLimitExceeded"],
      [503, "backendError"],
    ] as const
  ) {
    const { deps, log } = setup(ctx(), { watchError: [status, reason] });
    await assertRejects(() => runWatch(job(), deps));
    assertEquals(
      log.some((l) => l.startsWith("unsupported")),
      false,
    );
  }
});
