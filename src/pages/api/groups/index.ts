import { getDb } from '../../../server/db';
import { createGroup, newGroupShape } from '../../../server/groups';
import { json, readJson, route } from '../../../server/http';

// POST /api/groups: create a group with its name, the creator's own name and
// further members. Answers with the link code and the creator's member id.
export const POST = route(async ({ request }) => {
  const input = await readJson(request, newGroupShape);
  return json(createGroup(getDb(), input), 201);
});
