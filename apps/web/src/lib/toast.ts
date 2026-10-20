import { create } from 'zustand';

interface ToastState {
  message: string | null;
  action: { label: string; run: () => void } | null;
  id: number;
  show(message: string, action?: { label: string; run: () => void }): void;
  hide(): void;
}

export const useToast = create<ToastState>((set) => ({
  message: null,
  action: null,
  id: 0,
  show: (message, action) => set((s) => ({ message, action: action ?? null, id: s.id + 1 })),
  hide: () => set({ message: null, action: null }),
}));
