import { type ButtonHTMLAttributes, type ReactNode, useContext } from 'react';
import { CardLayout } from './cardLayout.ts';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

// One shape for every control: the full pill. Primary is the inverted bone pill, one per screen.
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-bone active:scale-[0.97]',
  secondary: 'bg-surface-2 text-text hover:bg-active active:scale-[0.97]',
  ghost: 'text-muted hover:text-text hover:bg-surface-2/70',
  danger: 'text-band-not-good hover:bg-band-not-good/10',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-full px-4 text-[15px] font-medium transition duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

/** A panel: one lightness step above the ground, no border, no shadow. */
export function Card({
  title,
  description,
  action,
  children,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  const layout = useContext(CardLayout);
  if (layout === 'settings' && title) {
    // Settings in two columns (the taste sheet): the title and what it does, beside the panel.
    return (
      <section className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-10">
        <div className="lg:pt-5">
          <div className="flex items-start justify-between gap-4">
            <h2 className="text-[21px] leading-snug">{title}</h2>
            <span className="lg:hidden">{action}</span>
          </div>
          {description && <p className="mt-1.5 text-[15px] text-muted">{description}</p>}
          {action && <div className="mt-4 hidden lg:block">{action}</div>}
        </div>
        <div className="min-w-0 rounded-[var(--radius-card)] bg-surface p-5 md:p-6">{children}</div>
      </section>
    );
  }
  return (
    <section className="rounded-[var(--radius-card)] bg-surface p-5 md:p-6">
      {(title || action) && (
        <div className="flex items-start justify-between gap-4">
          {title && <h2 className="text-[19px] leading-snug">{title}</h2>}
          {action}
        </div>
      )}
      {description && <p className="mt-1 text-[15px] text-muted">{description}</p>}
      <div className={title || description ? 'mt-5' : ''}>{children}</div>
    </section>
  );
}

export function Notice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'error';
  children: ReactNode;
}) {
  const styles = tone === 'error' ? 'bg-[#2c1a17] text-[#f3a497]' : 'bg-surface-2 text-text';
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-[var(--radius-inner)] px-4 py-2.5 text-[15px] ${styles}`}
    >
      {children}
    </div>
  );
}

/** Loading keeps its place: a quiet line at body size, no spinner. */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return <p className="py-2 text-[15px] text-faint">{label}</p>;
}

/** A small segmented control: as wide as its options. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange(v: T): void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-surface-2 p-1">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`h-8 rounded-full px-3.5 text-[14px] transition ${value === v ? 'bg-text font-medium text-bg' : 'text-muted hover:text-text'}`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}
