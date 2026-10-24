// google_writes jobs (plan 8.7): the "✓ " title prefix on ticked items (3.11), and the links in an
// event's private properties (3.8). Each job reads the item's current state, so repeated or
// out-of-order jobs converge on the right result.
import {
  appProperties,
  type EventPatch,
  type FetchFn,
  GoogleError,
  patchEvent,
} from "./google.ts";

export interface CheckmarkJob {
  kind: "checkmark";
  item_id: string;
}

export interface LinksJob {
  kind: "links";
  item_id: string;
}

export interface WriteContext {
  user_id: string;
  status: string;
  raw_title: string | null;
  google_event_id: string;
  google_active: boolean;
  google_etag: string | null;
  google_calendar_id: string;
  writeback: boolean;
  /** All linked tag names and deadline ids (svc_item_links). */
  tags: string[];
  deadlines: string[];
}

export interface WriteDeps {
  context(itemId: string): Promise<WriteContext | null>;
  done(itemId: string, etag: string, rawTitle: string): Promise<void>;
  accessToken(userId: string): Promise<string>;
  fetchFn?: FetchFn;
}

const CHECK = /^\s*✓\s*/;

/** The Google title for an item: its title with "✓ " in front when done, without otherwise. */
export function withCheckmark(raw: string, done: boolean): string {
  const base = raw.replace(CHECK, "");
  return done ? `✓ ${base}` : base;
}

export async function runCheckmark(
  job: CheckmarkJob,
  deps: WriteDeps,
): Promise<string> {
  const ctx = await deps.context(job.item_id);
  if (!ctx || !ctx.google_active || !["done", "pending"].includes(ctx.status)) {
    return "skipped";
  }

  const current = ctx.raw_title ?? "";
  const wanted = withCheckmark(current, ctx.writeback && ctx.status === "done");
  if (wanted === current) return "unchanged";
  return write(job.item_id, ctx, { summary: wanted }, wanted, deps);
}

export async function runLinks(
  job: LinksJob,
  deps: WriteDeps,
): Promise<string> {
  const ctx = await deps.context(job.item_id);
  if (!ctx || !ctx.google_active || ctx.status === "deleted") return "skipped";
  const patch = {
    extendedProperties: {
      private: appProperties(job.item_id, ctx.tags, ctx.deadlines),
    },
  };
  return write(job.item_id, ctx, patch, ctx.raw_title ?? "", deps);
}

async function write(
  itemId: string,
  ctx: WriteContext,
  patch: EventPatch,
  title: string,
  deps: WriteDeps,
): Promise<string> {
  try {
    const event = await patchEvent(
      await deps.accessToken(ctx.user_id),
      ctx.google_calendar_id,
      ctx.google_event_id,
      patch,
      { ifMatch: ctx.google_etag },
      deps.fetchFn,
    );
    await deps.done(itemId, event.etag, event.summary ?? title);
    return "written";
  } catch (err) {
    if (err instanceof GoogleError) {
      // Deleted in Google, or on a calendar we may not write: nothing to do.
      if (err.status === 404 || err.status === 410) return "gone";
      if (err.status === 403 && !/rate|quota/i.test(err.code)) {
        return "read_only";
      }
    }
    // 412 (changed in Google since we read it) and transient errors retry after the timeout,
    // by which time the sync has stored the newer etag and title.
    throw err;
  }
}
