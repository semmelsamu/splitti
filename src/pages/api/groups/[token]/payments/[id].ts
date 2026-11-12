import { groupRoute, idParam, json } from '../../../../../server/http';
import { deletePayment } from '../../../../../server/payments';

// DELETE /api/groups/:token/payments/:id: delete a payment.
export const DELETE = groupRoute(({ db, group, actorId, params }) => {
  deletePayment(db, group, idParam(params.id), actorId);
  return json({ ok: true });
});
