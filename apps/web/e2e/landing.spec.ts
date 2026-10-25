import { expect, test } from '@playwright/test';

test('a signed-out visitor lands on the welcome page and can forge the sample day', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/welcome$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your day, forgedinto a score');

  // The sample day starts at 4 of 13 points (Gym and DSA practice are done).
  await expect(page.getByRole('img', { name: 'Success rate 30.8%, Not good' })).toBeVisible();
  for (const block of ['LFX PR review', 'GSoC proposal draft', 'Operating systems lecture']) {
    await page.getByRole('checkbox', { name: `Tick ${block}` }).click();
  }
  // 11 of 13 is 84.6%: Good, one point short of Excellent. The last block makes 100%.
  await expect(page.getByRole('img', { name: 'Success rate 84.6%, Good' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Tick Freelance invoice fixes' }).click();
  await expect(page.getByRole('img', { name: 'Success rate 100%, Excellent' })).toBeVisible();

  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('Score frozen')).toBeVisible();
  await expect(page.getByText('Every block struck. Nothing waits in the inbox.')).toBeVisible();
});
