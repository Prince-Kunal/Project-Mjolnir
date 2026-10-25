import type { ColorRule, ItemStatus } from '@mjolnir/domain';

/** The parts of a Google Calendar event the sync reads (singleEvents=true). */
export interface GEvent {
  id: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  etag?: string;
  summary?: string;
  colorId?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  recurringEventId?: string;
  updated?: string;
  eventType?: string;
  attendees?: { self?: boolean; responseStatus?: string }[];
  /** Ours: pt_app, pt_item, pt_tags, pt_deadlines (section 7). */
  extendedProperties?: { private?: Record<string, string> };
}

/** What the planner knows about the item an event maps to now (`google_active`). */
export interface ItemSnapshot {
  id: string;
  google_event_id: string;
  status: ItemStatus;
  finalized: boolean;
  logical_date: string;
  start_at: string;
  end_at: string | null;
  points: number;
  raw_title: string | null;
  planned_minutes: number | null;
  google_etag: string | null;
  /** Google colour id, or 'default'. Null for items synced before colours were stored. */
  color_key?: string | null;
}

export interface PlanContext {
  timeZone: string;
  boundaryHour: number;
  includeAllDay: boolean;
  rules: ColorRule[];
  now: Date;
  window: { from: Date; to: Date };
  /** Logical date Events mode (re)started: earlier events make no new items (3.13). */
  createFrom?: string | null;
}

export interface ItemFields {
  /** Set when app-api chose the id in advance (it goes into the event's pt_item property). */
  id?: string;
  title: string;
  raw_title: string;
  points: number;
  logical_date: string;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  planned_minutes: number | null;
  status: ItemStatus;
  google_event_id: string;
  recurring_event_id: string | null;
  google_etag: string | null;
  google_updated_at: string | null;
  /** The event's Google colour id, or 'default' for the calendar's colour. */
  color_key: string;
}

/** Links the app stored in an event's private properties: tag names and deadline ids. */
export interface Links {
  tags: string[];
  deadlines: string[];
}

export interface AuditEvent {
  kind: string;
  payload?: Record<string, unknown>;
}

export interface Expect {
  status: ItemStatus;
  finalized: boolean;
}

export type SyncOp =
  | { op: 'create'; item: ItemFields; tags: string[]; links?: Links; events: AuditEvent[] }
  | {
      op: 'update';
      id: string;
      expect: Expect;
      patch: Partial<ItemFields>;
      tags?: string[];
      events: AuditEvent[];
    }
  | {
      op: 'replace';
      id: string;
      expect: Expect;
      old_patch: { status?: ItemStatus; miss_reason?: string; finalized?: boolean };
      old_events: AuditEvent[];
      item: ItemFields;
      tags: string[];
      events: AuditEvent[];
    };

export interface PagePlan {
  ops: SyncOp[];
  /** Unchanged items the run saw (so the full-sync sweep keeps them). */
  seen: string[];
}
