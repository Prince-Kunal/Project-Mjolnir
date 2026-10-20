import type { Band } from '@mjolnir/domain';

export const BAND_LABEL: Record<Band, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  not_good: 'Not good',
};

export const BAND_COLOR: Record<Band, string> = {
  excellent: 'var(--color-band-excellent)',
  good: 'var(--color-band-good)',
  fair: 'var(--color-band-fair)',
  not_good: 'var(--color-band-not-good)',
};
