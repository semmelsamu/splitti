import { type APIRequestContext, expect } from '@playwright/test';

export interface TestGroup {
    token: string;
    /** Member id of the creator. */
    memberId: number;
    /** Member ids by name. */
    ids: Record<string, number>;
}

/** Creates a group through the API. The first name is the creator. */
export async function createGroup(
    request: APIRequestContext,
    name = 'WG',
    names: string[] = ['Samu', 'Karl', 'Rosi', 'Toni'],
): Promise<TestGroup> {
    const [ownName, ...members] = names;
    const response = await request.post('/api/groups', { data: { name, ownName, members } });
    expect(response.status()).toBe(201);
    const { token, memberId } = await response.json();
    const group = await (await request.get(`/api/groups/${token}`)).json();
    const ids: Record<string, number> = {};
    for (const member of group.members) ids[member.name] = member.id;
    return { token, memberId, ids };
}

/** Header that tells the server which member a request acts as. */
export function as(memberId: number): { 'X-Splitti-Member': string } {
    return { 'X-Splitti-Member': String(memberId) };
}
