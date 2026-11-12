// The change log of a group: who changed what and when. Because everybody with
// the link may change everything, every write leaves a line here.

import { desc, eq } from 'drizzle-orm';
import { type Db, schema } from './db';
import { nowIso } from './http';

export type ChangeEntity = 'group' | 'member' | 'receipt' | 'payment';

export interface NewChange {
  groupId: number;
  memberId: number | null;
  entity: ChangeEntity;
  entityId: number;
  /** Machine-readable kind of change, e.g. "created", "updated", "deleted", "restored". */
  action: string;
  /** German sentence without subject; the UI puts the member name in front. */
  summary: string;
}

/** Works on the database or inside a transaction. */
export function logChange(db: Pick<Db, 'insert'>, change: NewChange): void {
  db.insert(schema.changes)
    .values({ ...change, at: nowIso() })
    .run();
}

export function listChanges(db: Db, groupId: number, limit = 200) {
  return db
    .select({
      id: schema.changes.id,
      memberId: schema.changes.memberId,
      at: schema.changes.at,
      entity: schema.changes.entity,
      entityId: schema.changes.entityId,
      action: schema.changes.action,
      summary: schema.changes.summary,
    })
    .from(schema.changes)
    .where(eq(schema.changes.groupId, groupId))
    .orderBy(desc(schema.changes.id))
    .limit(limit)
    .all();
}
