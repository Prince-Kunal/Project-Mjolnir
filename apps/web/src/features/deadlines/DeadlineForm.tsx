import { addDays } from '@mjolnir/domain';
import { useState } from 'react';
import { Sheet } from '../../components/Sheet.tsx';
import { Button, Notice } from '../../components/ui.tsx';
import { type Deadline, parseTagNames, TAG_NAME, useSaveDeadline } from '../../lib/deadlines.ts';
import { useAreas } from '../../lib/queries.ts';

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Editing this deadline; a new one when absent. */
  deadline?: Deadline;
  today: string;
  onSaved?(id: string): void;
}

const input = 'w-full rounded-lg border border-border bg-surface-2 px-3 py-2';

export function DeadlineForm({ open, onOpenChange, deadline, today, onSaved }: Props) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={deadline ? 'Edit deadline' : 'New deadline'}
      description="Events and tasks with these tags count toward it, from the start date on."
    >
      {open && (
        <Form
          deadline={deadline}
          today={today}
          onDone={(id) => {
            onOpenChange(false);
            if (id) onSaved?.(id);
          }}
        />
      )}
    </Sheet>
  );
}

function Form({
  deadline,
  today,
  onDone,
}: {
  deadline?: Deadline;
  today: string;
  onDone(id?: string): void;
}) {
  const save = useSaveDeadline();
  const { data: areas } = useAreas();
  const [f, setF] = useState({
    title: deadline?.title ?? '',
    due_date: deadline?.due_date ?? addDays(today, 14),
    start_date: deadline?.start_date ?? today,
    tags: deadline?.tags.map((t) => t.name).join(' ') ?? '',
    area_id: deadline?.area_id ?? '',
    target_sessions: deadline?.target_sessions?.toString() ?? '',
    target_hours: deadline?.target_minutes ? String(deadline.target_minutes / 60) : '',
    notes: deadline?.notes ?? '',
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });

  const tags = parseTagNames(f.tags);
  const badTag = tags.find((t) => !TAG_NAME.test(t));
  const sessions = f.target_sessions ? Math.round(Number(f.target_sessions)) : null;
  const minutes = f.target_hours ? Math.round(Number(f.target_hours) * 60) : null;
  const problem = !f.title.trim()
    ? 'Give it a title.'
    : !f.due_date
      ? 'Pick a due date.'
      : f.start_date && f.start_date > f.due_date
        ? 'The start date must be on or before the due date.'
        : badTag
          ? `“${badTag}” is not a tag: use up to 32 letters, digits, - or _.`
          : (sessions !== null && !(sessions > 0)) || (minutes !== null && !(minutes > 0))
            ? 'Targets must be above zero.'
            : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (problem) return;
    save.mutate(
      {
        id: deadline?.id,
        title: f.title.trim(),
        due_date: f.due_date,
        start_date: f.start_date || null,
        area_id: f.area_id || null,
        target_sessions: sessions,
        target_minutes: minutes,
        notes: f.notes,
        tags,
      },
      { onSuccess: (id) => onDone(id) },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 text-sm">
      <label className="block">
        <span className="mb-1.5 block font-medium">Title</span>
        <input
          value={f.title}
          onChange={set('title')}
          placeholder="5 PRs raised"
          autoFocus
          className={input}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block font-medium">Starts</span>
          <input type="date" value={f.start_date} onChange={set('start_date')} className={input} />
        </label>
        <label className="block">
          <span className="mb-1.5 block font-medium">Due</span>
          <input type="date" value={f.due_date} onChange={set('due_date')} className={input} />
        </label>
      </div>
      <div>
        <label className="block">
          <span className="mb-1.5 block font-medium">Tags</span>
          <input
            value={f.tags}
            onChange={set('tags')}
            placeholder="lfx gsoc"
            aria-describedby="deadline-tags-help"
            className={input}
          />
        </label>
        <p id="deadline-tags-help" className="mt-1 text-xs text-muted">
          Blocks titled with #lfx count toward it. New tags are created.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block font-medium">Target sessions</span>
          <input
            type="number"
            min={1}
            value={f.target_sessions}
            onChange={set('target_sessions')}
            placeholder="Optional"
            className={input}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block font-medium">Target hours</span>
          <input
            type="number"
            min={0.25}
            step={0.25}
            value={f.target_hours}
            onChange={set('target_hours')}
            placeholder="Optional"
            className={input}
          />
        </label>
      </div>
      <label className="block">
        <span className="mb-1.5 block font-medium">Area</span>
        <select value={f.area_id} onChange={set('area_id')} className={input}>
          <option value="">No area</option>
          {areas?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1.5 block font-medium">Notes</span>
        <textarea value={f.notes} onChange={set('notes')} rows={3} className={input} />
      </label>
      {(save.error || (problem && f.title)) && (
        <Notice tone="error">{save.error?.message ?? problem}</Notice>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button type="submit" disabled={save.isPending || Boolean(problem)}>
          {deadline ? 'Save' : 'Add deadline'}
        </Button>
      </div>
    </form>
  );
}
