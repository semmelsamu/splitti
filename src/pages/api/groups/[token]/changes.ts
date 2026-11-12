import { listChanges } from '../../../../server/changes';
import { groupRoute, json } from '../../../../server/http';
import { listPayments } from '../../../../server/payments';
import type { HistoryDto } from '../../../../shared/api-types';

// GET /api/groups/:token/changes: the change log of the group, newest first.
// The payments come along, because the log is where a payment is deleted again
// (the plan's API table has no separate list of payments).
export const GET = groupRoute(({ db, group }) => {
  const history: HistoryDto = {
    changes: listChanges(db, group.id),
    payments: listPayments(db, group),
  };
  return json(history);
});
