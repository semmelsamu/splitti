// Payments between two members: a transfer that was actually made, entered to
// even out balances. Deleting is done with a timestamp, like receipts.

import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { formatEuro } from '../core/money';
import { settle } from '../core/settle';
import type { PaymentDto, TransferDto } from '../shared/api-types';
import { groupBalances } from './balances';
import { logChange } from './changes';
import { type Db, schema } from './db';
import { getMember } from './groups';
import { type Group, invalid, notFound, nowIso } from './http';

const { payments } = schema;

export const paymentShape = z
  .object({
    from: z.number({ error: 'Es fehlt, wer gezahlt hat.' }).int().positive(),
    to: z.number({ error: 'Es fehlt, an wen gezahlt wurde.' }).int().positive(),
    amountCents: z
      .number({ error: 'Der Betrag fehlt.' })
      .int('Der Betrag muss ein ganzer Cent-Betrag sein.')
      .positive('Der Betrag muss größer als null sein.')
      .max(10_000_000, 'Der Betrag ist zu groß.'),
    date: z
      .string({ error: 'Das Datum fehlt.' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Das Datum ist ungültig.')
      .refine((value) => {
        const date = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
      }, 'Das Datum ist ungültig.'),
  })
  .refine((value) => value.from !== value.to, {
    message: 'Eine Zahlung an sich selbst gibt es nicht.',
  });

/** The fewest transfers that bring all balances of the group to zero. */
export function proposeSettlement(db: Db, group: Group): TransferDto[] {
  return settle(groupBalances(db, group.id));
}

export function createPayment(
  db: Db,
  group: Group,
  input: z.infer<typeof paymentShape>,
  actorId: number | null,
): number {
  // Both must be members of this group; ids from elsewhere do not exist here.
  let from: ReturnType<typeof getMember>;
  let to: ReturnType<typeof getMember>;
  try {
    from = getMember(db, group.id, input.from);
    to = getMember(db, group.id, input.to);
  } catch {
    throw invalid('Zahlende und Empfangende müssen zur Gruppe gehören.');
  }

  return db.transaction((tx) => {
    const payment = tx
      .insert(payments)
      .values({
        groupId: group.id,
        fromMember: from.id,
        toMember: to.id,
        amountCents: input.amountCents,
        date: input.date,
        createdBy: actorId,
        createdAt: nowIso(),
      })
      .returning({ id: payments.id })
      .get();
    logChange(tx, {
      groupId: group.id,
      memberId: actorId,
      entity: 'payment',
      entityId: payment.id,
      action: 'created',
      summary: `hat eine Zahlung eingetragen: ${from.name} an ${to.name}, ${formatEuro(input.amountCents)}`,
    });
    return payment.id;
  });
}

export function deletePayment(
  db: Db,
  group: Group,
  paymentId: number,
  actorId: number | null,
): void {
  const payment = db
    .select()
    .from(payments)
    .where(and(eq(payments.id, paymentId), eq(payments.groupId, group.id)))
    .get();
  if (!payment) throw notFound('Diese Zahlung gibt es in der Gruppe nicht.');
  if (payment.deletedAt) return;

  const from = getMember(db, group.id, payment.fromMember);
  const to = getMember(db, group.id, payment.toMember);
  db.transaction((tx) => {
    tx.update(payments).set({ deletedAt: nowIso() }).where(eq(payments.id, payment.id)).run();
    logChange(tx, {
      groupId: group.id,
      memberId: actorId,
      entity: 'payment',
      entityId: payment.id,
      action: 'deleted',
      summary: `hat die Zahlung von ${from.name} an ${to.name} über ${formatEuro(payment.amountCents)} gelöscht`,
    });
  });
}

/** All payments of the group, newest first, deleted ones included. */
export function listPayments(db: Db, group: Group): PaymentDto[] {
  return db
    .select()
    .from(payments)
    .where(eq(payments.groupId, group.id))
    .orderBy(desc(payments.date), desc(payments.id))
    .all()
    .map((row) => ({
      id: row.id,
      from: row.fromMember,
      to: row.toMember,
      amountCents: row.amountCents,
      date: row.date,
      createdAt: row.createdAt,
      deletedAt: row.deletedAt,
    }));
}
