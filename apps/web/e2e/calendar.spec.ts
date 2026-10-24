import { expect, test } from '@playwright/test';
import { createUser, signIn, sql, type TestUser } from './stack.ts';

let user: TestUser;
let today: string;

test.beforeEach(async () => {
  user = await createUser();
  today = ((await user.rpc('day_view')) as { today: string }).today;
});

test.afterEach(async () => {
  await user?.remove();
});

test('the calendar shows the day like Google Calendar and opens blocks and new events', async ({
  browser,
}) => {
  const at = (hhmm: string) =>
    sql(`select ('${today} ${hhmm}'::timestamp at time zone 'Asia/Kolkata')`);
  await user.insertAsService('items', [
    {
      source: 'calendar',
      title: 'Deep work',
      points: 3,
      status: 'pending',
      logical_date: today,
      start_at: at('09:00'),
      end_at: at('11:00'),
      color_key: '11',
      google_event_id: 'e1',
      google_active: true,
    },
    {
      source: 'calendar',
      title: 'Dinner',
      points: 0,
      status: 'ignored',
      logical_date: today,
      start_at: at('20:30'),
      end_at: at('21:30'),
      color_key: '4',
      google_event_id: 'e2',
      google_active: true,
    },
  ]);

  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await signIn(context, user);
  const page = await context.newPage();
  await page.goto(`/calendar?view=day&date=${today}`);

  // 0-point blocks are shown here, unlike the Today checklist.
  await expect(page.getByRole('button', { name: /Dinner/ })).toBeVisible();
  const deep = page.getByRole('button', { name: /Deep work/ });
  await deep.scrollIntoViewIfNeeded();
  await expect(deep).toHaveCSS('background-color', 'rgb(213, 0, 0)'); // Tomato

  await deep.click();
  await expect(page.getByRole('dialog', { name: 'Deep work' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Drag 15:00 to 16:30 on the empty grid.
  const column = page.locator('.cursor-cell').first();
  await page.evaluate(() => document.querySelector('.overflow-y-auto')?.scrollTo({ top: 14 * 48 }));
  const box = (await column.boundingBox())!;
  const y = (minutes: number) => box.y + (minutes / 60) * 48;
  await page.mouse.move(box.x + 40, y(15 * 60 + 2));
  await page.mouse.down();
  await page.mouse.move(box.x + 40, y(16.5 * 60), { steps: 5 });
  await page.mouse.up();
  const dialog = page.getByRole('dialog', { name: 'New event' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Start')).toHaveValue('15:00');
  await expect(dialog.getByLabel('End')).toHaveValue('16:30');
  await context.close();
});
