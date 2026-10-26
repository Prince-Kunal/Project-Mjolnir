import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuickAdd } from './QuickAdd.tsx';

vi.mock('../../lib/queries.ts', () => ({
  useProfile: () => ({ data: { timezone: 'Asia/Kolkata', day_boundary_hour: 4 } }),
  useHabits: () => ({ data: [{ id: 'h1', title: 'Workout', points: 2 }] }),
}));
vi.mock('../../lib/deadlines.ts', () => ({
  useTags: () => ({
    data: [
      { id: 't1', name: 'lfx' },
      { id: 't2', name: 'gsoc' },
      { id: 't3', name: 'gym' },
    ],
  }),
  useDeadlines: () => ({
    data: [
      { id: 'd1', title: '5 PRs raised', completed_at: null, tags: [{ id: 't1', name: 'lfx' }] },
    ],
  }),
}));

function renderQuickAdd() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <QuickAdd defaultDate="2026-10-24" />
    </QueryClientProvider>,
  );
  return screen.getByRole('combobox', { name: 'Quick add' });
}

describe('QuickAdd preview', () => {
  it('previews an event with its time, points and tags', () => {
    const input = renderQuickAdd();
    fireEvent.change(input, { target: { value: 'PR review today 6pm 2h #lfx !2' } });
    const preview = screen.getByRole('status');
    expect(preview).toHaveTextContent('Event ·');
    expect(preview).toHaveTextContent('18:00–20:00');
    expect(preview).toHaveTextContent('2 points');
    expect(preview).toHaveTextContent('“PR review” #lfx');
  });

  it('locks the points buttons when the text sets points', () => {
    const input = renderQuickAdd();
    fireEvent.change(input, { target: { value: 'Gym today 7pm !3' } });
    const three = screen.getByRole('radio', { name: '3 points' });
    expect(three).toHaveAttribute('aria-checked', 'true');
    expect(three).toBeDisabled();
  });

  it('previews a task on the day being viewed when the text names no day', () => {
    const input = renderQuickAdd();
    fireEvent.change(input, { target: { value: 'Call bank' } });
    expect(screen.getByRole('status')).toHaveTextContent(
      /Task · Saturday, (24 October|October 24)/,
    );
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
  });

  it('an event named like a habit schedules the habit at its points', () => {
    const input = renderQuickAdd();
    fireEvent.change(input, { target: { value: 'workout today 7pm' } });
    expect(screen.getByRole('status')).toHaveTextContent('Schedules your habit “Workout”');
    expect(screen.getByRole('status')).toHaveTextContent('2 points');
  });

  it('schedule only needs a time and carries no points', () => {
    const input = renderQuickAdd();
    fireEvent.click(screen.getByRole('radio', { name: /Schedule only/ }));
    fireEvent.change(input, { target: { value: 'Dinner' } });
    expect(screen.getByRole('status')).toHaveTextContent('Schedule only needs a time');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Dinner today 8pm' } });
    expect(screen.getByRole('status')).toHaveTextContent('Schedule only');
    expect(screen.getByRole('status')).toHaveTextContent('no points');
    expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
  });

  it('suggests tags while a #word is typed, deadline tags first, and fills the pick', () => {
    const input = renderQuickAdd();
    fireEvent.change(input, { target: { value: 'PR review #g', selectionStart: 12 } });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['#gsoc', '#gym']);
    fireEvent.change(input, { target: { value: 'PR review #', selectionStart: 11 } });
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('#lfx5 PRs raised');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveValue('PR review #lfx ');
  });

  it('offers deadline tags as chips once there is text', () => {
    const input = renderQuickAdd();
    fireEvent.change(input, { target: { value: 'PR review' } });
    const chip = screen.getByRole('button', { name: /#lfx/ });
    expect(chip).toHaveTextContent('#lfx · 5 PRs raised');
    fireEvent.click(chip);
    expect(input).toHaveValue('PR review #lfx ');
  });

  it('shows nothing and cannot submit while empty', () => {
    renderQuickAdd();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });
});
