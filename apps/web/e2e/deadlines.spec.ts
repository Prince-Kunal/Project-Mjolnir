import { addDays } from '@mjolnir/domain';
import { expect, test } from '@playwright/test';
import { createUser, signIn, type TestUser } from './stack.ts';

let user: TestUser;
let today: string;

test.beforeEach(async () => {
  user = await createUser();
  today = ((await user.rpc('day_view')) as { today: string }).today;
});

test.afterEach(async () => {
  await user?.remove();
});

test('a tagged deadline counts #lfx work, warns, and takes a suggested session from the tray', async ({
  browser,
}) => {
  // Untagged, but it names the tag: once #lfx exists it is a suggestion (3.8).
  await user.insertAsService('items', [
    {
      source: 'manual',
      title: 'read lfx notes',
      raw_title: 'read lfx notes',
      points: 1,
      status: 'pending',
      logical_date: addDays(today, 1),
    },
  ]);
  const done = await user.rpc<{ id: string }>('create_manual_task', {
    p_title: 'PR review',
    p_points: 2,
    p_date: today,
    p_tags: ['lfx'],
    p_planned_minutes: 60,
  });
  await user.rpc('complete_item', { p_id: done.id });

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await signIn(context, user);
  const page = await context.newPage();
  await page.goto('/deadlines');

  await page.getByRole('button', { name: 'New deadline' }).click();
  const form = page.getByRole('dialog', { name: 'New deadline' });
  await form.getByLabel('Title', { exact: true }).fill('5 PRs raised');
  await form.getByLabel('Due', { exact: true }).fill(addDays(today, 5));
  await form.getByLabel('Tags', { exact: true }).fill('lfx');
  await form.getByLabel('Target sessions', { exact: true }).fill('5');
  await form.getByRole('button', { name: 'Add deadline' }).click();

  await expect(page.getByRole('heading', { name: '5 PRs raised' })).toBeVisible();
  await expect(page.getByText('1 / 5')).toBeVisible(); // sessions done of the target
  await expect(page.getByText('No sessions scheduled')).toBeVisible(); // due within 7 days
  await expect(page.getByRole('button', { name: /PR review/ })).toBeVisible();

  await page.getByRole('link', { name: '← Deadlines' }).click();
  await page.getByRole('link', { name: /Unassigned/ }).click();
  const row = page.getByRole('listitem').filter({ hasText: 'read lfx notes' });
  await expect(row.getByText('#lfx')).toBeVisible();
  await row.getByRole('button', { name: 'Link' }).click();
  await expect(page.getByText('Nothing to sort')).toBeVisible();

  await page.goto('/deadlines');
  const card = page.getByRole('listitem').filter({ hasText: '5 PRs raised' });
  await expect(card.getByText(/1 done of 5 · 1 upcoming/)).toBeVisible();
  await expect(card.getByText('No sessions scheduled')).toHaveCount(0);
  await expect(card.getByText('Needs more sessions')).toBeVisible();
  await context.close();
});
