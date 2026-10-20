import { DEFAULT_DAY_BOUNDARY_HOUR } from '@mjolnir/domain';
import { Placeholder } from '../../components/Placeholder.tsx';
import { isSupabaseConfigured } from '../../lib/supabase.ts';

export function TodayPage() {
  return (
    <Placeholder title="Today" phase={3}>
      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-border bg-surface p-3">
          <dt className="text-muted">Day boundary</dt>
          <dd className="mt-1 font-medium">
            {String(DEFAULT_DAY_BOUNDARY_HOUR).padStart(2, '0')}:00
          </dd>
        </div>
        <div className="rounded-lg border border-border bg-surface p-3">
          <dt className="text-muted">Supabase</dt>
          <dd className="mt-1 font-medium">
            {isSupabaseConfigured ? 'Configured' : 'Not configured'}
          </dd>
        </div>
      </dl>
    </Placeholder>
  );
}
