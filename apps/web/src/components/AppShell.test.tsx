import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { routes } from '../routes/router.tsx';

function renderAt(path: string) {
  render(<RouterProvider router={createMemoryRouter(routes, { initialEntries: [path] })} />);
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
