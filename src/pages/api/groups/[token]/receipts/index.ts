import { groupRoute, json, readJson } from '../../../../../server/http';
import { createReceipt, listReceipts, receiptShape } from '../../../../../server/receipts';

// GET /api/groups/:token/receipts: all receipts of the group, newest first,
// deleted ones included (marked by deletedAt).
export const GET = groupRoute(({ db, group }) => {
    return json({ receipts: listReceipts(db, group) });
});

// POST /api/groups/:token/receipts: save a receipt with positions and shares.
export const POST = groupRoute(async ({ db, group, actorId, request }) => {
    const input = await readJson(request, receiptShape);
    return json({ id: createReceipt(db, group, input, actorId) }, 201);
});
