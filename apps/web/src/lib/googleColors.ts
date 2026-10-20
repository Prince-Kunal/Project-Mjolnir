import type { ColorKey } from '@mjolnir/domain';

export interface GoogleColor {
  key: ColorKey;
  name: string;
  /** Swatch as Google Calendar shows it. Null for calendar default (uses the calendar's colour). */
  hex: string | null;
}

// Google Calendar's event colour palette, by the API's colorId.
export const GOOGLE_EVENT_COLORS: GoogleColor[] = [
  { key: 'default', name: 'Calendar default', hex: null },
  { key: '1', name: 'Lavender', hex: '#7986cb' },
  { key: '2', name: 'Sage', hex: '#33b679' },
  { key: '3', name: 'Grape', hex: '#8e24aa' },
  { key: '4', name: 'Flamingo', hex: '#e67c73' },
  { key: '5', name: 'Banana', hex: '#f6bf26' },
  { key: '6', name: 'Tangerine', hex: '#f4511e' },
  { key: '7', name: 'Peacock', hex: '#039be5' },
  { key: '8', name: 'Graphite', hex: '#616161' },
  { key: '9', name: 'Blueberry', hex: '#3f51b5' },
  { key: '10', name: 'Basil', hex: '#0b8043' },
  { key: '11', name: 'Tomato', hex: '#d50000' },
];
