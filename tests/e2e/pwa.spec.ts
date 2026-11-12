// Milestone 7: the app can be installed, starts without a connection, and
// fits a phone.

import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { createGroup } from './helpers/api';
import { assign, openGroupAs, positions, scanFromGallery } from './helpers/ui';

/** Width and height from the header of a PNG file. */
function pngSize(file: Buffer): { width: number; height: number } {
  expect(file.subarray(1, 4).toString('latin1')).toBe('PNG');
  return { width: file.readUInt32BE(16), height: file.readUInt32BE(20) };
}

/** Waits until the service worker is active and controls the page. */
async function serviceWorkerInCharge(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        });
      });
    }
  });
}

test.describe('Installierbarkeit', () => {
  test('das Manifest beschreibt eine installierbare App', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('/manifest.webmanifest');

    const response = await request.get(href as string);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/manifest+json');
    const manifest = await response.json();
    expect(manifest).toMatchObject({
      name: 'Splitti',
      short_name: 'Splitti',
      lang: 'de',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#1d4ed8',
      background_color: '#ffffff',
    });

    // What browsers ask of the icons: 192 and 512 pixels as PNG, and a maskable one.
    const sizes = manifest.icons.map(
      (icon: { sizes: string; purpose: string }) => `${icon.sizes} ${icon.purpose}`,
    );
    expect(sizes).toEqual(
      expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']),
    );
    for (const icon of manifest.icons) {
      const file = await request.get(icon.src);
      expect(file.status(), icon.src).toBe(200);
      expect(file.headers()['content-type']).toBe('image/png');
      const [width, height] = icon.sizes.split('x').map(Number);
      expect(pngSize(await file.body())).toEqual({ width, height });
    }
  });

  test('die Hülle bringt mit, was iOS und der Browser-Tab brauchen', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#1d4ed8');
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      'content',
      /width=device-width/,
    );
    await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
      'content',
      'yes',
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page).toHaveTitle('Splitti');

    const touchIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    const file = await request.get(touchIcon as string);
    expect(pngSize(await file.body())).toEqual({ width: 180, height: 180 });
    expect((await request.get('/favicon.svg')).status()).toBe(200);
  });

  test('der Service Worker übernimmt die Seite', async ({ page }) => {
    await page.goto('/');
    await serviceWorkerInCharge(page);
    const worker = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return {
        scope: registration.scope,
        script: registration.active?.scriptURL,
        state: registration.active?.state,
        controlled: navigator.serviceWorker.controller !== null,
      };
    });
    expect(new URL(worker.scope).pathname).toBe('/');
    expect(new URL(worker.script as string).pathname).toBe('/sw.js');
    expect(worker.state).toBe('activated');
    expect(worker.controlled).toBe(true);
  });

  test('Chromium meldet keine Hindernisse für die Installation', async ({ page }) => {
    await page.goto('/');
    await serviceWorkerInCharge(page);
    await page.reload();
    const session = await page.context().newCDPSession(page);
    const { installabilityErrors } = await session.send('Page.getInstallabilityErrors');
    // The test browser runs in a private profile, where nothing can be installed.
    // That is a property of the test browser, not of the app.
    const ofTheApp = installabilityErrors.filter((error) => error.errorId !== 'in-incognito');
    expect(ofTheApp).toEqual([]);
  });
});

test.describe('ohne Verbindung', () => {
  test('die App startet, zeigt die bekannten Gruppen und sagt, dass der Server fehlt', async ({
    page,
    context,
    request,
  }) => {
    const { token } = await createGroup(request, 'WG', ['Samu', 'Karl']);
    await openGroupAs(page, token, 'Samu');
    await page.goto('/');
    await expect(page.getByRole('button', { name: /WG/ })).toContainText('2 Mitglieder');
    await serviceWorkerInCharge(page);
    // Give the worker a moment to store what the page handed over.
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const names = await caches.keys();
          const cache = await caches.open(
            names.find((name) => name.startsWith('splitti-')) ?? 'none',
          );
          return (await cache.keys()).filter((entry) => entry.url.includes('/_astro/')).length;
        }),
      )
      .toBeGreaterThan(0);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Splitti' })).toBeVisible();
    await expect(page.getByRole('button', { name: /WG/ })).toContainText('Server nicht erreichbar');

    // Inside a group nothing is shown from memory; the app says what is wrong.
    await page.getByRole('button', { name: /WG/ }).click();
    await expect(page.getByRole('alert')).toContainText('Keine Verbindung zum Server');
    await expect(page.getByRole('button', { name: 'Erneut versuchen' })).toBeVisible();

    await context.setOffline(false);
    await page.getByRole('button', { name: 'Erneut versuchen' }).click();
    await expect(page.getByRole('region', { name: 'Salden' })).toBeVisible();
  });

  test('Daten kommen immer vom Server, nie aus dem Speicher des Geräts', async ({
    page,
    request,
  }) => {
    const { token } = await createGroup(request, 'Alter Name', ['Samu', 'Karl']);
    await openGroupAs(page, token, 'Samu');
    await serviceWorkerInCharge(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Alter Name' })).toBeVisible();

    await request.patch(`/api/groups/${token}`, { data: { name: 'Neuer Name' } });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Neuer Name' })).toBeVisible();

    const kept = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys()) {
        for (const entry of await (await caches.open(name)).keys())
          urls.push(new URL(entry.url).pathname);
      }
      return urls;
    });
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.filter((url) => url.startsWith('/api/'))).toEqual([]);
  });
});

test.describe('Bedienung im Handy-Format', () => {
  /** Nothing may be wider than the screen. */
  async function expectNoSidewaysScroll(page: Page, where: string): Promise<void> {
    const overflow = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(overflow, `${where}: seitliches Scrollen`).toBeLessThanOrEqual(0);
  }

  /** Buttons, links in lists, fields: at least 44 px tall, as on the wireframes. */
  async function expectTouchTargets(page: Page, where: string): Promise<void> {
    const small = await page.evaluate(() => {
      const found: string[] = [];
      const controls = document.querySelectorAll<HTMLElement>(
        'button, a[href], input:not([type="hidden"]):not([type="file"]), select',
      );
      for (const control of controls) {
        const box = control.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue; // not shown
        // A checkbox sits inside a label of full size; a link inside a sentence is text.
        if (control instanceof HTMLInputElement && control.type === 'checkbox') {
          const label = control.closest('label')?.getBoundingClientRect();
          if (label && label.height >= 44 && label.width >= 44) continue;
        }
        if (control instanceof HTMLAnchorElement && getComputedStyle(control).display === 'inline')
          continue;
        // The invisible backdrop button of a sheet covers the screen; skip nothing else.
        if (box.height < 44 || box.width < 44) {
          found.push(
            `${control.tagName.toLowerCase()} „${(control.getAttribute('aria-label') ?? control.textContent ?? '').trim().slice(0, 30)}“ ${Math.round(box.width)}×${Math.round(box.height)}`,
          );
        }
      }
      return found;
    });
    expect(small, `${where}: zu kleine Tippflächen`).toEqual([]);
  }

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 360, height: 640 },
  ]) {
    test(`alle Screens passen auf ${viewport.width} × ${viewport.height}`, async ({
      page,
      request,
    }) => {
      await page.setViewportSize(viewport);
      const check = async (where: string) => {
        await expectNoSidewaysScroll(page, where);
        await expectTouchTargets(page, where);
      };

      // Long names are what breaks layouts.
      const group = await createGroup(request, 'Wohngemeinschaft Sonnenallee 123', [
        'Maximiliane-Sophie',
        'Karl',
        'Rosi',
        'Christoph-Alexander',
        'Toni',
      ]);

      await page.goto('/');
      await check('Start');
      await page.getByRole('button', { name: 'Gruppe erstellen' }).click();
      await check('Gruppe erstellen');

      await page.goto(`/g/${group.token}`);
      await expect(page.getByRole('heading', { name: 'Wer bist du?' })).toBeVisible();
      await check('Wer bist du?');
      await page.getByRole('button', { name: 'Karl', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Salden' })).toBeVisible();
      await check('Gruppenübersicht');

      await page.getByRole('button', { name: 'Gruppeneinstellungen' }).click();
      await check('Gruppeneinstellungen');
      await page.getByRole('button', { name: 'Zurück' }).click();

      await page.getByRole('button', { name: 'Manuell', exact: true }).click();
      await check('Manueller Eintrag');
      await page.getByRole('button', { name: 'Zurück' }).click();

      await page.getByRole('button', { name: 'Zettel scannen' }).click();
      await check('Scan');
      await page.getByRole('button', { name: 'Zurück' }).click();

      await scanFromGallery(page, path.resolve('tests/fixtures/receipts/kaufland-a.png'));
      await check('Beleg aufteilen');
      await page.getByRole('button', { name: 'Mehrere' }).click();
      await check('Beleg aufteilen, mehrere markieren');
      await page.getByRole('button', { name: 'Fertig' }).click();
      await positions(page)
        .nth(0)
        .getByRole('button', { name: /^Position .* bearbeiten$/ })
        .click();
      await check('Position bearbeiten');
      await page.getByRole('dialog').getByRole('button', { name: 'Schließen' }).click();
      for (let index = 0; index < 6; index++) await assign(positions(page).nth(index), 'alle');
      await page.getByRole('button', { name: 'Speichern' }).click();
      await expect(page.getByRole('region', { name: 'Letzte Belege' })).toContainText('Kaufland');
      await check('Gruppenübersicht mit Beleg');

      await page
        .getByRole('region', { name: 'Letzte Belege' })
        .getByRole('button', { name: /Kaufland/ })
        .click();
      await expect(page.getByRole('region', { name: 'Anteile' })).toBeVisible();
      await check('Beleg-Detail');
      await page.getByRole('button', { name: 'Zurück' }).click();

      await page.getByRole('button', { name: 'Begleichen' }).click();
      await expect(page.getByRole('article').first()).toBeVisible();
      await check('Begleichen');
      await page.getByRole('button', { name: 'Andere Zahlung eintragen' }).click();
      await check('Zahlung eintragen');
      await page.getByRole('dialog').getByRole('button', { name: 'Schließen' }).click();
      await page.getByRole('button', { name: 'Zurück' }).click();

      await page.getByRole('button', { name: 'Alle Belege und Änderungsverlauf' }).click();
      await expect(page.getByRole('region', { name: 'Änderungsverlauf' })).toBeVisible();
      await check('Belege und Verlauf');
    });
  }

  test('Titel, Hauptinhalt und die Aktion am unteren Rand bleiben beim Scrollen stehen', async ({
    page,
    request,
  }) => {
    const { token } = await createGroup(request, 'WG', ['Samu', 'Karl', 'Rosi', 'Toni']);
    await openGroupAs(page, token, 'Samu');
    await scanFromGallery(page, path.resolve('tests/fixtures/receipts/kaufland-a.png'));
    // Six positions do not fit on one screen: the list scrolls, the button stays reachable.
    const save = page.getByRole('button', { name: 'Speichern' });
    await positions(page).nth(5).scrollIntoViewIfNeeded();
    await expect(save).toBeInViewport();
    await expect(page.getByRole('heading', { name: 'Beleg aufteilen' })).toBeInViewport();
  });
});
