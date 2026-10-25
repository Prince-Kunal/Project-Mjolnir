import type { SVGProps } from 'react';

/**
 * The mark: a Viking-age hammer amulet (the Erikstorp and Swedish History Museum pendants), with its
 * suspension loop, tapering shaft and flared head. The two small cut-outs are the eyes on the
 * Erikstorp amulet's collar.
 */
export function HammerMark({ title, ...props }: SVGProps<SVGSVGElement> & { title?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      {...props}
    >
      {title && <title>{title}</title>}
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M16 1.2a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8Zm0 1.9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z
           M13.7 7.6h4.6l.7 10.3h-6Z
           M14.7 10.4a.85.85 0 1 0 0 1.7.85.85 0 0 0 0-1.7Zm2.6 0a.85.85 0 1 0 0 1.7.85.85 0 0 0 0-1.7Z
           M5.6 17.4c6.9-.9 13.9-.9 20.8 0l2.6 11.3c-8.4-2.6-17.6-2.6-26 0Z"
      />
    </svg>
  );
}

/** The wordmark: the hammer and the name, set in the display face. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <HammerMark className="size-[1.15em] shrink-0" />
      <span className="font-display tracking-[-0.01em]">Mjölnir</span>
    </span>
  );
}

/** A lightning bolt drawn as one stroke, for strikes and storms. */
export function Bolt(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 60 120" fill="none" aria-hidden {...props}>
      <path
        pathLength={1}
        d="M36 2 L18 56 L32 56 L14 118 L46 44 L31 44 L44 2"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Elder Futhark, for the runic touches: ᛗᛃᛟᛚᚾᛁᚱ is "Mjolnir". */
export const RUNES = 'ᛗᛃᛟᛚᚾᛁᚱ';
