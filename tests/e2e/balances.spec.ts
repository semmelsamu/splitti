// Milestone 6: balances are right after two receipts and one payment.

import { expect, test } from '@playwright/test';
import { createGroup } from './helpers/api';
import { assign, balanceRow, openGroupAs, positions } from './helpers/ui';

test.describe('Salden und Begleichen', () => {
    test('Salden stimmen nach zwei Belegen und einer Zahlung', async ({ page, request }) => {
        const group = await createGroup(request, 'WG', ['Samu', 'Karl', 'Rosi', 'Toni']);
        await openGroupAs(page, group.token, 'Samu');
        for (const name of ['Du', 'Karl', 'Rosi', 'Toni']) {
            await expect(balanceRow(page, name)).toContainText('ausgeglichen');
        }

        // --- Beleg 1: Karl zahlt 40,00 für alle -----------------------------------
        await page.getByRole('button', { name: 'Manuell', exact: true }).click();
        await page.getByLabel('Bezeichnung').fill('Internet');
        await page.getByLabel('Betrag in €').fill('40');
        await page.getByRole('button', { name: /^Bezahlt von Du/ }).click();
        await page
            .getByRole('dialog', { name: 'Bezahlt von' })
            .getByRole('button', { name: 'Karl' })
            .click();
        await page
            .getByRole('group', { name: 'Aufteilen auf' })
            .getByRole('button', { name: 'alle' })
            .click();
        await page.getByRole('button', { name: 'Speichern' }).click();

        await expect(balanceRow(page, 'Karl')).toContainText('bekommt 30,00 €');
        await expect(balanceRow(page, 'Du')).toContainText('schuldet 10,00 €');
        await expect(balanceRow(page, 'Rosi')).toContainText('schuldet 10,00 €');
        await expect(balanceRow(page, 'Toni')).toContainText('schuldet 10,00 €');

        // --- Beleg 2: Samu zahlt 15,00, ungleich verteilt, mit einem Rundungscent ---
        await page.getByRole('button', { name: 'Manuell', exact: true }).click();
        await page.getByLabel('Bezeichnung').fill('Baumarkt');
        await page.getByRole('button', { name: 'Beleg mit Positionen' }).click();
        for (const [label, price] of [
            ['Farbe', '9,00'],
            ['Pinsel', '5,00'],
            ['Klebeband', '1,00'],
        ]) {
            await page.getByRole('button', { name: '+ Position hinzufügen' }).click();
            const add = page.getByRole('dialog', { name: 'Position hinzufügen' });
            await add.getByLabel('Bezeichnung').fill(label as string);
            await add.getByLabel('Preis in €').fill(price as string);
            await add.getByRole('button', { name: 'Übernehmen' }).click();
        }
        await assign(positions(page).nth(0), 'Du', 'Karl', 'Rosi'); // 3,00 each
        await assign(positions(page).nth(1), 'Karl', 'Toni'); // 2,50 each
        await assign(positions(page).nth(2), 'Du', 'Karl', 'Rosi'); // 0,33… each, one cent left over
        await page.getByRole('button', { name: 'Speichern' }).click();

        // Shares of receipt 2: Samu 3,33, Karl 5,84 (gets the odd cent), Rosi 3,33, Toni 2,50.
        await expect(balanceRow(page, 'Du')).toContainText('bekommt 1,67 €');
        await expect(balanceRow(page, 'Karl')).toContainText('bekommt 24,16 €');
        await expect(balanceRow(page, 'Rosi')).toContainText('schuldet 13,33 €');
        await expect(balanceRow(page, 'Toni')).toContainText('schuldet 12,50 €');

        // --- Begleichen: der Vorschlag ----------------------------------------------
        await page.getByRole('button', { name: 'Begleichen' }).click();
        await expect(page.getByRole('heading', { name: 'Begleichen' })).toBeVisible();
        await expect(
            page.getByText('Mit diesen 3 Überweisungen sind alle Salden ausgeglichen.'),
        ).toBeVisible();
        const proposals = page.getByRole('article');
        await expect(proposals).toHaveCount(3);
        await expect(proposals.nth(0)).toContainText('Rosi zahlt an Karl');
        await expect(proposals.nth(0)).toContainText('13,33 €');
        await expect(proposals.nth(1)).toContainText('Toni zahlt an Karl');
        await expect(proposals.nth(1)).toContainText('10,83 €');
        await expect(proposals.nth(2)).toContainText('Toni zahlt an Du');
        await expect(proposals.nth(2)).toContainText('1,67 €');

        // --- eine Zahlung: Rosi überweist an Karl ----------------------------------
        await proposals.nth(0).getByRole('button', { name: 'Als bezahlt eintragen' }).click();
        await expect(page.getByRole('status')).toHaveText('Zahlung eingetragen');
        await expect(
            page.getByText('Mit diesen 2 Überweisungen sind alle Salden ausgeglichen.'),
        ).toBeVisible();
        await expect(proposals).toHaveCount(2);

        await page.getByRole('button', { name: 'Zurück' }).click();
        await expect(balanceRow(page, 'Du')).toContainText('bekommt 1,67 €');
        await expect(balanceRow(page, 'Karl')).toContainText('bekommt 10,83 €');
        await expect(balanceRow(page, 'Rosi')).toContainText('ausgeglichen');
        await expect(balanceRow(page, 'Toni')).toContainText('schuldet 12,50 €');

        // The server agrees to the cent, and the balances add up to zero.
        const body = await (await request.get(`/api/groups/${group.token}`)).json();
        const cents = new Map<number, number>(
            body.balances.map((b: { memberId: number; cents: number }) => [b.memberId, b.cents]),
        );
        expect(cents.get(group.ids.Samu as number)).toBe(167);
        expect(cents.get(group.ids.Karl as number)).toBe(1083);
        expect(cents.get(group.ids.Rosi as number)).toBe(0);
        expect(cents.get(group.ids.Toni as number)).toBe(-1250);
        expect([...cents.values()].reduce((a, b) => a + b, 0)).toBe(0);

        // The start screen shows the own balance.
        await page.goto('/');
        await expect(page.getByRole('button', { name: /WG/ })).toContainText(
            '4 Mitglieder · du bekommst 1,67 €',
        );
    });

    test('die Zahlung steht im Verlauf und lässt sich dort wieder löschen', async ({
        page,
        request,
    }) => {
        const group = await createGroup(request, 'WG', ['Samu', 'Karl']);
        await request.post(`/api/groups/${group.token}/receipts`, {
            data: {
                paidBy: group.ids.Samu,
                date: '2026-11-10',
                merchant: 'REWE',
                source: 'manual',
                detectedTotalCents: null,
                items: [
                    {
                        label: 'Einkauf',
                        amountCents: 1630,
                        kind: 'item',
                        memberIds: [group.ids.Samu, group.ids.Karl],
                    },
                ],
            },
        });
        await openGroupAs(page, group.token, 'Karl');
        await expect(balanceRow(page, 'Du')).toContainText('schuldet 8,15 €');

        await page.getByRole('button', { name: 'Begleichen' }).click();
        await expect(
            page.getByText('Mit dieser Überweisung sind alle Salden ausgeglichen.'),
        ).toBeVisible();
        await expect(page.getByRole('article')).toContainText('Du zahlt an Samu');
        await page.getByRole('button', { name: 'Als bezahlt eintragen' }).click();
        await expect(
            page.getByText('Alle Salden sind ausgeglichen. Es gibt nichts zu überweisen.'),
        ).toBeVisible();

        await page.getByRole('button', { name: 'Zurück' }).click();
        await expect(balanceRow(page, 'Du')).toContainText('ausgeglichen');
        await page.getByRole('button', { name: 'Alle Belege und Änderungsverlauf' }).click();

        const log = page.getByRole('region', { name: 'Änderungsverlauf' });
        await expect(log.getByRole('listitem').first()).toContainText(
            'Du hat eine Zahlung eingetragen: Karl an Samu, 8,15 €',
        );
        const payments = page.getByRole('region', { name: 'Zahlungen' });
        await expect(payments).toContainText('Du an Samu');
        await expect(payments).toContainText('8,15 €');
        await payments.getByRole('button', { name: 'Zahlung Du an Samu löschen' }).click();
        await page
            .getByRole('dialog', { name: 'Zahlung löschen?' })
            .getByRole('button', { name: 'Löschen' })
            .click();
        await expect(payments).toContainText('gelöscht');
        await expect(payments.getByRole('button', { name: /löschen$/ })).toHaveCount(0);
        await expect(log.getByRole('listitem').first()).toContainText('gelöscht');

        await page.getByRole('button', { name: 'Zurück' }).click();
        await expect(balanceRow(page, 'Du')).toContainText('schuldet 8,15 €');
    });

    test('eine andere Zahlung eintragen, zum Beispiel einen Teilbetrag', async ({
        page,
        request,
    }) => {
        const group = await createGroup(request, 'WG', ['Samu', 'Karl', 'Rosi']);
        await request.post(`/api/groups/${group.token}/receipts`, {
            data: {
                paidBy: group.ids.Samu,
                date: '2026-11-10',
                merchant: 'Getränke',
                source: 'manual',
                detectedTotalCents: null,
                items: [
                    {
                        label: 'Getränke',
                        amountCents: 3000,
                        kind: 'item',
                        memberIds: Object.values(group.ids),
                    },
                ],
            },
        });
        await openGroupAs(page, group.token, 'Samu');
        await page.getByRole('button', { name: 'Begleichen' }).click();
        await page.getByRole('button', { name: 'Andere Zahlung eintragen' }).click();

        const dialog = page.getByRole('dialog', { name: 'Zahlung eintragen' });
        await dialog.getByLabel('Von').selectOption({ label: 'Rosi' });
        await dialog.getByLabel('An').selectOption({ label: 'Rosi' });
        await dialog.getByLabel('Betrag in €').fill('4');
        await dialog.getByRole('button', { name: 'Zahlung eintragen' }).click();
        await expect(dialog.getByRole('alert')).toHaveText('Wähle zwei verschiedene Personen.');

        await dialog.getByLabel('An').selectOption({ label: 'Du' });
        await dialog.getByLabel('Betrag in €').fill('nix');
        await dialog.getByRole('button', { name: 'Zahlung eintragen' }).click();
        await expect(dialog.getByRole('alert')).toContainText('kein Betrag über null');

        await dialog.getByLabel('Betrag in €').fill('4,00');
        await dialog.getByLabel('Datum').fill('2026-11-11');
        await dialog.getByRole('button', { name: 'Zahlung eintragen' }).click();
        await expect(dialog).toHaveCount(0);

        // Rosi owed 10,00 and paid 4,00.
        const proposals = page.getByRole('article');
        await expect(proposals).toHaveCount(2);
        await expect(page.getByRole('main')).toContainText('Karl zahlt an Du');
        await expect(page.getByRole('main')).toContainText('10,00 €');
        await expect(page.getByRole('main')).toContainText('Rosi zahlt an Du');
        await expect(page.getByRole('main')).toContainText('6,00 €');
        await page.getByRole('button', { name: 'Zurück' }).click();
        await expect(balanceRow(page, 'Rosi')).toContainText('schuldet 6,00 €');
        await expect(balanceRow(page, 'Du')).toContainText('bekommt 16,00 €');
    });

    test('ein entferntes Mitglied mit offenem Saldo bleibt in Salden und Begleichen sichtbar', async ({
        page,
        request,
    }) => {
        const group = await createGroup(request, 'WG', ['Samu', 'Karl', 'Rosi']);
        await request.post(`/api/groups/${group.token}/receipts`, {
            data: {
                paidBy: group.ids.Samu,
                date: '2026-11-10',
                merchant: 'Pizza',
                source: 'manual',
                detectedTotalCents: null,
                items: [
                    {
                        label: 'Pizza',
                        amountCents: 2400,
                        kind: 'item',
                        memberIds: Object.values(group.ids),
                    },
                ],
            },
        });
        // Rosi moves out but still owes her share.
        await request.patch(`/api/groups/${group.token}/members/${group.ids.Rosi}`, {
            data: { active: false },
        });

        await openGroupAs(page, group.token, 'Samu');
        await expect(balanceRow(page, 'Rosi (entfernt)')).toContainText('schuldet 8,00 €');
        await page.getByRole('button', { name: 'Begleichen' }).click();
        await expect(page.getByRole('main')).toContainText('Rosi zahlt an Du');

        // For new entries she can no longer be selected.
        await page.getByRole('button', { name: 'Zurück' }).click();
        await page.getByRole('button', { name: 'Manuell', exact: true }).click();
        const chips = page.getByRole('group', { name: 'Aufteilen auf' });
        await expect(chips.getByRole('button', { name: 'Karl' })).toBeVisible();
        await expect(chips.getByRole('button', { name: 'Rosi' })).toHaveCount(0);
    });
});
