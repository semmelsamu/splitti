import { groupRoute, json } from '../../../../../server/http';
import { scanReceipt } from '../../../../../server/scan';

// POST /api/groups/:token/scan: upload a receipt photo (the image itself is the
// request body). Answers with the recognised positions as a draft and a handle
// for the image; no receipt is saved yet.
export const POST = groupRoute(async ({ group, request }) => {
  return json(await scanReceipt(group.id, request));
});
