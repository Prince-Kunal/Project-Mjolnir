export interface NavEntry {
  to: string;
  label: string;
}

// Section 11: phone tab bar and laptop sidebar share these entries.
export const NAV: NavEntry[] = [
  { to: '/', label: 'Today' },
  { to: '/week', label: 'Week' },
  { to: '/deadlines', label: 'Deadlines' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/more', label: 'More' },
];
