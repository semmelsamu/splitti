import { type APIRequestContext, expect, test } from '@playwright/test';
import { as, createGroup, type TestGroup } from './helpers/api';

/** One receipt: Karl pays 40,00 for everybody. */
async function internet(request: APIRequestContext, group: TestGroup) {
  const response = await request.post(`/api/groups/${group.token}/receipts`, {
    data: {
      paidBy: group.ids.Karl,
      date: '2026-11-01',
      merchant: 'Internet',
      source: 'manual',
      detectedTotalCents: null,
      items: [
        { label: 'Internet', amountCents: 4000, kind: 'item', memberIds: Object.values(group.ids) },
      ],
    },
  });
  expect(response.status()).toBe(201);
}

async function balances(request: APIRequestContext, group: TestGroup) {
  const body = await (await request.get(`/api/groups/${group.token}`)).json();
  const byId = new Map<number, number>(
    body.balances.map((b: { memberId: number; cents: number }) => [b.memberId, b.cents]),
  );
  return Object.fromEntries(Object.entries(group.ids).map(([name, id]) => [name, byId.get(id)]));
}

test.describe('settlement and payments API', () => {
  test('proposes nothing for a group that is even', async ({ request }) => {
    const group = await createGroup(request);
    const { transfers } = await (await request.get(`/api/groups/${group.token}/settlement`)).json();
    expect(transfers).toEqual([]);
  });

  test('proposes the transfers that settle the group', async ({ request }) => {
    const group = await createGroup(request);
    await internet(request, group);
    const { transfers } = await (await request.get(`/api/groups/${group.token}/settlement`)).json();
    expect(transfers).toEqual([
      { from: group.ids.Samu, to: group.ids.Karl, amountCents: 1000 },
      { from: group.ids.Rosi, to: group.ids.Karl, amountCents: 1000 },
      { from: group.ids.Toni, to: group.ids.Karl, amountCents: 1000 },
    ]);
  });

  test('a payment evens out the balances and appears in the change log', async ({ request }) => {
    const group = await createGroup(request);
    await internet(request, group);
    const response = await request.post(`/api/groups/${group.token}/payments`, {
      data: { from: group.ids.Samu, to: group.ids.Karl, amountCents: 1000, date: '2026-11-12' },
      headers: as(group.memberId),
    });
    expect(response.status(), await response.text()).toBe(201);
    const { id } = await response.json();

    expect(await balances(request, group)).toEqual({
      Samu: 0,
      Karl: 2000,
      Rosi: -1000,
      Toni: -1000,
    });
    const { transfers } = await (await request.get(`/api/groups/${group.token}/settlement`)).json();
    expect(transfers).toHaveLength(2);

    const history = await (await request.get(`/api/groups/${group.token}/changes`)).json();
    expect(history.changes[0]).toMatchObject({
      entity: 'payment',
      entityId: id,
      action: 'created',
      memberId: group.memberId,
      summary: 'hat eine Zahlung eingetragen: Samu an Karl, 10,00 €',
    });
    expect(history.payments).toEqual([
      expect.objectContaining({
        id,
        from: group.ids.Samu,
        to: group.ids.Karl,
        amountCents: 1000,
        date: '2026-11-12',
        deletedAt: null,
      }),
    ]);
  });

  test('deleting a payment brings the old balances back', async ({ request }) => {
    const group = await createGroup(request);
    await internet(request, group);
    const { id } = await (
      await request.post(`/api/groups/${group.token}/payments`, {
        data: { from: group.ids.Samu, to: group.ids.Karl, amountCents: 1000, date: '2026-11-12' },
      })
    ).json();

    const deleted = await request.delete(`/api/groups/${group.token}/payments/${id}`, {
      headers: as(group.ids.Karl as number),
    });
    expect(deleted.status()).toBe(200);
    expect(await balances(request, group)).toEqual({
      Samu: -1000,
      Karl: 3000,
      Rosi: -1000,
      Toni: -1000,
    });

    const history = await (await request.get(`/api/groups/${group.token}/changes`)).json();
    expect(history.changes[0].summary).toBe(
      'hat die Zahlung von Samu an Karl über 10,00 € gelöscht',
    );
    expect(history.payments[0].deletedAt).not.toBeNull();
    // Deleting twice is harmless.
    expect((await request.delete(`/api/groups/${group.token}/payments/${id}`)).status()).toBe(200);
  });

  test('rejects payments that make no sense', async ({ request }) => {
    const group = await createGroup(request);
    const post = (data: Record<string, unknown>) =>
      request.post(`/api/groups/${group.token}/payments`, { data });
    const base = { from: group.ids.Samu, to: group.ids.Karl, amountCents: 500, date: '2026-11-12' };

    const self = await post({ ...base, to: group.ids.Samu });
    expect(self.status()).toBe(400);
    expect((await self.json()).message).toBe('Eine Zahlung an sich selbst gibt es nicht.');

    const zero = await post({ ...base, amountCents: 0 });
    expect(zero.status()).toBe(400);
    expect((await zero.json()).message).toBe('Der Betrag muss größer als null sein.');

    const fraction = await post({ ...base, amountCents: 12.5 });
    expect(fraction.status()).toBe(400);
    expect((await fraction.json()).message).toBe('Der Betrag muss ein ganzer Cent-Betrag sein.');

    const date = await post({ ...base, date: '12.11.2026' });
    expect(date.status()).toBe(400);
  });

  test('does not accept members of another group, nor touch the payments of another group', async ({
    request,
  }) => {
    const mine = await createGroup(request);
    const other = await createGroup(request, 'Andere', ['Eve', 'Mallory']);

    const foreign = await request.post(`/api/groups/${mine.token}/payments`, {
      data: { from: mine.ids.Samu, to: other.ids.Eve, amountCents: 500, date: '2026-11-12' },
    });
    expect(foreign.status()).toBe(400);
    expect((await foreign.json()).message).toBe(
      'Zahlende und Empfangende müssen zur Gruppe gehören.',
    );

    const { id } = await (
      await request.post(`/api/groups/${mine.token}/payments`, {
        data: { from: mine.ids.Samu, to: mine.ids.Karl, amountCents: 500, date: '2026-11-12' },
      })
    ).json();
    expect((await request.delete(`/api/groups/${other.token}/payments/${id}`)).status()).toBe(404);
    const history = await (await request.get(`/api/groups/${mine.token}/changes`)).json();
    expect(history.payments[0].deletedAt).toBeNull();
    // The other group's log knows nothing about it.
    const theirs = await (await request.get(`/api/groups/${other.token}/changes`)).json();
    expect(theirs.payments).toEqual([]);
  });
});
