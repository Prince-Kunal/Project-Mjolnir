import { Sheet } from '../../components/Sheet.tsx';
import { Loading } from '../../components/ui.tsx';
import { useBacklog, useUpdateItem } from '../../lib/day.ts';
import { PointDots } from './ItemRow.tsx';
import { QuickAddTask } from './QuickAddTask.tsx';

/** Manual tasks with no date (3.1): not scored until given a day. */
export function BacklogDrawer({
  open,
  onOpenChange,
  today,
}: {
  open: boolean;
  onOpenChange(o: boolean): void;
  today: string;
}) {
  const { data: items, isLoading } = useBacklog();
  const update = useUpdateItem();

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Backlog"
      description="Tasks without a day. They score once you give them one."
    >
      <QuickAddTask date={null} placeholder="Add to backlog…" />
      {isLoading ? (
        <div className="mt-4">
          <Loading />
        </div>
      ) : !items?.length ? (
        <p className="mt-4 text-sm text-muted">The backlog is empty.</p>
      ) : (
        <ul className="mt-3 divide-y divide-rule">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate">{i.title}</span>
              <PointDots points={i.points} />
              <button
                onClick={() => update.mutate({ id: i.id, patch: { logical_date: today } })}
                className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium hover:bg-active"
              >
                Do today
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
