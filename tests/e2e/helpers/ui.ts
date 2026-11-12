import { expect, type Locator, type Page } from '@playwright/test';

/** Recognition takes a few seconds, more when several tests wait in the server's queue. */
export const SCAN_TIMEOUT = 90_000;

/** Opens the group on this device and picks who the device is. */
export async function openGroupAs(page: Page, token: string, name: string): Promise<void> {
  await page.goto(`/g/${token}`);
  await page.getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('region', { name: 'Salden' })).toBeVisible();
}

/** The row of a member in the balance list of the overview. */
export function balanceRow(page: Page, name: string): Locator {
  return page
    .getByRole('region', { name: 'Salden' })
    .locator('div')
    .filter({ has: page.getByText(name, { exact: true }) })
    .last();
}

/** The positions on the split screen, top to bottom. */
export function positions(page: Page): Locator {
  return page.getByRole('main').getByRole('listitem');
}

/** Taps member chips of one position; "alle" selects everyone. */
export async function assign(position: Locator, ...names: string[]): Promise<void> {
  for (const name of names) {
    await position.getByRole('button', { name, exact: true }).click();
  }
}

/** Uploads a photo through "Aus Galerie" and waits for the split screen. */
export async function scanFromGallery(page: Page, file: string): Promise<void> {
  await page.getByRole('button', { name: 'Zettel scannen' }).click();
  await expect(page.getByRole('heading', { name: 'Zettel scannen' })).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Aus Galerie' }).click();
  await (await chooser).setFiles(file);
  await expect(page.getByRole('heading', { name: 'Beleg aufteilen' })).toBeVisible({
    timeout: SCAN_TIMEOUT,
  });
}
