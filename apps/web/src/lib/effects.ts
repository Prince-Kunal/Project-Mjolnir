// Easter eggs and celebrations, triggered from anywhere and drawn by <Effects /> in one overlay.
import { create } from 'zustand';

export interface Strike {
  id: number;
  /** Viewport position of the bolt's foot, in px. */
  x: number;
  y: number;
}

interface EffectsState {
  strikes: Strike[];
  flash: number;
  fly: number;
  strike(x?: number, y?: number): void;
  storm(): void;
  loki(): void;
}

let next = 1;
const reduced = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const useEffects = create<EffectsState>((set, get) => ({
  strikes: [],
  flash: 0,
  fly: 0,
  strike(x, y) {
    if (reduced()) return;
    const s: Strike = {
      id: next++,
      x: x ?? window.innerWidth * (0.2 + Math.random() * 0.6),
      y: y ?? window.innerHeight * (0.45 + Math.random() * 0.3),
    };
    set((st) => ({ strikes: [...st.strikes, s], flash: st.flash + 1 }));
    setTimeout(() => set((st) => ({ strikes: st.strikes.filter((k) => k.id !== s.id) })), 1200);
  },
  storm() {
    if (reduced()) return;
    [0, 380, 700, 1250, 1500].forEach((t) => setTimeout(() => get().strike(), t));
  },
  loki() {
    if (reduced()) return;
    set((st) => ({ fly: st.fly + 1 }));
  },
}));

const KONAMI = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
];

/** ↑ ↑ ↓ ↓ ← → ← → B A rolls a storm across the screen. */
export function listenForKonami(): () => void {
  let at = 0;
  const onKey = (e: KeyboardEvent) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    at = key === KONAMI[at] ? at + 1 : key === KONAMI[0] ? 1 : 0;
    if (at === KONAMI.length) {
      at = 0;
      useEffects.getState().storm();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}

/** A runic greeting for whoever opens the console. */
export function consoleGreeting() {
  if (typeof console === 'undefined') return;
  console.log(
    '%cᛗᛃᛟᛚᚾᛁᚱ%c\nForged by Eitri and Brokkr. Mind the fly.\nTry ↑ ↑ ↓ ↓ ← → ← → B A.',
    'font: 28px Georgia, serif; color: #e9e3d7;',
    'font: 13px Georgia, serif; color: #b4afa7;',
  );
}
