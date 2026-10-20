import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { appRoutes } from '../routes/router.tsx';
import { AppShell } from './AppShell.tsx';

function renderAt(path: string) {
  const router = createMemoryRouter([{ element: <AppShell />, children: appRoutes }], {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
}

describe('AppShell', () => {
  it('renders Today at the root with every nav entry', () => {
    renderAt('/');
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    const tabs = screen.getByRole('navigation', { name: 'Tabs' });
    for (const label of ['Today', 'Week', 'Deadlines', 'Analytics', 'More']) {
      expect(tabs).toHaveTextContent(label);
    }
  });

  it('routes to the week page', () => {
    renderAt('/week');
    expect(screen.getByRole('heading', { name: 'Week' })).toBeInTheDocument();
  });
});
