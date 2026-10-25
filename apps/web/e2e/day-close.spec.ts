import { expect, test } from '@playwright/test';
import { createUser, signIn, sql, type TestUser } from './stack.ts';

let user: TestUser;
let today: string;
let yesterday: string;
let tomorrow: string;

test.beforeEach(async () => {
  user = await createUser();
  // Tracked since two days ago, so yesterday is a day that closes.
  sql(
    `update public.profiles set onboarded_at = now() - interval '2 days' where id = '${user.id}'`,
  );
  today = ((await user.rpc('day_view')) as { today: string }).today;
  yesterday = sql(`select '${today}'::date - 1`);
  tomorrow = sql(`select '${today}'::date + 1`);
});

test.afterEach(async () => {
  await user?.remove();
});

test('yesterday stays open until noon, so a late tick still counts', async ({ browser }) => {
  // A fixed-offset zone where it is now morning, so yesterday has not reached its noon freeze.
  const morning = sql(
    `select name from pg_timezone_names where name like 'Etc/GMT%' and extract(hour from now() at time zone name) between 5 and 10 order by name limit 1`,
  );
  sql(`update public.profiles set timezone = '${morning}' where id = '${user.id}'`);
  today = ((await user.rpc('day_view')) as { today: string }).today;
  yesterday = sql(`select '${today}'::date - 1`);
  await user.rpc('create_manual_task', { p_title: 'Late session', p_points: 2, p_date: yesterday });
  sql(`select private.schedule_due_jobs()`);

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await signIn(context, user);
  const page = await context.newPage();
  await page.goto('/');

  await page.getByRole('button', { name: /Yesterday is open until 12:00/ }).click();
  await expect(page.getByText('Open until 12:00 today · tick what you finished')).toBeVisible();
  const box = page.getByRole('checkbox', { name: 'Tick Late session' });
  await box.click();
  await expect(box).toHaveAttribute('aria-checked', 'true');

  sql(`select private.schedule_due_jobs(private.freeze_at('${user.id}', '${yesterday}'))`);
  expect(
    sql(
      `select done_points || '/' || planned_points from public.day_summaries where user_id = '${user.id}' and logical_date = '${yesterday}'`,
    ),
  ).toBe('2/2');
  await context.close();
});

test('a rescheduled task is missed on its original day and pending on the new day', async ({
  browser,
}) => {
  await user.rpc('create_manual_task', { p_title: 'File taxes', p_points: 2, p_date: yesterday });
  await user.rpc('create_manual_task', { p_title: 'Stretch', p_points: 1, p_date: yesterday });
  sql(`select private.close_day('${user.id}', '${yesterday}')`);

  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await signIn(context, user);
  const page = await context.newPage();
  await page.goto('/');

  await page.getByRole('link', { name: /You missed 2 tasks/ }).click();
  await expect(page).toHaveURL(/\/missed$/);
  const row = page.getByRole('listitem').filter({ hasText: 'File taxes' });
  await row.getByRole('button', { name: 'Reschedule' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Tomorrow' }).click();
  await expect(page.getByRole('listitem').filter({ hasText: 'File taxes' })).toHaveCount(0);

  await page.goto(`/?date=${yesterday}`);
  const original = page.getByRole('listitem').filter({ hasText: 'File taxes' });
  await expect(original.getByText('Missed')).toBeVisible();
  await expect(original.getByRole('checkbox')).toBeDisabled();
  await expect(page.getByText('Day closed · score frozen')).toBeVisible();

  await page.goto(`/?date=${tomorrow}`);
  const next = page.getByRole('checkbox', { name: 'Tick File taxes' });
  await expect(next).toBeEnabled();
  await expect(next).toHaveAttribute('aria-checked', 'false');
  await context.close();
});

test('the week table fills itself from closed days with no input', async ({ browser }) => {
  await user.rpc('create_manual_task', { p_title: 'Done thing', p_points: 3, p_date: yesterday });
  await user.rpc('create_manual_task', { p_title: 'Missed thing', p_points: 1, p_date: yesterday });
  const done = sql(
    `select id from public.items where user_id = '${user.id}' and title = 'Done thing'`,
  );
  await user.rpc('complete_item', { p_id: done });
  sql(`select private.close_day('${user.id}', '${yesterday}')`);
  await user.rpc('create_manual_task', { p_title: 'Today thing', p_points: 1, p_date: today });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await signIn(context, user);
  const page = await context.newPage();
  await page.goto(
    `/week?week=${sql(`select '${yesterday}'::date - (extract(isodow from '${yesterday}'::date)::int - 1)`)}`,
  );

  // Yesterday closed at 3 of 4 points: 75%, Good, and it counts toward the streak.
  const closed = page.getByRole('row').filter({ hasText: '3 / 4' });
  await expect(closed).toContainText('75%');
  await expect(closed).toContainText('Good');
  await expect(closed).toContainText('Counted · 1');
  await context.close();
});
