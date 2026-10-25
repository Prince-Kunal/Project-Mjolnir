export interface NavEntry {
  to: string;
  label: string;
  /** Shown in the phone tab bar (five at most). */
  phone: boolean;
}

// Section 11. The top bar carries every entry; the phone tab bar carries the five used daily, and
// Analytics is reached from Week and More there.
export const NAV: NavEntry[] = [
  { to: '/', label: 'Today', phone: true },
  { to: '/calendar', label: 'Calendar', phone: true },
  { to: '/week', label: 'Week', phone: true },
  { to: '/deadlines', label: 'Deadlines', phone: true },
  { to: '/analytics', label: 'Analytics', phone: false },
  { to: '/more', label: 'More', phone: true },
];
