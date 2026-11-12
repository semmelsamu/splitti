import { groupRoute, json, readJson } from '../../../../../server/http';
import { createPayment, paymentShape } from '../../../../../server/payments';

// POST /api/groups/:token/payments: enter a payment between two members.
export const POST = groupRoute(async ({ db, group, actorId, request }) => {
  const input = await readJson(request, paymentShape);
  return json({ id: createPayment(db, group, input, actorId) }, 201);
});
