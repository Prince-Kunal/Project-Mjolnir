import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { appRoutes } from '../routes/router.tsx';
import { AppShell } from './AppShell.tsx';

function renderAt(path: string) {
  const router = createMemoryRouter([{ element: <AppShell />, children: appRoutes }], {
    initialEntries: [path],
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('AppShell', () => {
  it('puts the five daily destinations in the phone tab bar', () => {
    renderAt('/');
    const tabs = screen.getByRole('navigation', { name: 'Tabs' });
    for (const label of ['Today', 'Calendar', 'Week', 'Deadlines', 'More']) {
      expect(tabs).toHaveTextContent(label);
    }
    expect(tabs).not.toHaveTextContent('Analytics');
  });

  it('carries every destination in the top bar', () => {
    renderAt('/');
    const main = screen.getByRole('navigation', { name: 'Main' });
    for (const label of ['Today', 'Calendar', 'Week', 'Deadlines', 'Analytics']) {
      expect(main).toHaveTextContent(label);
    }
  });

  it('routes to the week page', () => {
    renderAt('/week');
    expect(screen.getByRole('heading', { name: 'Week' })).toBeInTheDocument();
  });
});
