// Milestone 5: upload a test receipt, assign, save, change, delete, restore.

import path from 'node:path';
import { expect, test } from '@playwright/test';
import { createGroup } from './helpers/api';
import {
  assign,
  balanceRow,
  openGroupAs,
  positions,
  SCAN_TIMEOUT,
  scanFromGallery,
} from './helpers/ui';

const PHOTO_A = path.resolve('tests/fixtures/receipts/kaufland-a.png');

test.describe('Belege', () => {
  test('Testzettel hochladen, zuordnen, speichern, ändern, löschen, wiederherstellen', async ({
    page,
    request,
  }) => {
    const { token } = await createGroup(request, 'WG', ['Samu', 'Karl', 'Rosi', 'Toni']);
    await openGroupAs(page, token, 'Samu');

    // --- hochladen -----------------------------------------------------------
    await scanFromGallery(page, PHOTO_A);
    await expect(page.getByText('6 Positionen erkannt')).toBeVisible();
    await expect(page.getByText(/^Kaufland · \d{2}\.\d{2}\.\d{4}$/)).toBeVisible();
    await expect(page.getByText('Summe Positionen 11,63 €')).toBeVisible();
    await expect(page.getByTestId('total-check')).toHaveText('Zettelsumme 11,63 € · stimmt');
    // The device's member is preselected as payer.
    await expect(page.getByRole('button', { name: 'Bezahlt von Du' })).toBeVisible();

    const items = positions(page);
    await expect(items).toHaveCount(6);
    await expect(items.nth(0)).toContainText('2,79 €');
    await expect(items.nth(2)).toContainText('Barilla Girandole · 3 × 1,00');
    await expect(items.nth(2)).toContainText('3,00 €');

    // Opt-in: nothing is assigned, so saving is locked.
    const save = page.getByRole('button', { name: 'Speichern' });
    await expect(save).toBeDisabled();
    await expect(page.getByText('6 Positionen sind noch niemandem zugeordnet')).toBeVisible();
    await expect(items.nth(0).getByText('noch offen')).toBeVisible();

    // --- zuordnen: the worked example from the plan ---------------------------
    await assign(items.nth(0), 'Du', 'Rosi'); // KLC.Nougat Pockets
    await assign(items.nth(1), 'Du'); // KVeg.No Milk
    await assign(items.nth(2), 'alle'); // Barilla Girandole
    await assign(items.nth(3), 'Du', 'Karl'); // Hauchgenuss vegan
    await assign(items.nth(4), 'Karl'); // Salami vegan
    await expect(page.getByText('1 Position ist noch niemandem zugeordnet')).toBeVisible();
    await expect(save).toBeDisabled();
    await assign(items.nth(5), 'Du', 'Karl'); // KLC.Käseaufschnitt
    await expect(page.getByText(/noch niemandem zugeordnet/)).toHaveCount(0);
    await expect(items.nth(2).getByRole('button', { name: 'Toni' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // --- speichern -------------------------------------------------------------
    await save.click();
    await expect(page.getByRole('heading', { name: 'WG' })).toBeVisible();
    // Samu paid 11,63 and bears 5,04.
    await expect(balanceRow(page, 'Du')).toContainText('bekommt 6,59 €');
    await expect(balanceRow(page, 'Karl')).toContainText('schuldet 3,70 €');
    await expect(balanceRow(page, 'Rosi')).toContainText('schuldet 2,14 €');
    await expect(balanceRow(page, 'Toni')).toContainText('schuldet 0,75 €');

    const latest = page.getByRole('region', { name: 'Letzte Belege' });
    await expect(latest.getByRole('button', { name: /Kaufland/ })).toContainText('11,63 €');
    await expect(latest.getByRole('button', { name: /Kaufland/ })).toContainText(
      'bezahlt von Du · Scan',
    );

    // --- ansehen ---------------------------------------------------------------
    await latest.getByRole('button', { name: /Kaufland/ }).click();
    await expect(page.getByRole('heading', { name: 'Kaufland' })).toBeVisible();
    await expect(page.getByTestId('receipt-total')).toHaveText('11,63 €');
    const shares = page.getByRole('region', { name: 'Anteile' });
    await expect(shares).toContainText('Du5,04 €');
    await expect(shares).toContainText('Karl3,70 €');
    await expect(shares).toContainText('Rosi2,14 €');
    await expect(shares).toContainText('Toni0,75 €');
    const detailItems = page.getByRole('list', { name: 'Positionen' }).getByRole('listitem');
    await expect(detailItems.nth(0)).toContainText('Du, Rosi');
    await expect(detailItems.nth(2)).toContainText('alle');
    await expect(page.getByRole('region', { name: 'Verlauf' })).toContainText(
      'Du hat den Beleg angelegt',
    );

    // The photo stays with the receipt as proof.
    await page.getByRole('button', { name: 'Zettelbild ansehen' }).click();
    const viewer = page.getByRole('dialog', { name: 'Zettelbild' });
    const photo = viewer.getByRole('img', { name: 'Foto des Kassenzettels' });
    await expect(photo).toBeVisible();
    await expect
      .poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(500);
    await viewer.getByRole('button', { name: 'Schließen' }).click();

    // --- ändern ----------------------------------------------------------------
    await page.getByRole('button', { name: 'Bearbeiten' }).click();
    await expect(page.getByRole('heading', { name: 'Beleg aufteilen' })).toBeVisible();
    await expect(positions(page)).toHaveCount(6);
    // Salami vegan goes from Karl to Rosi.
    await assign(positions(page).nth(4), 'Karl', 'Rosi');
    // The second position gets a readable name.
    await positions(page)
      .nth(1)
      .getByRole('button', { name: /^Position .* bearbeiten$/ })
      .click();
    const edit = page.getByRole('dialog', { name: 'Position bearbeiten' });
    await edit.getByLabel('Bezeichnung').fill('Hafermilch');
    await edit.getByRole('button', { name: 'Übernehmen' }).click();
    await page.getByRole('button', { name: 'Speichern' }).click();

    await expect(page.getByRole('heading', { name: 'Kaufland' })).toBeVisible();
    const history = page.getByRole('region', { name: 'Verlauf' });
    await expect(history).toContainText('in „Hafermilch“ umbenannt');
    await expect(history).toContainText('Du hat „Salami vegan“ neu zugeordnet');
    await expect(page.getByRole('region', { name: 'Anteile' })).toContainText('Karl2,70 €');
    await expect(page.getByRole('region', { name: 'Anteile' })).toContainText('Rosi3,14 €');
    await expect(page.getByTestId('receipt-total')).toHaveText('11,63 €');

    // --- löschen ---------------------------------------------------------------
    await page.getByRole('button', { name: 'Beleg löschen' }).click();
    await page
      .getByRole('dialog', { name: 'Beleg löschen?' })
      .getByRole('button', { name: 'Löschen' })
      .click();
    await expect(page.getByRole('heading', { name: 'WG' })).toBeVisible();
    await expect(page.getByText('Noch keine Belege.')).toBeVisible();
    for (const name of ['Du', 'Karl', 'Rosi', 'Toni']) {
      await expect(balanceRow(page, name)).toContainText('ausgeglichen');
    }

    // --- wiederherstellen --------------------------------------------------------
    await page.getByRole('button', { name: 'Alle Belege und Änderungsverlauf' }).click();
    const all = page.getByRole('region', { name: 'Alle Belege' });
    await expect(all).toContainText('gelöscht');
    await all.getByRole('button', { name: 'Kaufland wiederherstellen' }).click();
    await expect(all.getByText('gelöscht')).toHaveCount(0);
    const log = page.getByRole('region', { name: 'Änderungsverlauf' });
    await expect(log.getByRole('listitem').first()).toContainText(
      'Du hat den Beleg wiederhergestellt',
    );
    await expect(log).toContainText('Du hat den Beleg gelöscht');

    await page.getByRole('button', { name: 'Zurück' }).click();
    await expect(balanceRow(page, 'Du')).toContainText('bekommt 6,59 €');
    await expect(balanceRow(page, 'Karl')).toContainText('schuldet 2,70 €');
    await expect(page.getByRole('region', { name: 'Letzte Belege' })).toContainText('Kaufland');
  });

  test('ein gelöschter Beleg lässt sich auch in der Detailansicht wiederherstellen', async ({
    page,
    request,
  }) => {
    const group = await createGroup(request, 'WG', ['Samu', 'Karl']);
    const created = await request.post(`/api/groups/${group.token}/receipts`, {
      data: {
        paidBy: group.ids.Samu,
        date: '2026-11-10',
        merchant: 'REWE',
        source: 'manual',
        detectedTotalCents: null,
        items: [{ label: 'Käse', amountCents: 249, kind: 'item', memberIds: [group.ids.Karl] }],
      },
    });
    const { id } = await created.json();
    await request.delete(`/api/groups/${group.token}/receipts/${id}`);

    await openGroupAs(page, group.token, 'Samu');
    await page.goto(`/g/${group.token}/beleg/${id}`);
    await expect(page.getByRole('status')).toContainText('Dieser Beleg ist gelöscht');
    await expect(page.getByRole('button', { name: 'Bearbeiten' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Beleg wiederherstellen' }).click();
    await expect(page.getByRole('button', { name: 'Beleg löschen' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bearbeiten' })).toBeVisible();
  });
});

test.describe('Beleg aufteilen', () => {
  let token: string;

  test.beforeEach(async ({ page, request }) => {
    ({ token } = await createGroup(request, 'WG', ['Samu', 'Karl', 'Rosi', 'Toni']));
    await openGroupAs(page, token, 'Samu');
    await scanFromGallery(page, PHOTO_A);
  });

  test('Speichern geht erst, wenn jede Position jemanden hat oder gelöscht ist', async ({
    page,
  }) => {
    const save = page.getByRole('button', { name: 'Speichern' });
    const items = positions(page);
    for (let index = 0; index < 5; index++) await assign(items.nth(index), 'alle');
    await expect(save).toBeDisabled();
    await expect(page.getByText('1 Position ist noch niemandem zugeordnet')).toBeVisible();

    // Deleting the open position unlocks saving, too.
    await items
      .nth(5)
      .getByRole('button', { name: /^Position .* bearbeiten$/ })
      .click();
    await page.getByRole('dialog').getByRole('button', { name: 'Position löschen' }).click();
    await expect(items).toHaveCount(5);
    await expect(save).toBeEnabled();
    // The positions no longer add up to the receipt total, and that is shown above the button.
    await expect(page.getByTestId('total-check')).toHaveText(
      'Zettelsumme 11,63 € · weicht um 1,89 € ab',
    );
  });

  test('Bezeichnung und Preis überschreiben, Position hinzufügen', async ({ page }) => {
    const items = positions(page);
    await items
      .nth(4)
      .getByRole('button', { name: /^Position .* bearbeiten$/ })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Position bearbeiten' });
    await expect(dialog.getByLabel('Preis in €')).toHaveValue('1,00');
    await dialog.getByLabel('Bezeichnung').fill('Vegane Salami');
    await dialog.getByLabel('Preis in €').fill('abc');
    await dialog.getByRole('button', { name: 'Übernehmen' }).click();
    await expect(dialog.getByRole('alert')).toContainText('kein Betrag');
    await dialog.getByLabel('Preis in €').fill('1,50');
    await dialog.getByRole('button', { name: 'Übernehmen' }).click();
    await expect(items.nth(4)).toContainText('Vegane Salami');
    await expect(items.nth(4)).toContainText('1,50 €');
    await expect(page.getByText('Summe Positionen 12,13 €')).toBeVisible();

    await page.getByRole('button', { name: '+ Position hinzufügen' }).click();
    const add = page.getByRole('dialog', { name: 'Position hinzufügen' });
    await add.getByLabel('Bezeichnung').fill('Pfand zurück');
    await add.getByLabel('Preis in €').fill('-0,50');
    await add.getByRole('button', { name: 'Übernehmen' }).click();
    await expect(items).toHaveCount(7);
    await expect(items.nth(6)).toContainText('-0,50 €');
    await expect(items.nth(6).getByText('noch offen')).toBeVisible();
    await expect(page.getByTestId('total-check')).toHaveText('Zettelsumme 11,63 € · stimmt');
  });

  test('mehrere Positionen markieren und gemeinsam zuordnen', async ({ page }) => {
    const items = positions(page);
    await page.getByRole('button', { name: 'Mehrere' }).click();
    const bulk = page.getByRole('group', { name: 'Markierte Positionen zuordnen' });
    await expect(bulk.getByRole('button', { name: 'Karl' })).toBeDisabled();

    await items.nth(0).getByRole('checkbox').check();
    await items.nth(1).getByRole('checkbox').check();
    await items.nth(3).getByRole('checkbox').check();
    await expect(bulk).toContainText('3 markiert');
    await bulk.getByRole('button', { name: 'Karl' }).click();
    await bulk.getByRole('button', { name: 'Du', exact: true }).click();

    for (const index of [0, 1, 3]) {
      await expect(items.nth(index).getByRole('button', { name: 'Karl' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(
        items.nth(index).getByRole('button', { name: 'Du', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(items.nth(index).getByRole('button', { name: 'Rosi' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    }
    await expect(items.nth(2).getByRole('button', { name: 'Karl' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.getByText('3 Positionen sind noch niemandem zugeordnet')).toBeVisible();

    // Tapping the chip again takes the member off all marked positions.
    await bulk.getByRole('button', { name: 'Karl' }).click();
    await expect(items.nth(0).getByRole('button', { name: 'Karl' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // Mark everything and give it to everyone.
    await bulk.getByRole('button', { name: 'Alle markieren' }).click();
    await expect(bulk).toContainText('6 markiert');
    await bulk.getByRole('button', { name: 'alle', exact: true }).click();
    await page.getByRole('button', { name: 'Fertig' }).click();
    await expect(page.getByRole('button', { name: 'Speichern' })).toBeEnabled();
    await expect(items.nth(5).getByRole('button', { name: 'Toni' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  test('Zahler, Bezeichnung und Datum lassen sich ändern', async ({ page }) => {
    await page.getByRole('button', { name: 'Bezahlt von Du' }).click();
    await page
      .getByRole('dialog', { name: 'Bezahlt von' })
      .getByRole('button', { name: 'Rosi' })
      .click();
    await expect(page.getByRole('button', { name: 'Bezahlt von Rosi' })).toBeVisible();

    await page.getByRole('button', { name: /^Bezeichnung und Datum ändern/ }).click();
    const head = page.getByRole('dialog', { name: 'Bezeichnung und Datum' });
    await head.getByLabel('Laden oder Bezeichnung').fill('Kaufland Wocheneinkauf');
    await head.getByLabel('Datum').fill('2026-11-08');
    await head.getByRole('button', { name: 'Übernehmen' }).click();
    await expect(page.getByText('Kaufland Wocheneinkauf · 08.11.2026')).toBeVisible();

    for (let index = 0; index < 6; index++) await assign(positions(page).nth(index), 'alle');
    await page.getByRole('button', { name: 'Speichern' }).click();
    const latest = page.getByRole('region', { name: 'Letzte Belege' });
    await expect(latest).toContainText('Kaufland Wocheneinkauf');
    await expect(latest).toContainText('08.11. · bezahlt von Rosi · Scan');
  });

  test('der Entwurf übersteht ein Neuladen, und Zurück fragt vor dem Verwerfen', async ({
    page,
  }) => {
    await assign(positions(page).nth(0), 'Karl');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Beleg aufteilen' })).toBeVisible();
    await expect(positions(page)).toHaveCount(6);
    await expect(positions(page).nth(0).getByRole('button', { name: 'Karl' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByRole('button', { name: 'Zurück' }).click();
    const confirm = page.getByRole('dialog', { name: 'Beleg verwerfen?' });
    await confirm.getByRole('button', { name: 'Weiter bearbeiten' }).click();
    await expect(positions(page)).toHaveCount(6);

    await page.getByRole('button', { name: 'Zurück' }).click();
    await page
      .getByRole('dialog', { name: 'Beleg verwerfen?' })
      .getByRole('button', { name: 'Verwerfen' })
      .click();
    await expect(page.getByRole('heading', { name: 'WG' })).toBeVisible();
    await expect(page.getByText('Noch keine Belege.')).toBeVisible();
  });
});

test.describe('Scan', () => {
  test('wird nichts erkannt, öffnet sich ein leerer Beleg mit dem Bild', async ({
    page,
    request,
  }, testInfo) => {
    const { token } = await createGroup(request, 'WG', ['Samu', 'Karl']);
    await openGroupAs(page, token, 'Samu');

    // A photo without any text.
    const blank = testInfo.outputPath('leer.png');
    const sharp = (await import('sharp')).default;
    await sharp({ create: { width: 600, height: 800, channels: 3, background: '#d9c9a3' } })
      .png()
      .toFile(blank);

    await scanFromGallery(page, blank);
    await expect(page.getByText('Nichts erkannt – trag die Positionen von Hand ein')).toBeVisible();
    await expect(positions(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Zettelbild ansehen' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Speichern' })).toBeDisabled();

    await page.getByRole('button', { name: '+ Position hinzufügen' }).click();
    const add = page.getByRole('dialog', { name: 'Position hinzufügen' });
    await add.getByLabel('Bezeichnung').fill('Brot');
    await add.getByLabel('Preis in €').fill('2,29');
    await add.getByRole('button', { name: 'Übernehmen' }).click();
    await assign(positions(page).nth(0), 'alle');
    await page.getByRole('button', { name: 'Speichern' }).click();

    await page
      .getByRole('region', { name: 'Letzte Belege' })
      .getByRole('button', { name: /Kaufland/ })
      .click();
    await expect(page.getByTestId('receipt-total')).toHaveText('2,29 €');
    await expect(page.getByRole('button', { name: 'Zettelbild ansehen' })).toBeVisible();
  });

  test('ohne Kamerabild öffnet der Auslöser die Kamera des Handys', async ({ page, request }) => {
    const { token } = await createGroup(request, 'WG', ['Samu', 'Karl']);
    await openGroupAs(page, token, 'Samu');
    await page.getByRole('button', { name: 'Zettel scannen' }).click();
    // Headless Chromium has no camera, like a phone without HTTPS or permission.
    await expect(page.getByText('Kein Kamerabild.')).toBeVisible();
    await expect(
      page.getByText(
        'Zettel aufrecht und vollständig fotografieren, von der ersten Position bis zur Summe.',
      ),
    ).toBeVisible();

    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Foto aufnehmen' }).click();
    await (await chooser).setFiles(PHOTO_A);
    // Progress of upload and recognition is announced.
    await expect(page.getByRole('status')).toContainText(
      /Foto wird hochgeladen|Positionen werden erkannt/,
    );
    await expect(page.getByRole('heading', { name: 'Beleg aufteilen' })).toBeVisible({
      timeout: SCAN_TIMEOUT,
    });
    await expect(page.getByText('6 Positionen erkannt')).toBeVisible();
  });

  test('eine Datei, die kein Bild ist, wird mit einer Meldung abgelehnt', async ({
    page,
    request,
  }, testInfo) => {
    const { token } = await createGroup(request, 'WG', ['Samu', 'Karl']);
    await openGroupAs(page, token, 'Samu');
    const notAnImage = testInfo.outputPath('notiz.jpg');
    (await import('node:fs')).writeFileSync(notAnImage, 'kein Bild');

    await page.getByRole('button', { name: 'Zettel scannen' }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Aus Galerie' }).click();
    await (await chooser).setFiles(notAnImage);
    await expect(page.getByRole('alert')).toContainText('konnte nicht gelesen werden');
    await expect(page.getByRole('heading', { name: 'Zettel scannen' })).toBeVisible();
  });
});

test.describe('Manueller Eintrag', () => {
  let token: string;

  test.beforeEach(async ({ page, request }) => {
    ({ token } = await createGroup(request, 'WG', ['Samu', 'Karl', 'Rosi', 'Toni']));
    await openGroupAs(page, token, 'Samu');
    await page.getByRole('button', { name: 'Manuell' }).click();
    await expect(page.getByRole('heading', { name: 'Manueller Eintrag' })).toBeVisible();
  });

  test('ein Betrag auf bestimmte Leute', async ({ page }) => {
    const save = page.getByRole('button', { name: 'Speichern' });
    await expect(save).toBeDisabled();
    await page.getByLabel('Bezeichnung').fill('Internet');
    await page.getByLabel('Betrag in €').fill('40,00');
    await page.getByLabel('Datum').fill('2026-11-01');
    await page.getByRole('button', { name: /^Bezahlt von Du/ }).click();
    await page
      .getByRole('dialog', { name: 'Bezahlt von' })
      .getByRole('button', { name: 'Karl' })
      .click();

    // Opt-in here, too: nobody is selected until tapped.
    await expect(page.getByTestId('per-person')).toHaveText(
      'Wähle aus, wer sich den Betrag teilt.',
    );
    await expect(save).toBeDisabled();
    const chips = page.getByRole('group', { name: 'Aufteilen auf' });
    await chips.getByRole('button', { name: 'alle' }).click();
    await expect(page.getByTestId('per-person')).toHaveText('4 Personen · je 10,00 €');
    await chips.getByRole('button', { name: 'Toni' }).click();
    await expect(page.getByTestId('per-person')).toHaveText('3 Personen · je etwa 13,33 €');
    await chips.getByRole('button', { name: 'Toni' }).click();
    await save.click();

    await expect(page.getByRole('heading', { name: 'WG' })).toBeVisible();
    await expect(balanceRow(page, 'Karl')).toContainText('bekommt 30,00 €');
    await expect(balanceRow(page, 'Du')).toContainText('schuldet 10,00 €');
    const latest = page.getByRole('region', { name: 'Letzte Belege' });
    await expect(latest.getByRole('button', { name: /Internet/ })).toContainText('40,00 €');
    await expect(latest.getByRole('button', { name: /Internet/ })).toContainText(
      '01.11. · bezahlt von Karl · manuell',
    );
  });

  test('ein von Hand angelegter Beleg mit Positionen', async ({ page }) => {
    await page.getByLabel('Bezeichnung').fill('Wochenmarkt');
    await page.getByRole('button', { name: 'Beleg mit Positionen' }).click();
    await expect(page.getByRole('heading', { name: 'Beleg aufteilen' })).toBeVisible();
    await expect(page.getByText(/^Wochenmarkt · /)).toBeVisible();
    await expect(page.getByText('Der Beleg hat noch keine Positionen')).toBeVisible();
    // No receipt photo, no printed total to compare with.
    await expect(page.getByRole('button', { name: 'Zettelbild ansehen' })).toHaveCount(0);
    await expect(page.getByTestId('total-check')).toHaveCount(0);

    for (const [label, price] of [
      ['Äpfel', '3,20'],
      ['Honig', '6,50'],
    ]) {
      await page.getByRole('button', { name: '+ Position hinzufügen' }).click();
      const add = page.getByRole('dialog', { name: 'Position hinzufügen' });
      await add.getByLabel('Bezeichnung').fill(label as string);
      await add.getByLabel('Preis in €').fill(price as string);
      await add.getByRole('button', { name: 'Übernehmen' }).click();
    }
    await assign(positions(page).nth(0), 'Du', 'Karl');
    await assign(positions(page).nth(1), 'Rosi');
    await page.getByRole('button', { name: 'Speichern' }).click();

    await expect(balanceRow(page, 'Du')).toContainText('bekommt 8,10 €');
    await expect(balanceRow(page, 'Karl')).toContainText('schuldet 1,60 €');
    await expect(balanceRow(page, 'Rosi')).toContainText('schuldet 6,50 €');
    await expect(page.getByRole('region', { name: 'Letzte Belege' })).toContainText(
      'bezahlt von Du · manuell',
    );
  });

  test('ein Betrag, der keiner ist, wird nicht gespeichert', async ({ page }) => {
    await page.getByLabel('Bezeichnung').fill('Strom');
    await page.getByLabel('Betrag in €').fill('viel');
    await page
      .getByRole('group', { name: 'Aufteilen auf' })
      .getByRole('button', { name: 'alle' })
      .click();
    await expect(page.getByRole('alert')).toContainText('kein Betrag über null');
    await expect(page.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  });
});
