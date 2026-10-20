import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button, Loading } from '../../components/ui.tsx';
import { signOut, useAuth } from '../../lib/auth.ts';
import { useProfile } from '../../lib/queries.ts';

function FullPageLoading() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <Loading />
    </div>
  );
}

export function RequireAuth() {
  const { session, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <FullPageLoading />;
  if (!session) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Sends users who have not finished onboarding there first. */
export function RequireOnboarded() {
  const { data: profile, isLoading, error } = useProfile();
  if (isLoading) return <FullPageLoading />;
  if (error || !profile) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-muted">
          Could not load your profile. Refresh, or sign in again.
        </p>
        <Button variant="secondary" onClick={() => void signOut()}>
          Sign out
        </Button>
      </div>
    );
  }
  if (!profile.onboarded_at) return <Navigate to="/onboarding" replace />;
  return <Outlet />;
}
