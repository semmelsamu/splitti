import { groupRoute, idParam, json, readJson } from '../../../../../../server/http';
import {
    deleteReceipt,
    getReceipt,
    receiptShape,
    updateReceipt,
} from '../../../../../../server/receipts';

// GET /api/groups/:token/receipts/:id: the receipt with positions, shares and history.
export const GET = groupRoute(({ db, group, params }) => {
    return json(getReceipt(db, group, idParam(params.id)));
});

// PUT /api/groups/:token/receipts/:id: change the receipt.
export const PUT = groupRoute(async ({ db, group, actorId, request, params }) => {
    const id = idParam(params.id);
    const input = await readJson(request, receiptShape);
    updateReceipt(db, group, id, input, actorId);
    return json(getReceipt(db, group, id));
});

// DELETE /api/groups/:token/receipts/:id: delete the receipt; it can be restored.
export const DELETE = groupRoute(({ db, group, actorId, params }) => {
    deleteReceipt(db, group, idParam(params.id), actorId);
    return json({ ok: true });
});
