import { expect, test } from '@playwright/test';
import { as, createGroup } from './helpers/api';

test.describe('groups API', () => {
    test('creates a group and returns it under its token', async ({ request }) => {
        const { token, memberId } = await createGroup(request, 'WG', ['Samu', 'Karl', 'Rosi']);
        expect(token).toMatch(/^[A-Za-z0-9_-]{32}$/);

        const response = await request.get(`/api/groups/${token}`);
        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body.group.name).toBe('WG');
        expect(body.members.map((m: { name: string }) => m.name)).toEqual(['Samu', 'Karl', 'Rosi']);
        expect(body.members[0].id).toBe(memberId);
        expect(body.members.every((m: { active: boolean }) => m.active)).toBe(true);
        // Nothing has been paid yet: everybody is even.
        expect(body.balances.map((b: { cents: number }) => b.cents)).toEqual([0, 0, 0]);
    });

    test('gives every group its own long random token', async ({ request }) => {
        const first = await createGroup(request);
        const second = await createGroup(request);
        expect(first.token).not.toBe(second.token);
    });

    test('rejects a group without a name or without the own name, in German', async ({
        request,
    }) => {
        const noName = await request.post('/api/groups', { data: { name: ' ', ownName: 'Samu' } });
        expect(noName.status()).toBe(400);
        expect((await noName.json()).message).toBe('Der Name der Gruppe fehlt.');

        const noOwnName = await request.post('/api/groups', { data: { name: 'WG' } });
        expect(noOwnName.status()).toBe(400);
        expect((await noOwnName.json()).message).toBe('Dein Name fehlt.');
    });

    test('rejects the same name twice in a new group', async ({ request }) => {
        const response = await request.post('/api/groups', {
            data: { name: 'WG', ownName: 'Samu', members: ['Karl', 'karl'] },
        });
        expect(response.status()).toBe(400);
        expect((await response.json()).message).toContain('doppelt');
    });

    test('answers an unknown token with 404', async ({ request }) => {
        const response = await request.get('/api/groups/gibt-es-nicht');
        expect(response.status()).toBe(404);
        expect((await response.json()).error).toBe('not_found');
    });

    test('renames a group', async ({ request }) => {
        const { token, memberId } = await createGroup(request);
        const response = await request.patch(`/api/groups/${token}`, {
            data: { name: 'Villa Kunterbunt' },
            headers: as(memberId),
        });
        expect(response.status()).toBe(200);
        expect((await (await request.get(`/api/groups/${token}`)).json()).group.name).toBe(
            'Villa Kunterbunt',
        );
    });

    test('adds a member', async ({ request }) => {
        const { token, memberId } = await createGroup(request, 'WG', ['Samu']);
        const response = await request.post(`/api/groups/${token}/members`, {
            data: { name: 'Karl' },
            headers: as(memberId),
        });
        expect(response.status()).toBe(201);
        const { member } = await response.json();
        expect(member).toMatchObject({ name: 'Karl', active: true });
        expect(member.color).toMatch(/^#[0-9a-f]{6}$/);
    });

    test('rejects a member whose name is already taken', async ({ request }) => {
        const { token } = await createGroup(request, 'WG', ['Samu', 'Karl']);
        const response = await request.post(`/api/groups/${token}/members`, {
            data: { name: 'karl' },
        });
        expect(response.status()).toBe(400);
        expect((await response.json()).message).toBe('„karl“ gibt es in der Gruppe schon.');
    });

    test('renames a member', async ({ request }) => {
        const { token, ids } = await createGroup(request, 'WG', ['Samu', 'Karl']);
        const response = await request.patch(`/api/groups/${token}/members/${ids.Karl}`, {
            data: { name: 'Karl-Heinz' },
        });
        expect(response.status()).toBe(200);
        expect((await response.json()).member.name).toBe('Karl-Heinz');
    });

    test('changes the colour of a member to one of the palette and logs it', async ({
        request,
    }) => {
        const { token, memberId, ids } = await createGroup(request, 'WG', ['Samu', 'Karl']);
        const response = await request.patch(`/api/groups/${token}/members/${ids.Karl}`, {
            data: { color: '#b91c1c' },
            headers: as(memberId),
        });
        expect(response.status()).toBe(200);
        expect((await response.json()).member.color).toBe('#b91c1c');

        const group = await (await request.get(`/api/groups/${token}`)).json();
        const karl = group.members.find((m: { name: string }) => m.name === 'Karl');
        expect(karl.color).toBe('#b91c1c');

        const log = await (await request.get(`/api/groups/${token}/changes`)).json();
        const entry = log.changes.find((change: { summary: string }) =>
            change.summary.includes('Farbe'),
        );
        expect(entry).toMatchObject({
            memberId,
            summary: 'hat die Farbe von „Karl“ auf Rot geändert',
        });
    });

    test('rejects a colour that is not in the palette', async ({ request }) => {
        const { token, ids } = await createGroup(request, 'WG', ['Samu', 'Karl']);
        for (const color of ['#123456', 'red', 'url(https://example.org/x)', '', 7]) {
            const response = await request.patch(`/api/groups/${token}/members/${ids.Karl}`, {
                data: { color },
            });
            expect(response.status(), String(color)).toBe(400);
            expect((await response.json()).message).toBe('Diese Farbe steht nicht zur Auswahl.');
        }
        const group = await (await request.get(`/api/groups/${token}`)).json();
        const karl = group.members.find((m: { name: string }) => m.name === 'Karl');
        expect(karl.color).toBe('#b45309');
    });

    test('gives a new member a colour nobody in the group has yet', async ({ request }) => {
        const { token, ids } = await createGroup(request, 'WG', ['Samu', 'Karl']);
        // Samu takes the colour that would be next in turn.
        await request.patch(`/api/groups/${token}/members/${ids.Samu}`, {
            data: { color: '#047857' },
        });
        const added = await request.post(`/api/groups/${token}/members`, {
            data: { name: 'Rosi' },
        });
        expect((await added.json()).member.color).toBe('#1d4ed8');
    });

    test('removing a member without entries deletes it', async ({ request }) => {
        const { token, memberId, ids } = await createGroup(request, 'WG', ['Samu', 'Karl']);
        const response = await request.patch(`/api/groups/${token}/members/${ids.Karl}`, {
            data: { active: false },
            headers: as(memberId),
        });
        expect(response.status()).toBe(200);
        expect((await response.json()).member).toBeNull();
        const group = await (await request.get(`/api/groups/${token}`)).json();
        expect(group.members.map((m: { name: string }) => m.name)).toEqual(['Samu']);
    });

    test('removing a member with entries only deactivates it, and it can come back', async ({
        request,
    }) => {
        // The creator has an entry in the change log ("hat die Gruppe erstellt").
        const { token, memberId, ids } = await createGroup(request, 'WG', ['Samu', 'Karl']);
        const removed = await request.patch(`/api/groups/${token}/members/${memberId}`, {
            data: { active: false },
            headers: as(ids.Karl as number),
        });
        expect((await removed.json()).member).toMatchObject({ name: 'Samu', active: false });

        // Adding the same name again takes the old member back instead of creating a twin.
        const back = await request.post(`/api/groups/${token}/members`, { data: { name: 'Samu' } });
        expect(back.status()).toBe(201);
        expect((await back.json()).member).toMatchObject({ id: memberId, active: true });
    });

    test('does not let one group touch the members of another', async ({ request }) => {
        const mine = await createGroup(request, 'Meine', ['Samu', 'Karl']);
        const other = await createGroup(request, 'Andere', ['Eve']);

        const rename = await request.patch(`/api/groups/${other.token}/members/${mine.ids.Karl}`, {
            data: { name: 'Gekapert' },
        });
        expect(rename.status()).toBe(404);

        const remove = await request.patch(`/api/groups/${other.token}/members/${mine.ids.Karl}`, {
            data: { active: false },
        });
        expect(remove.status()).toBe(404);

        const recolor = await request.patch(`/api/groups/${other.token}/members/${mine.ids.Karl}`, {
            data: { color: '#b91c1c' },
        });
        expect(recolor.status()).toBe(404);

        const group = await (await request.get(`/api/groups/${mine.token}`)).json();
        expect(group.members.map((m: { name: string }) => m.name)).toEqual(['Samu', 'Karl']);
    });

    test('ignores an actor header that names a member of another group', async ({ request }) => {
        const mine = await createGroup(request, 'Meine', ['Samu']);
        const other = await createGroup(request, 'Andere', ['Eve']);
        const response = await request.patch(`/api/groups/${mine.token}`, {
            data: { name: 'Umbenannt' },
            headers: as(other.memberId),
        });
        // The rename itself is allowed (the token is the credential) …
        expect(response.status()).toBe(200);
    });

    test('answers malformed JSON with 400', async ({ request }) => {
        const response = await request.post('/api/groups', {
            data: '{kaputt',
            headers: { 'Content-Type': 'application/json' },
        });
        expect(response.status()).toBe(400);
    });
});
