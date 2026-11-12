import { groupRoute, json } from '../../../../server/http';
import { proposeSettlement } from '../../../../server/payments';

// GET /api/groups/:token/settlement: the fewest transfers that settle all balances.
export const GET = groupRoute(({ db, group }) => {
    return json({ transfers: proposeSettlement(db, group) });
});
