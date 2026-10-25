// The landing page's sample day and its interface fragments. Sample content: a student's day in
// Asia/Kolkata. Every score is computed with the app's own rules (packages/domain), never typed in.
import { scoreDay, type ItemStatus } from '@mjolnir/domain';

export interface SampleBlock {
  id: string;
  title: string;
  tag?: string;
  start: string;
  end: string;
  /** Google Calendar colour id and the points that colour is worth. */
  color: string;
  colorName: string;
  points: 0 | 1 | 2 | 3;
  done: boolean;
}

export const COLOR_HEX: Record<string, string> = {
  '11': '#d50000',
  '5': '#f6bf26',
  '7': '#039be5',
  '8': '#616161',
  '2': '#33b679',
  '4': '#e67c73',
};

/** The colour map behind the sample: four of Google's eleven colours carry points. */
export const COLOR_MAP = [
  { key: '11', name: 'Tomato', points: 3 },
  { key: '5', name: 'Banana', points: 2 },
  { key: '7', name: 'Peacock', points: 1 },
  { key: '8', name: 'Graphite', points: 0 },
] as const;

export const SAMPLE_DAY: SampleBlock[] = [
  {
    id: 'a',
    title: 'Gym',
    tag: 'gym',
    start: '07:00',
    end: '08:00',
    color: '5',
    colorName: 'Banana',
    points: 2,
    done: true,
  },
  {
    id: 'b',
    title: 'DSA practice',
    start: '09:30',
    end: '11:00',
    color: '5',
    colorName: 'Banana',
    points: 2,
    done: true,
  },
  {
    id: 'c',
    title: 'LFX PR review',
    tag: 'lfx',
    start: '11:30',
    end: '13:00',
    color: '11',
    colorName: 'Tomato',
    points: 3,
    done: false,
  },
  {
    id: 'd',
    title: 'Operating systems lecture',
    start: '14:00',
    end: '15:00',
    color: '7',
    colorName: 'Peacock',
    points: 1,
    done: false,
  },
  {
    id: 'e',
    title: 'GSoC proposal draft',
    tag: 'gsoc',
    start: '16:00',
    end: '18:00',
    color: '11',
    colorName: 'Tomato',
    points: 3,
    done: false,
  },
  {
    id: 'f',
    title: 'Dinner',
    start: '20:00',
    end: '20:45',
    color: '8',
    colorName: 'Graphite',
    points: 0,
    done: false,
  },
  {
    id: 'g',
    title: 'Freelance invoice fixes',
    tag: 'freelance',
    start: '21:00',
    end: '22:00',
    color: '5',
    colorName: 'Banana',
    points: 2,
    done: false,
  },
];

export function scoreSample(blocks: SampleBlock[]) {
  return scoreDay(
    blocks
      .filter((b) => b.points > 0)
      .map((b) => ({ points: b.points, status: (b.done ? 'done' : 'pending') as ItemStatus })),
  );
}

/** A believable week for the week-table sheet: rates computed from points. */
export const SAMPLE_WEEK = [
  { day: 'Mon', planned: 14, done: 13, note: 'Clean day.' },
  { day: 'Tue', planned: 12, done: 7, note: 'Lab ran late.' },
  { day: 'Wed', planned: 13, done: 11, note: '' },
  { day: 'Thu', planned: 15, done: 15, note: 'Thor’s day, every block struck.' },
  { day: 'Fri', planned: 11, done: 9, note: '' },
  { day: 'Sat', planned: 8, done: 3, note: 'Rest pass.' },
  { day: 'Sun', planned: 10, done: 9, note: 'Sunday review done.' },
].map((d) => {
  const rate = Math.round((d.done * 1000) / d.planned) / 10;
  const band = rate >= 85 ? 'excellent' : rate >= 75 ? 'good' : rate >= 50 ? 'fair' : 'not_good';
  return { ...d, rate, band } as const;
});

export const WEEK_TOTALS = (() => {
  const planned = SAMPLE_WEEK.reduce((n, d) => n + d.planned, 0);
  const done = SAMPLE_WEEK.reduce((n, d) => n + d.done, 0);
  return {
    planned,
    done,
    rate: Math.round((done * 1000) / planned) / 10,
    counted: SAMPLE_WEEK.filter((d) => d.rate >= 50).length,
  };
})();
