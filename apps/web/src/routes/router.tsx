import { createBrowserRouter, type RouteObject } from 'react-router-dom';
import { AppShell } from '../components/AppShell.tsx';
import { GoogleConnectedPage } from '../features/auth/GoogleConnectedPage.tsx';
import { RequireAuth, RequireOnboarded } from '../features/auth/guards.tsx';
import { SignInPage } from '../features/auth/SignInPage.tsx';
import { AnalyticsPage } from '../features/analytics/AnalyticsPage.tsx';
import { CalendarPage } from '../features/calendar/CalendarPage.tsx';
import { DeadlineDetailPage } from '../features/deadlines/DeadlineDetailPage.tsx';
import { DeadlinesPage } from '../features/deadlines/DeadlinesPage.tsx';
import { UnassignedPage } from '../features/deadlines/UnassignedPage.tsx';
import { MissedPage } from '../features/missed/MissedPage.tsx';
import { OnboardingPage } from '../features/onboarding/OnboardingPage.tsx';
import { MorePage } from '../features/settings/MorePage.tsx';
import { TodayPage } from '../features/today/TodayPage.tsx';
import { WeekPage } from '../features/week/WeekPage.tsx';
import { NotFound } from './NotFound.tsx';

export const appRoutes: RouteObject[] = [
  { index: true, element: <TodayPage /> },
  { path: 'calendar', element: <CalendarPage /> },
  { path: 'week', element: <WeekPage /> },
  { path: 'missed', element: <MissedPage /> },
  { path: 'deadlines', element: <DeadlinesPage /> },
  { path: 'deadlines/:id', element: <DeadlineDetailPage /> },
  { path: 'unassigned', element: <UnassignedPage /> },
  { path: 'analytics', element: <AnalyticsPage /> },
  { path: 'more', element: <MorePage /> },
  { path: '*', element: <NotFound /> },
];

export const routes: RouteObject[] = [
  { path: '/sign-in', element: <SignInPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/google/connected', element: <GoogleConnectedPage /> },
      { path: '/onboarding/:step?', element: <OnboardingPage /> },
      {
        element: <RequireOnboarded />,
        children: [{ element: <AppShell />, children: appRoutes }],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
