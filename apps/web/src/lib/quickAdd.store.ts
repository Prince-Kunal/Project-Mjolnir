import { create } from 'zustand';

/** The quick add dialog, opened from the top bar, ⌘K / Ctrl+K, or a page. */
export const useQuickAdd = create<{ open: boolean; setOpen(open: boolean): void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
