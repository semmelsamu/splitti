import { groupBalances } from '../../../../server/balances';
import { listMembers, memberView, renameGroup, renameGroupShape } from '../../../../server/groups';
import { groupRoute, json, readJson } from '../../../../server/http';

// GET /api/groups/:token: the group, its members and their balances.
export const GET = groupRoute(({ db, group }) => {
    const balances = groupBalances(db, group.id);
    return json({
        group: { name: group.name, createdAt: group.createdAt },
        members: listMembers(db, group.id).map(memberView),
        balances: [...balances.entries()].map(([memberId, cents]) => ({ memberId, cents })),
    });
});

// PATCH /api/groups/:token: rename the group.
export const PATCH = groupRoute(async ({ db, group, actorId, request }) => {
    const input = await readJson(request, renameGroupShape);
    renameGroup(db, group, input.name, actorId);
    return json({ group: { name: input.name, createdAt: group.createdAt } });
});
