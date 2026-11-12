import { groupRoute, idParam, json } from '../../../../../../server/http';
import { getReceipt, restoreReceipt } from '../../../../../../server/receipts';

// POST /api/groups/:token/receipts/:id/restore: bring a deleted receipt back.
export const POST = groupRoute(({ db, group, actorId, params }) => {
    const id = idParam(params.id);
    restoreReceipt(db, group, id, actorId);
    return json(getReceipt(db, group, id));
});
