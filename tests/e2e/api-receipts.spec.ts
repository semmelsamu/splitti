import fs from 'node:fs';
import path from 'node:path';
import { type APIRequestContext, expect, test } from '@playwright/test';
import sharp from 'sharp';
import { as, createGroup, type TestGroup } from './helpers/api';

const photoA = fs.readFileSync(path.resolve('tests/fixtures/receipts/kaufland-a.png'));

/** A receipt as the UI would send it. Names refer to the members of the group. */
function receipt(group: TestGroup, overrides: Record<string, unknown> = {}) {
    const { Samu, Karl, Rosi } = group.ids as Record<string, number>;
    return {
        paidBy: Samu,
        date: '2026-11-10',
        merchant: 'REWE',
        source: 'manual',
        detectedTotalCents: null,
        items: [
            { label: 'Käse', amountCents: 249, kind: 'item', memberIds: [Samu, Karl] },
            { label: 'Süßigkeiten', amountCents: 199, kind: 'item', memberIds: [Samu, Rosi] },
            { label: 'Pfand', amountCents: 25, kind: 'deposit', memberIds: [Samu] },
        ],
        ...overrides,
    };
}

async function save(request: APIRequestContext, group: TestGroup, data = receipt(group)) {
    const response = await request.post(`/api/groups/${group.token}/receipts`, {
        data,
        headers: as(group.memberId),
    });
    expect(response.status(), await response.text()).toBe(201);
    return (await response.json()).id as number;
}

test.describe('receipts API', () => {
    test('saves a receipt and returns it with positions, shares and history', async ({
        request,
    }) => {
        const group = await createGroup(request);
        const id = await save(request, group);

        const detail = await (
            await request.get(`/api/groups/${group.token}/receipts/${id}`)
        ).json();
        expect(detail).toMatchObject({
            id,
            merchant: 'REWE',
            date: '2026-11-10',
            source: 'manual',
            paidBy: group.ids.Samu,
            totalCents: 473,
            hasImage: false,
            deletedAt: null,
        });
        expect(detail.items.map((item: { label: string }) => item.label)).toEqual([
            'Käse',
            'Süßigkeiten',
            'Pfand',
        ]);
        // Samu: 124,5 + 99,5 + 25 = 249; Karl 124,5; Rosi 99,5 → one odd cent between Karl and Rosi.
        const shares = Object.fromEntries(
            detail.shares.map((share: { memberId: number; cents: number }) => [
                share.memberId,
                share.cents,
            ]),
        );
        expect(shares[group.ids.Samu as number]).toBe(249);
        expect(
            (shares[group.ids.Karl as number] as number) +
                (shares[group.ids.Rosi as number] as number),
        ).toBe(224);
        expect(detail.history).toHaveLength(1);
        expect(detail.history[0]).toMatchObject({
            memberId: group.memberId,
            action: 'created',
            summary: 'hat den Beleg angelegt',
        });
    });

    test('a saved receipt moves the balances', async ({ request }) => {
        const group = await createGroup(request);
        await save(
            request,
            group,
            receipt(group, {
                items: [
                    {
                        label: 'Internet',
                        amountCents: 4000,
                        kind: 'item',
                        memberIds: Object.values(group.ids),
                    },
                ],
            }),
        );
        const { balances } = await (await request.get(`/api/groups/${group.token}`)).json();
        const byMember = Object.fromEntries(
            balances.map((b: { memberId: number; cents: number }) => [b.memberId, b.cents]),
        );
        expect(byMember[group.ids.Samu as number]).toBe(3000);
        expect(byMember[group.ids.Karl as number]).toBe(-1000);
        expect(byMember[group.ids.Rosi as number]).toBe(-1000);
        expect(byMember[group.ids.Toni as number]).toBe(-1000);
    });

    test('rejects a position without members', async ({ request }) => {
        const group = await createGroup(request);
        const data = receipt(group);
        (data.items[2] as { memberIds: number[] }).memberIds = [];
        const response = await request.post(`/api/groups/${group.token}/receipts`, { data });
        expect(response.status()).toBe(400);
        expect((await response.json()).message).toBe(
            'Jede Position braucht mindestens eine Person.',
        );
    });

    test('rejects amounts that are not whole cents, and positions without a price', async ({
        request,
    }) => {
        const group = await createGroup(request);
        const fraction = receipt(group);
        (fraction.items[0] as { amountCents: number }).amountCents = 2.5;
        const first = await request.post(`/api/groups/${group.token}/receipts`, { data: fraction });
        expect(first.status()).toBe(400);
        expect((await first.json()).message).toContain('ganzer Cent-Betrag');

        const zero = receipt(group);
        (zero.items[0] as { amountCents: number }).amountCents = 0;
        const second = await request.post(`/api/groups/${group.token}/receipts`, { data: zero });
        expect(second.status()).toBe(400);
        expect((await second.json()).message).toBe('Eine Position hat noch keinen Preis.');
    });

    test('rejects a receipt without positions and an impossible date', async ({ request }) => {
        const group = await createGroup(request);
        const empty = await request.post(`/api/groups/${group.token}/receipts`, {
            data: receipt(group, { items: [] }),
        });
        expect(empty.status()).toBe(400);
        const badDate = await request.post(`/api/groups/${group.token}/receipts`, {
            data: receipt(group, { date: '2026-02-30' }),
        });
        expect(badDate.status()).toBe(400);
        expect((await badDate.json()).message).toBe('Das Datum ist ungültig.');
    });

    test('rejects members of another group as payer or in a share', async ({ request }) => {
        const group = await createGroup(request);
        const other = await createGroup(request, 'Andere', ['Eve']);

        const payer = await request.post(`/api/groups/${group.token}/receipts`, {
            data: receipt(group, { paidBy: other.memberId }),
        });
        expect(payer.status()).toBe(400);
        expect((await payer.json()).message).toBe('Wer bezahlt hat, gehört nicht zur Gruppe.');

        const data = receipt(group);
        (data.items[0] as { memberIds: number[] }).memberIds = [other.memberId];
        const share = await request.post(`/api/groups/${group.token}/receipts`, { data });
        expect(share.status()).toBe(400);
        expect((await share.json()).message).toContain('nicht zur Gruppe');
    });

    test('changes a receipt and records what changed', async ({ request }) => {
        const group = await createGroup(request);
        const id = await save(request, group);
        const before = await (
            await request.get(`/api/groups/${group.token}/receipts/${id}`)
        ).json();

        const items = before.items.map((item: Record<string, unknown>) => ({ ...item }));
        items[0].memberIds = [group.ids.Rosi]; // reassign Käse
        items[1].amountCents = 179; // reprice Süßigkeiten
        items.pop(); // delete Pfand
        items.push({ label: 'Brot', amountCents: 229, kind: 'item', memberIds: [group.ids.Karl] });

        const response = await request.put(`/api/groups/${group.token}/receipts/${id}`, {
            data: { ...receipt(group), paidBy: group.ids.Karl, items },
            headers: as(group.ids.Karl as number),
        });
        expect(response.status(), await response.text()).toBe(200);
        const after = await response.json();
        expect(after.paidBy).toBe(group.ids.Karl);
        expect(after.totalCents).toBe(249 + 179 + 229);
        expect(after.items.map((item: { label: string }) => item.label)).toEqual([
            'Käse',
            'Süßigkeiten',
            'Brot',
        ]);
        // Positions that stayed keep their id.
        expect(after.items[0].id).toBe(before.items[0].id);

        const summaries = after.history.map((change: { summary: string }) => change.summary);
        expect(summaries).toEqual([
            'hat den Beleg angelegt',
            'hat „Bezahlt von“ von Samu auf Karl geändert',
            'hat den Preis von „Süßigkeiten“ von 1,99 € auf 1,79 € geändert',
            'hat „Käse“ neu zugeordnet',
            'hat „Brot“ hinzugefügt',
            'hat „Pfand“ gelöscht',
        ]);
        expect(after.history.at(-1).memberId).toBe(group.ids.Karl);
    });

    test('saving a receipt unchanged leaves no trace in the history', async ({ request }) => {
        const group = await createGroup(request);
        const id = await save(request, group);
        const before = await (
            await request.get(`/api/groups/${group.token}/receipts/${id}`)
        ).json();
        await request.put(`/api/groups/${group.token}/receipts/${id}`, {
            data: { ...receipt(group), items: before.items },
        });
        const after = await (await request.get(`/api/groups/${group.token}/receipts/${id}`)).json();
        expect(after.history).toHaveLength(1);
    });

    test('deletes a receipt, which stops counting, and restores it', async ({ request }) => {
        const group = await createGroup(request);
        const id = await save(request, group);
        const balance = async () => {
            const { balances } = await (await request.get(`/api/groups/${group.token}`)).json();
            return balances.find((b: { memberId: number }) => b.memberId === group.ids.Samu).cents;
        };
        expect(await balance()).toBe(473 - 249);

        const deleted = await request.delete(`/api/groups/${group.token}/receipts/${id}`, {
            headers: as(group.memberId),
        });
        expect(deleted.status()).toBe(200);
        expect(await balance()).toBe(0);
        const list = await (await request.get(`/api/groups/${group.token}/receipts`)).json();
        expect(list.receipts[0].deletedAt).not.toBeNull();

        // A deleted receipt cannot be changed …
        const change = await request.put(`/api/groups/${group.token}/receipts/${id}`, {
            data: receipt(group),
        });
        expect(change.status()).toBe(409);

        // … but restored.
        const restored = await request.post(`/api/groups/${group.token}/receipts/${id}/restore`, {
            headers: as(group.memberId),
        });
        expect(restored.status()).toBe(200);
        expect((await restored.json()).deletedAt).toBeNull();
        expect(await balance()).toBe(473 - 249);

        const detail = await (
            await request.get(`/api/groups/${group.token}/receipts/${id}`)
        ).json();
        expect(detail.history.map((change: { summary: string }) => change.summary)).toEqual([
            'hat den Beleg angelegt',
            'hat den Beleg gelöscht',
            'hat den Beleg wiederhergestellt',
        ]);
    });

    test('does not let one group read, change, delete or restore the receipts of another', async ({
        request,
    }) => {
        const mine = await createGroup(request);
        const other = await createGroup(request, 'Andere', ['Eve']);
        const id = await save(request, mine);
        const base = `/api/groups/${other.token}/receipts/${id}`;

        expect((await request.get(base)).status()).toBe(404);
        expect((await request.get(`${base}/image`)).status()).toBe(404);
        expect((await request.get(`${base}/image?size=small`)).status()).toBe(404);
        expect((await request.delete(base)).status()).toBe(404);
        expect((await request.post(`${base}/restore`)).status()).toBe(404);
        const put = await request.put(base, {
            data: {
                paidBy: other.memberId,
                date: '2026-11-10',
                merchant: 'Gekapert',
                source: 'manual',
                detectedTotalCents: null,
                items: [{ label: 'x', amountCents: 1, kind: 'item', memberIds: [other.memberId] }],
            },
        });
        expect(put.status()).toBe(404);

        const untouched = await (
            await request.get(`/api/groups/${mine.token}/receipts/${id}`)
        ).json();
        expect(untouched.merchant).toBe('REWE');
        expect(untouched.deletedAt).toBeNull();
        // The other group's list and change log stay empty of it.
        const list = await (await request.get(`/api/groups/${other.token}/receipts`)).json();
        expect(list.receipts).toEqual([]);
    });

    test('does not accept a position id from another receipt', async ({ request }) => {
        const group = await createGroup(request);
        const first = await save(request, group);
        const second = await save(request, group);
        const foreign = await (
            await request.get(`/api/groups/${group.token}/receipts/${first}`)
        ).json();
        const response = await request.put(`/api/groups/${group.token}/receipts/${second}`, {
            data: { ...receipt(group), items: [foreign.items[0]] },
        });
        expect(response.status()).toBe(400);
        expect((await response.json()).message).toContain('gehört nicht zu diesem Beleg');
    });

    test('lists the change log of the group, newest first', async ({ request }) => {
        const group = await createGroup(request);
        const id = await save(request, group);
        await request.delete(`/api/groups/${group.token}/receipts/${id}`, {
            headers: as(group.memberId),
        });
        const { changes } = await (await request.get(`/api/groups/${group.token}/changes`)).json();
        expect(changes.map((change: { summary: string }) => change.summary)).toEqual([
            'hat den Beleg gelöscht',
            'hat den Beleg angelegt',
            'hat die Gruppe erstellt',
        ]);
        expect(changes[0]).toMatchObject({
            entity: 'receipt',
            entityId: id,
            memberId: group.memberId,
        });
    });
});

test.describe('scan API', () => {
    test('recognises test receipt A and keeps the image as a draft', async ({ request }) => {
        const group = await createGroup(request);
        const response = await request.post(`/api/groups/${group.token}/scan`, {
            data: photoA,
            headers: { 'Content-Type': 'image/png' },
        });
        expect(response.status(), await response.text()).toBe(200);
        const draft = await response.json();

        expect(draft.usable).toBe(true);
        expect(draft.merchant).toBe('Kaufland');
        expect(draft.detectedTotalCents).toBe(1163);
        expect(draft.items.map((item: { amountCents: number }) => item.amountCents)).toEqual([
            279, 95, 300, 200, 100, 189,
        ]);
        // Quantity lines carry the quantity in their name.
        expect(draft.items[2].label).toBe('Barilla Girandole · 3 × 1,00');
        expect(draft.imageId).toMatch(/^[0-9a-f-]{36}$/);

        // Nothing is saved yet …
        const list = await (await request.get(`/api/groups/${group.token}/receipts`)).json();
        expect(list.receipts).toEqual([]);

        // … but the draft image can be shown.
        const image = await request.get(`/api/groups/${group.token}/scan/${draft.imageId}`);
        expect(image.status()).toBe(200);
        expect(image.headers()['content-type']).toBe('image/jpeg');

        // Saving the receipt adopts the image.
        const id = await save(request, group, {
            paidBy: group.memberId,
            date: '2026-11-12',
            merchant: draft.merchant,
            source: 'scan',
            detectedTotalCents: draft.detectedTotalCents,
            imageId: draft.imageId,
            items: draft.items.map(
                (item: { label: string; amountCents: number; kind: string }) => ({
                    label: item.label,
                    amountCents: item.amountCents,
                    kind: item.kind,
                    memberIds: [group.memberId],
                }),
            ),
        } as never);
        const saved = await request.get(`/api/groups/${group.token}/receipts/${id}/image`);
        expect(saved.status()).toBe(200);
        expect(saved.headers()['content-type']).toBe('image/jpeg');
        expect((await saved.body()).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));

        // Lists get a small version: the same picture at a fraction of the size.
        const small = await request.get(
            `/api/groups/${group.token}/receipts/${id}/image?size=small`,
        );
        expect(small.status()).toBe(200);
        expect(small.headers()['content-type']).toBe('image/jpeg');
        const [full, thumb] = await Promise.all([
            sharp(await saved.body()).metadata(),
            sharp(await small.body()).metadata(),
        ]);
        expect(thumb.format).toBe('jpeg');
        expect(thumb.width).toBe(160);
        expect(thumb.height / thumb.width).toBeCloseTo(full.height / full.width, 1);
        expect((await small.body()).length).toBeLessThan((await saved.body()).length / 10);
        // The draft is gone once it belongs to a receipt.
        expect(
            (await request.get(`/api/groups/${group.token}/scan/${draft.imageId}`)).status(),
        ).toBe(404);
    });

    test('does not hand out the draft image of another group', async ({ request }) => {
        const mine = await createGroup(request);
        const other = await createGroup(request, 'Andere', ['Eve']);
        const draft = await (
            await request.post(`/api/groups/${mine.token}/scan`, {
                data: photoA,
                headers: { 'Content-Type': 'image/png' },
            })
        ).json();

        expect(
            (await request.get(`/api/groups/${other.token}/scan/${draft.imageId}`)).status(),
        ).toBe(404);
        // Nor can the other group attach it to a receipt of its own.
        const steal = await request.post(`/api/groups/${other.token}/receipts`, {
            data: {
                paidBy: other.memberId,
                date: '2026-11-12',
                merchant: 'x',
                source: 'scan',
                detectedTotalCents: null,
                imageId: draft.imageId,
                items: [{ label: 'x', amountCents: 1, kind: 'item', memberIds: [other.memberId] }],
            },
        });
        expect(steal.status()).toBe(404);
    });

    test('rejects image handles that are not handles', async ({ request }) => {
        const group = await createGroup(request);
        for (const id of ['..%2F..%2Fsplitti.db', 'abc', '%2Fetc%2Fpasswd']) {
            expect((await request.get(`/api/groups/${group.token}/scan/${id}`)).status()).toBe(404);
        }
    });

    test('answers a file that is no image with a clear message', async ({ request }) => {
        const group = await createGroup(request);
        const response = await request.post(`/api/groups/${group.token}/scan`, {
            data: Buffer.from('das ist kein Bild'),
            headers: { 'Content-Type': 'image/jpeg' },
        });
        expect(response.status()).toBe(400);
        expect((await response.json()).message).toContain('konnte nicht gelesen werden');
    });

    test('opens an empty draft with the image when nothing is recognised', async ({ request }) => {
        const group = await createGroup(request);
        // A valid but blank image: 1×1 white PNG.
        const blank = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            'base64',
        );
        const response = await request.post(`/api/groups/${group.token}/scan`, {
            data: blank,
            headers: { 'Content-Type': 'image/png' },
        });
        expect(response.status(), await response.text()).toBe(200);
        const draft = await response.json();
        expect(draft.usable).toBe(false);
        expect(draft.items).toEqual([]);
        expect(draft.imageId).toMatch(/^[0-9a-f-]{36}$/);
    });
});
