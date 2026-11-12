import { addMember, memberView, newMemberShape } from '../../../../../server/groups';
import { groupRoute, json, readJson } from '../../../../../server/http';

// POST /api/groups/:token/members: add a member.
export const POST = groupRoute(async ({ db, group, actorId, request }) => {
    const input = await readJson(request, newMemberShape);
    return json({ member: memberView(addMember(db, group, input.name, actorId)) }, 201);
});
