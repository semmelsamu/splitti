// The live camera path of the scan screen, with Chromium's built-in fake camera.

import { expect, test } from '@playwright/test';
import { createGroup } from './helpers/api';
import { openGroupAs, SCAN_TIMEOUT } from './helpers/ui';

test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
  permissions: ['camera'],
});

test('mit Kamerabild nimmt der Auslöser das Foto direkt auf', async ({ page, request }) => {
  const { token } = await createGroup(request, 'WG', ['Samu', 'Karl']);
  await openGroupAs(page, token, 'Samu');
  await page.getByRole('button', { name: 'Zettel scannen' }).click();

  // The live picture runs and the frame tells how to hold the receipt.
  await expect(page.getByText('Zettel in den Rahmen')).toBeVisible();
  await expect(page.getByText('oben')).toBeVisible();
  await expect(page.getByText('unten')).toBeVisible();
  await expect
    .poll(() => page.locator('video').evaluate((video: HTMLVideoElement) => video.videoWidth))
    .toBeGreaterThan(0);

  // No file chooser opens: the photo comes from the camera stream.
  let chooserOpened = false;
  page.on('filechooser', () => {
    chooserOpened = true;
  });
  await page.getByRole('button', { name: 'Foto aufnehmen' }).click();

  // The fake camera shows a test pattern without text, so nothing is recognised
  // and the empty receipt opens with the photo that was taken.
  await expect(page.getByRole('heading', { name: 'Beleg aufteilen' })).toBeVisible({
    timeout: SCAN_TIMEOUT,
  });
  expect(chooserOpened).toBe(false);
  await expect(page.getByRole('button', { name: 'Zettelbild ansehen' })).toBeVisible();

  // Leaving the scan screen switched the camera off.
  const live = await page.evaluate(() => document.querySelectorAll('video').length);
  expect(live).toBe(0);
});
