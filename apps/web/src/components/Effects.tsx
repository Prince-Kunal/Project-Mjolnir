import { useEffect } from 'react';
import { consoleGreeting, listenForKonami, useEffects } from '../lib/effects.ts';
import { Bolt } from './Mark.tsx';

let greeted = false;

/** The overlay that draws strikes, the storm's flash and Loki's fly. Never takes a click. */
export function Effects() {
  const { strikes, flash, fly } = useEffects();

  useEffect(() => {
    if (!greeted) {
      greeted = true;
      consoleGreeting();
    }
    return listenForKonami();
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
      {flash > 0 && <div key={`f${flash}`} className="mj-flash absolute inset-0 bg-[#dce9ff]" />}
      {strikes.map((s) => (
        <Bolt
          key={s.id}
          className="mj-bolt absolute h-[min(70vh,560px)] text-[#e6f1ff]"
          style={{ left: s.x - 40, top: s.y - Math.min(window.innerHeight * 0.7, 560) }}
        />
      ))}
      {fly > 0 && (
        <svg
          key={`fly${fly}`}
          viewBox="0 0 24 16"
          className="mj-fly absolute top-0 left-0 w-7 text-text"
        >
          <ellipse
            className="wing"
            cx="9"
            cy="5"
            rx="5"
            ry="3.4"
            fill="currentColor"
            opacity=".35"
          />
          <ellipse
            className="wing"
            cx="15"
            cy="5"
            rx="5"
            ry="3.4"
            fill="currentColor"
            opacity=".35"
          />
          <ellipse cx="12" cy="10" rx="3.2" ry="4.6" fill="currentColor" />
          <circle cx="12" cy="5.4" r="2.2" fill="currentColor" />
        </svg>
      )}
    </div>
  );
}
