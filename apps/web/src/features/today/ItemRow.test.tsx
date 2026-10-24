import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DayItem } from '../../lib/day.ts';
import { ItemRow } from './ItemRow.tsx';

const base: DayItem = {
  id: 'i1',
  source: 'calendar',
  title: 'PR review',
  points: 2,
  status: 'pending',
  logical_date: '2026-10-20',
  start_at: '2026-10-20T12:30:00Z',
  end_at: '2026-10-20T14:30:00Z',
  is_all_day: false,
  planned_minutes: 120,
  actual_minutes: null,
  completed_at: null,
  finalized: false,
  marked_late: false,
  habit_id: null,
  area_id: null,
  google_event_id: 'ev1',
  google_calendar_id: 'me@x.com',
  color_key: '11',
  calendar_color: '#9fe1e7',
  tags: [{ id: 't1', name: 'lfx', source: 'hashtag' }],
};

function renderRow(over: Partial<DayItem> = {}, now = Date.parse('2026-10-20T13:00:00Z')) {
  const onToggle = vi.fn();
  const onOpen = vi.fn();
  render(
    <ul>
      <ItemRow
        item={{ ...base, ...over }}
        timeZone="Asia/Kolkata"
        isToday
        now={now}
        onToggle={onToggle}
        onOpen={onOpen}
      />
    </ul>,
  );
  return { onToggle, onOpen };
}

describe('ItemRow', () => {
  it('shows the time range in the user timezone, tags and points', () => {
    renderRow();
    expect(screen.getByText('18:00–20:00')).toBeInTheDocument();
    expect(screen.getByText('#lfx')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '2 points' })).toBeInTheDocument();
  });

  it('ticks through the checkbox and opens through the title', () => {
    const { onToggle, onOpen } = renderRow();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tick PR review' }));
    expect(onToggle).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByText('PR review'));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('marks a pending block past its end as overdue', () => {
    renderRow({}, Date.parse('2026-10-20T15:00:00Z'));
    expect(screen.getByText('Overdue')).toBeInTheDocument();
  });

  it('does not mark a done block overdue', () => {
    renderRow({ status: 'done' }, Date.parse('2026-10-20T15:00:00Z'));
    expect(screen.queryByText('Overdue')).toBeNull();
    expect(screen.getByRole('checkbox', { name: 'Untick PR review' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('locks a finalized item', () => {
    renderRow({ status: 'missed', finalized: true });
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.getByText('Missed')).toBeInTheDocument();
  });
});
