import { expect, test } from '@playwright/test';

test('health endpoint answers', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: 'ok' });
});

test('unknown API paths answer with a JSON 404, not with the app shell', async ({ request }) => {
  const response = await request.get('/api/gibt-es-nicht');
  expect(response.status()).toBe(404);
  expect(response.headers()['content-type']).toContain('application/json');
});

test('the app shell loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Splitti' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
});
