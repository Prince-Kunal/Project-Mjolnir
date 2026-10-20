import { type ColorRule, colorForPoints, defaultColorRules } from '@mjolnir/domain';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { ColorMap } from './ColorMap.tsx';

const changes: ColorRule[][] = [];

function Harness({ initial = defaultColorRules() }: { initial?: ColorRule[] }) {
  const [rules, setRules] = useState(initial);
  return (
    <ColorMap
      rules={rules}
      onChange={(next) => {
        changes.push(next);
        setRules(next);
      }}
    />
  );
}

function setPoints(colour: string, points: number) {
  const group = screen.getByRole('radiogroup', { name: `${colour} points` });
  fireEvent.click(within(group, String(points)));
}

function within(group: HTMLElement, label: string) {
  return Array.from(group.querySelectorAll('button')).find((b) => b.textContent === label)!;
}

describe('ColorMap', () => {
  it('shows all twelve colours with calendar default at 1 point', () => {
    render(<Harness />);
    expect(screen.getAllByRole('radiogroup')).toHaveLength(12);
    const group = screen.getByRole('radiogroup', { name: 'Calendar default points' });
    expect(within(group, '1')).toHaveAttribute('aria-checked', 'true');
  });

  it('asks for a primary colour only when two colours share a value', () => {
    render(<Harness />);
    setPoints('Tomato', 3);
    expect(screen.queryByLabelText('Use Tomato for new 3-point events')).toBeNull();

    setPoints('Grape', 3);
    expect(screen.getByLabelText('Use Tomato for new 3-point events')).toBeChecked();
    expect(screen.getByLabelText('Use Grape for new 3-point events')).not.toBeChecked();

    fireEvent.click(screen.getByLabelText('Use Grape for new 3-point events'));
    expect(colorForPoints(changes.at(-1)!, 3)).toBe('3');
  });
});
