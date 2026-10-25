import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { R, ScoreRing } from './ScoreRing.tsx';

const circumference = 2 * Math.PI * R;
const arc = (container: HTMLElement) =>
  Number(container.querySelectorAll('circle')[1]!.getAttribute('stroke-dasharray')!.split(' ')[0]);

describe('ScoreRing (the forge ring)', () => {
  it('announces the rate and band', () => {
    render(<ScoreRing rate={71.4} band="fair" />);
    expect(screen.getByRole('img', { name: 'Success rate 71.4%, Fair' })).toBeInTheDocument();
    expect(screen.getByText('71%')).toBeInTheDocument();
  });

  it('fills the ring in proportion to the rate, capped at 100%', () => {
    const { container, rerender } = render(<ScoreRing rate={50} band="fair" />);
    expect(arc(container)).toBeCloseTo(circumference / 2);
    rerender(<ScoreRing rate={130} band="excellent" />);
    expect(arc(container)).toBeCloseTo(circumference);
  });

  it('colours by band', () => {
    const { container } = render(<ScoreRing rate={90} band="excellent" />);
    expect(container.querySelectorAll('circle')[1]).toHaveAttribute(
      'stroke',
      'var(--color-band-excellent)',
    );
  });

  it('notches the band edges and lights the ones reached', () => {
    const { container } = render(<ScoreRing rate={80} band="good" />);
    const lit = [...container.querySelectorAll('line')].map(
      (l) => l.getAttribute('stroke') === 'var(--color-text)',
    );
    expect(lit).toEqual([true, true, false]); // 50 and 75 reached, 85 not yet
  });
});
