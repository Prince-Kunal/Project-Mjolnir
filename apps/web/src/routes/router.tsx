import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '../components/AppShell.tsx';
import { TodayPage } from '../features/today/TodayPage.tsx';
import { WeekPage } from '../features/week/WeekPage.tsx';
import { DeadlinesPage } from '../features/deadlines/DeadlinesPage.tsx';
import { AnalyticsPage } from '../features/analytics/AnalyticsPage.tsx';
import { MorePage } from '../features/settings/MorePage.tsx';
import { NotFound } from './NotFound.tsx';

export const routes = [
  {
    element: <AppShell />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: 'week', element: <WeekPage /> },
      { path: 'deadlines', element: <DeadlinesPage /> },
      { path: 'analytics', element: <AnalyticsPage /> },
      { path: 'more', element: <MorePage /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
