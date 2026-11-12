import { memberView, updateMember, updateMemberShape } from '../../../../../server/groups';
import { groupRoute, idParam, json, readJson } from '../../../../../server/http';

// PATCH /api/groups/:token/members/:id: rename a member, remove it or take it back.
// Removing deletes a member without any entries and deactivates one with entries.
export const PATCH = groupRoute(async ({ db, group, actorId, request, params }) => {
    const input = await readJson(request, updateMemberShape);
    const { member } = updateMember(db, group, idParam(params.id), input, actorId);
    return json({ member: member ? memberView(member) : null });
});
