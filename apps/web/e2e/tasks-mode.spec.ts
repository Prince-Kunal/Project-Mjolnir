import { expect, test } from '@playwright/test';
import { createUser, signIn, sql, type TestUser } from './stack.ts';

let user: TestUser;

test.beforeEach(async () => {
  user = await createUser();
});

test.afterEach(async () => {
  await user?.remove();
});

test('in Tasks mode, today’s Google tasks are items and ticking one completes it in Google', async ({
  browser,
}) => {
  const today = ((await user.rpc('day_view')) as { today: string }).today;
  sql(`update public.profiles set google_item_type = 'tasks' where id = '${user.id}'`);
  const list = sql(
    `insert into public.task_lists (user_id, google_tasklist_id, title, sync_enabled, points)
     values ('${user.id}', 'list-1', 'My Tasks', true, 2) returning id`.replace(/\s+/g, ' '),
  ).split('\n')[0];
  await user.insertAsService('items', [
    {
      source: 'gtask',
      title: 'Submit form',
      raw_title: 'Submit form',
      points: 2,
      status: 'pending',
      logical_date: today,
      task_list_id: list,
      google_task_id: 'task-1',
      google_active: true,
    },
  ]);

  const context = await browser.newContext();
  await signIn(context, user);
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByText('0 of 2 points')).toBeVisible();
  await page.getByRole('checkbox', { name: 'Tick Submit form' }).click();
  await expect(page.getByRole('checkbox', { name: 'Untick Submit form' })).toBeVisible();

  // The worker sends this to the Tasks API (runTaskStatus): status completed.
  await expect
    .poll(() =>
      sql(
        `select count(*) from pgmq.q_google_writes where message ->> 'kind' = 'task_status' and message ->> 'item_id' in (select id::text from public.items where user_id = '${user.id}')`,
      ),
    )
    .toBe('1');

  await page.goto('/more');
  await expect(page.getByRole('heading', { name: 'Google Tasks' })).toBeVisible();
  await context.close();
});
