import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuickAdd } from './QuickAdd.tsx';

vi.mock('../../lib/queries.ts', () => ({
  useProfile: () => ({ data: { timezone: 'Asia/Kolkata', day_boundary_hour: 4 } }),
}));

function renderQuickAdd() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <QuickAdd defaultDate="2026-10-24" />
    </QueryClientProvider>,
  );
  return screen.getByRole('textbox', { name: 'Quick add' });
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
    const three = screen.getByRole('radio', { name: '3' });
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

  it('shows nothing and cannot submit while empty', () => {
    renderQuickAdd();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });
});
