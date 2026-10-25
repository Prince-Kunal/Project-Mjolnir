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

test('a tick in one browser shows in another within 2 seconds', async ({ browser }) => {
  await user.rpc('create_manual_task', { p_title: 'Write tests', p_points: 2, p_date: today });

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const laptop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await signIn(phone, user);
  await signIn(laptop, user);
  const onPhone = await phone.newPage();
  const onLaptop = await laptop.newPage();
  await onPhone.goto('/');
  await onLaptop.goto('/');

  const laptopBox = onLaptop.getByRole('checkbox', { name: /Write tests/ });
  await expect(laptopBox).toHaveAttribute('aria-checked', 'false');
  // Wait until the laptop's live connection is up before ticking on the phone.
  await expect(onLaptop.locator('html')).toHaveAttribute('data-realtime', 'subscribed');

  const started = Date.now();
  await onPhone.getByRole('checkbox', { name: 'Tick Write tests' }).click();
  await expect(laptopBox).toHaveAttribute('aria-checked', 'true', { timeout: 2000 });
  console.log(`tick reached the second browser in ${Date.now() - started} ms`);

  await phone.close();
  await laptop.close();
});

test('ticking needs no Edge Function', async ({ browser }) => {
  await user.rpc('create_manual_task', { p_title: 'Stretch', p_points: 1, p_date: today });
  const context = await browser.newContext();
  await signIn(context, user);
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('checkbox', { name: 'Tick Stretch' })).toBeVisible();

  const functionCalls: string[] = [];
  page.on('request', (r) => r.url().includes('/functions/v1/') && functionCalls.push(r.url()));
  await page.getByRole('checkbox', { name: 'Tick Stretch' }).click();
  await expect(page.getByRole('checkbox', { name: 'Untick Stretch' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await page.waitForTimeout(500);
  expect(functionCalls).toEqual([]);
  await context.close();
});

test('0-point events are hidden and the score matches a hand calculation', async ({ browser }) => {
  const at = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
  await user.insertAsService('items', [
    {
      source: 'calendar',
      title: 'Deep work',
      points: 3,
      status: 'done',
      logical_date: today,
      start_at: at(-3),
      end_at: at(-1),
    },
    {
      source: 'calendar',
      title: 'PR review',
      points: 2,
      status: 'pending',
      logical_date: today,
      start_at: at(1),
      end_at: at(2),
    },
    {
      source: 'calendar',
      title: 'Dinner',
      points: 0,
      status: 'ignored',
      logical_date: today,
      start_at: at(2),
      end_at: at(3),
    },
  ]);
  await user.rpc('create_manual_task', { p_title: 'Call bank', p_points: 1, p_date: today });

  const context = await browser.newContext();
  await signIn(context, user);
  const page = await context.newPage();
  await page.goto('/');

  await expect(page.getByText('PR review', { exact: true })).toBeVisible();
  await expect(page.getByText('Dinner')).toHaveCount(0);
  // 3 done of 3 + 2 + 1 = 6 planned → 50.0%, Fair.
  await expect(page.getByRole('img', { name: 'Success rate 50%, Fair' })).toBeVisible();
  await expect(page.getByText('of 6 points')).toBeVisible();

  await page.getByRole('checkbox', { name: 'Tick Call bank' }).click();
  // 4 of 6 → 66.7%.
  await expect(page.getByRole('img', { name: 'Success rate 66.7%, Fair' })).toBeVisible();
  await context.close();
});

test('a tick made offline is saved once the browser is back online', async ({ browser }) => {
  const task = await user.rpc<{ id: string }>('create_manual_task', {
    p_title: 'Read paper',
    p_points: 2,
    p_date: today,
  });
  const context = await browser.newContext();
  await signIn(context, user);
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('checkbox', { name: 'Tick Read paper' })).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('checkbox', { name: 'Tick Read paper' }).click();
  await expect(page.getByRole('checkbox', { name: 'Untick Read paper' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(
    page.getByRole('status').filter({ hasText: '1 tick saved on this device' }),
  ).toBeVisible();
  const status = async () =>
    (await user.rpc<{ items: { id: string; status: string }[] }>('day_view')).items.find(
      (i) => i.id === task.id,
    )?.status;
  expect(await status()).toBe('pending');

  await context.setOffline(false);
  await expect.poll(status, { timeout: 5000 }).toBe('done');
  await expect(page.getByText('1 tick saved on this device')).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Untick Read paper' })).toBeVisible();
  await context.close();
});
