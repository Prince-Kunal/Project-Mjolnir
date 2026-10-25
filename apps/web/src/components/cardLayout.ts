import { createContext } from 'react';

/** Where cards sit: stacked in a column, or as settings rows (label column beside the panel). */
export const CardLayout = createContext<'stack' | 'settings'>('stack');
