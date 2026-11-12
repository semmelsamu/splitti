// Milestone 4: create a group, open the link on another device, choose a member.

import { type Browser, expect, type Page, test } from '@playwright/test';
import { createGroup } from './helpers/api';

/** A second device: its own browser storage, same phone format. */
async function otherDevice(browser: Browser, baseURL: string | undefined): Promise<Page> {
    const context = await browser.newContext({
        baseURL,
        viewport: { width: 390, height: 844 },
        locale: 'de-DE',
    });
    return context.newPage();
}

async function invitationLink(page: Page): Promise<string> {
    await page.getByRole('button', { name: 'Gruppeneinstellungen' }).click();
    const link = (await page.getByTestId('invitation-link').textContent()) ?? '';
    expect(link).toMatch(/\/g\/[A-Za-z0-9_-]{32}$/);
    return link;
}

test.describe('Gruppen', () => {
    test('Gruppe anlegen, Link öffnen, Mitglied wählen', async ({ page, browser, baseURL }) => {
        // --- Device 1: create the group ---------------------------------------
        await page.goto('/');
        await expect(page.getByRole('heading', { name: 'Splitti' })).toBeVisible();
        await expect(page.getByText('Noch keine Gruppe auf diesem Gerät.')).toBeVisible();
        await page.getByRole('button', { name: 'Gruppe erstellen' }).click();

        await expect(page.getByRole('heading', { name: 'Gruppe erstellen' })).toBeVisible();
        const create = page.getByRole('button', { name: 'Gruppe erstellen' });
        await expect(create).toBeDisabled();
        await page.getByLabel('Name der Gruppe').fill('WG');
        await page.getByLabel('Dein Name').fill('Samu');
        await page.getByLabel('Name des neuen Mitglieds').fill('Karl');
        await page.getByRole('button', { name: 'Hinzufügen' }).click();
        await page.getByLabel('Name des neuen Mitglieds').fill('Rosi');
        await page.getByRole('button', { name: 'Hinzufügen' }).click();
        await page.getByLabel('Name des neuen Mitglieds').fill('Verschrieben');
        await page.getByRole('button', { name: 'Hinzufügen' }).click();
        await page.getByRole('button', { name: 'Verschrieben entfernen' }).click();
        await expect(page.getByText('Verschrieben')).toHaveCount(0);
        await create.click();

        // The group opens; this device is the creator and sees itself as "Du".
        await expect(page.getByRole('heading', { name: 'WG' })).toBeVisible();
        await expect(page).toHaveURL(/\/g\/[A-Za-z0-9_-]{32}$/);
        const balances = page.getByRole('region', { name: 'Salden' });
        await expect(balances.getByText('Du', { exact: true })).toBeVisible();
        await expect(balances.getByText('Karl')).toBeVisible();
        await expect(balances.getByText('Rosi')).toBeVisible();
        await expect(balances.getByText('ausgeglichen')).toHaveCount(3);

        const link = await invitationLink(page);

        // --- Device 2: open the link and pick a member -------------------------
        const phone = await otherDevice(browser, baseURL);
        await phone.goto(link);
        await expect(phone.getByRole('heading', { name: 'Wer bist du?' })).toBeVisible();
        await expect(phone.getByRole('button', { name: 'Samu' })).toBeVisible();
        await expect(phone.getByRole('button', { name: 'Rosi' })).toBeVisible();
        await phone.getByRole('button', { name: 'Karl' }).click();

        await expect(phone.getByRole('heading', { name: 'WG' })).toBeVisible();
        const phoneBalances = phone.getByRole('region', { name: 'Salden' });
        await expect(phoneBalances.getByText('Du', { exact: true })).toBeVisible();
        await expect(phoneBalances.getByText('Samu')).toBeVisible();
        await expect(phoneBalances.getByText('Karl')).toHaveCount(0);

        // The device remembers the choice …
        await phone.reload();
        await expect(phone.getByRole('heading', { name: 'WG' })).toBeVisible();
        await expect(phone.getByRole('heading', { name: 'Wer bist du?' })).toHaveCount(0);

        // … and lists the group on its start screen.
        await phone.goto('/');
        const entry = phone.getByRole('button', { name: /WG/ });
        await expect(entry).toContainText('3 Mitglieder · ausgeglichen');
        await entry.click();
        await expect(phone.getByRole('heading', { name: 'WG' })).toBeVisible();
        await phone.context().close();
    });

    test('wer neu ist, legt sich über den Link selbst an', async ({
        page,
        request,
        browser,
        baseURL,
    }) => {
        const { token } = await createGroup(request, 'WG', ['Samu', 'Karl']);

        await page.goto(`/g/${token}`);
        await page.getByRole('button', { name: '+ Ich bin neu in der Gruppe' }).click();
        const dialog = page.getByRole('dialog', { name: 'Ich bin neu in der Gruppe' });
        await dialog.getByLabel('Dein Name').fill('Toni');
        await dialog.getByRole('button', { name: 'Beitreten' }).click();

        await expect(page.getByRole('heading', { name: 'WG' })).toBeVisible();
        await expect(
            page.getByRole('region', { name: 'Salden' }).getByText('Du', { exact: true }),
        ).toBeVisible();

        // The others see the new member.
        const other = await otherDevice(browser, baseURL);
        await other.goto(`/g/${token}`);
        await expect(other.getByRole('button', { name: 'Toni' })).toBeVisible();
        await other.context().close();
    });

    test('ein Name, den es schon gibt, wird beim Beitreten abgelehnt', async ({
        page,
        request,
    }) => {
        const { token } = await createGroup(request, 'WG', ['Samu', 'Karl']);
        await page.goto(`/g/${token}`);
        await page.getByRole('button', { name: '+ Ich bin neu in der Gruppe' }).click();
        const dialog = page.getByRole('dialog');
        await dialog.getByLabel('Dein Name').fill('Karl');
        await dialog.getByRole('button', { name: 'Beitreten' }).click();
        await expect(dialog.getByRole('alert')).toHaveText('„Karl“ gibt es in der Gruppe schon.');
    });

    test('ein unbekannter Link führt zu einer Erklärung, nicht in eine Gruppe', async ({
        page,
    }) => {
        await page.goto('/g/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
        await expect(page.getByRole('heading', { name: 'Gruppe nicht gefunden' })).toBeVisible();
        await page.getByRole('button', { name: 'Zur Startseite' }).click();
        await expect(page.getByText('Noch keine Gruppe auf diesem Gerät.')).toBeVisible();
    });

    test('ein eingefügter Einladungslink öffnet die Gruppe', async ({ page, request, baseURL }) => {
        const { token } = await createGroup(request, 'Urlaub', ['Samu']);
        await page.goto('/');
        await page.getByRole('button', { name: 'Einladungslink einfügen' }).click();
        const dialog = page.getByRole('dialog', { name: 'Einladungslink einfügen' });
        await dialog.getByLabel('Einladungslink').fill('kein link');
        await dialog.getByRole('button', { name: 'Gruppe öffnen' }).click();
        await expect(dialog.getByRole('alert')).toHaveText(
            'Das ist kein Einladungslink von Splitti.',
        );
        await dialog.getByLabel('Einladungslink').fill(`${baseURL}/g/${token}`);
        await dialog.getByRole('button', { name: 'Gruppe öffnen' }).click();
        await expect(page.getByRole('heading', { name: 'Wer bist du?' })).toBeVisible();
        await expect(page.getByText('Urlaub')).toBeVisible();
    });
});

test.describe('Gruppeneinstellungen', () => {
    let token: string;

    test.beforeEach(async ({ page, request }) => {
        ({ token } = await createGroup(request, 'WG', ['Samu', 'Karl', 'Rosi']));
        await page.goto(`/g/${token}`);
        await page.getByRole('button', { name: 'Samu' }).click();
        await page.getByRole('button', { name: 'Gruppeneinstellungen' }).click();
        await expect(page.getByRole('heading', { name: 'Gruppeneinstellungen' })).toBeVisible();
    });

    test('Gruppe umbenennen', async ({ page }) => {
        await page.getByLabel('Name der Gruppe').fill('Villa Kunterbunt');
        await page.getByRole('button', { name: 'Speichern' }).click();
        await expect(page.getByRole('status')).toHaveText('Name gespeichert');
        await page.getByRole('button', { name: 'Zurück' }).click();
        await expect(page.getByRole('heading', { name: 'Villa Kunterbunt' })).toBeVisible();
    });

    test('Mitglied hinzufügen, umbenennen und entfernen', async ({ page }) => {
        await page.getByLabel('Name des neuen Mitglieds').fill('Toni');
        await page.getByRole('button', { name: 'Hinzufügen' }).click();
        await expect(page.getByRole('button', { name: 'Toni umbenennen' })).toBeVisible();

        await page.getByRole('button', { name: 'Toni umbenennen' }).click();
        const rename = page.getByRole('dialog', { name: 'Toni umbenennen' });
        await rename.getByLabel('Name').fill('Antonia');
        await rename.getByRole('button', { name: 'Speichern' }).click();
        await expect(page.getByRole('button', { name: 'Antonia umbenennen' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Toni umbenennen' })).toHaveCount(0);

        await page.getByRole('button', { name: 'Antonia entfernen' }).click();
        const confirm = page.getByRole('dialog', { name: 'Antonia entfernen?' });
        await confirm.getByRole('button', { name: 'Entfernen' }).click();
        await expect(page.getByRole('button', { name: 'Antonia umbenennen' })).toHaveCount(0);
        // Without any entries the member is gone for good, not just hidden.
        await expect(page.getByText('Entfernte Mitglieder')).toHaveCount(0);
    });

    test('sich selbst kann man nicht entfernen', async ({ page }) => {
        await expect(page.getByText('Samu (du)')).toBeVisible();
        await expect(page.getByRole('button', { name: 'Samu entfernen' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Karl entfernen' })).toBeVisible();
    });

    test('eigene Zuordnung ändern', async ({ page }) => {
        await expect(page.getByText('Du bist Samu')).toBeVisible();
        await page.getByRole('button', { name: 'Ändern' }).click();
        await expect(page.getByRole('heading', { name: 'Wer bist du?' })).toBeVisible();
        await page.getByRole('button', { name: 'Rosi' }).click();
        await expect(page.getByText('Du bist Rosi')).toBeVisible();
        await page.reload();
        await expect(page.getByText('Du bist Rosi')).toBeVisible();
    });

    test('Gruppe von diesem Gerät entfernen', async ({ page }) => {
        await page.getByRole('button', { name: 'Gruppe von diesem Gerät entfernen' }).click();
        const confirm = page.getByRole('dialog', { name: 'Gruppe von diesem Gerät entfernen?' });
        await confirm.getByRole('button', { name: 'Von diesem Gerät entfernen' }).click();
        await expect(page.getByText('Noch keine Gruppe auf diesem Gerät.')).toBeVisible();
        // The group itself still exists.
        await page.goto(`/g/${token}`);
        await expect(page.getByRole('heading', { name: 'Wer bist du?' })).toBeVisible();
    });

    test('„Link teilen“ kopiert den Einladungslink, wo es kein Teilen-Menü gibt', async ({
        page,
        context,
    }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.getByRole('button', { name: 'Link teilen' }).click();
        await expect(page.getByRole('status')).toHaveText('Link kopiert');
        const copied = await page.evaluate(() => navigator.clipboard.readText());
        expect(copied).toMatch(new RegExp(`/g/${token}$`));
    });

    test('„Link teilen“ öffnet das Teilen-Menü des Geräts', async ({ page }) => {
        // Headless Chromium has no share sheet; stand in for it and record the call.
        await page.evaluate(() => {
            const w = window as unknown as { shared?: unknown };
            navigator.share = async (data) => {
                w.shared = data;
            };
        });
        await page.getByRole('button', { name: 'Link teilen' }).click();
        const shared = await page.evaluate(
            () => (window as unknown as { shared?: ShareData }).shared,
        );
        expect(shared?.url).toMatch(new RegExp(`/g/${token}$`));
        expect(shared?.title).toBe('Splitti – WG');
    });
});

test.describe('Titelleiste der Gruppenübersicht', () => {
    let token: string;

    test.beforeEach(async ({ page, request }) => {
        ({ token } = await createGroup(request, 'WG', ['Samu', 'Karl']));
        await page.goto(`/g/${token}`);
        await page.getByRole('button', { name: 'Samu' }).click();
        await expect(page.getByRole('heading', { name: 'WG' })).toBeVisible();
    });

    test('ein Zahnrad führt zu den Gruppeneinstellungen', async ({ page }) => {
        const settings = page.getByRole('button', { name: 'Gruppeneinstellungen' });
        await expect(settings.locator('svg.lucide-settings')).toBeVisible();
        await settings.click();
        await expect(page.getByRole('heading', { name: 'Gruppeneinstellungen' })).toBeVisible();
    });
});
