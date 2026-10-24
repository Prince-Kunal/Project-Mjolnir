import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { createUser, signIn, type TestUser } from './stack.ts';

let user: TestUser;

test.beforeEach(async () => {
  user = await createUser();
});

test.afterEach(async () => {
  await user?.remove();
});

test('the JSON export downloads everything the user owns', async ({ browser }) => {
  const today = ((await user.rpc('day_view')) as { today: string }).today;
  await user.rpc('create_manual_task', {
    p_title: 'Export me',
    p_points: 1,
    p_date: today,
    p_tags: ['lfx'],
  });
  const context = await browser.newContext();
  await signIn(context, user);
  const page = await context.newPage();
  await page.goto('/more');

  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download everything (JSON)' }).click(),
  ]);
  expect(file.suggestedFilename()).toMatch(/^mjolnir-\d{4}-\d{2}-\d{2}\.json$/);
  const data = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(data.format).toBe('mjolnir-export');
  expect(data.items.map((i: { title: string; tags: string[] }) => [i.title, i.tags])).toEqual([
    ['Export me', ['lfx']],
  ]);
  await context.close();
});
