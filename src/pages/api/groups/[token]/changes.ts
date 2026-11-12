import { listChanges } from '../../../../server/changes';
import { groupRoute, json } from '../../../../server/http';

// GET /api/groups/:token/changes: the change log of the group, newest first.
export const GET = groupRoute(({ db, group }) => {
  return json({ changes: listChanges(db, group.id) });
});
