import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScoreRing } from './ScoreRing.tsx';

describe('ScoreRing', () => {
  it('announces the rate and band', () => {
    render(<ScoreRing rate={71.4} band="fair" />);
    expect(screen.getByRole('img', { name: 'Success rate 71.4%, Fair' })).toBeInTheDocument();
    expect(screen.getByText('71%')).toBeInTheDocument();
  });

  it('fills the ring in proportion to the rate, capped at 100%', () => {
    const { container, rerender } = render(<ScoreRing rate={50} band="fair" />);
    const arc = () => container.querySelectorAll('circle')[1]!.getAttribute('stroke-dasharray')!;
    const circumference = 2 * Math.PI * 34;
    expect(Number(arc().split(' ')[0])).toBeCloseTo(circumference / 2);
    rerender(<ScoreRing rate={100} band="excellent" />);
    expect(Number(arc().split(' ')[0])).toBeCloseTo(circumference);
  });

  it('colours by band', () => {
    const { container } = render(<ScoreRing rate={90} band="excellent" />);
    expect(container.querySelectorAll('circle')[1]).toHaveAttribute(
      'stroke',
      'var(--color-band-excellent)',
    );
  });
});
