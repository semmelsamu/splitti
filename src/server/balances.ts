// Collects what the calculation core needs from the database. All arithmetic
// happens in src/core; this file only reads rows.

import { and, asc, eq, isNull } from 'drizzle-orm';
import { type BalancePayment, type BalanceReceipt, computeBalances } from '../core/balances';
import type { SplitItem } from '../core/split';
import { type Db, schema } from './db';

const { receipts, items, shares, payments, members } = schema;

/**
 * Running number of each receipt within its group, starting at 0 and counting
 * deleted receipts too, so that a receipt keeps its number for good. The
 * number decides who gets the odd cent (see splitReceipt).
 */
export function receiptRotations(db: Db, groupId: number): Map<number, number> {
    const rows = db
        .select({ id: receipts.id })
        .from(receipts)
        .where(eq(receipts.groupId, groupId))
        .orderBy(asc(receipts.id))
        .all();
    return new Map(rows.map((row, index) => [row.id, index]));
}

/** Positions with their members for all receipts of the group that are not deleted. */
export function splitItemsByReceipt(db: Db, groupId: number): Map<number, SplitItem[]> {
    const itemRows = db
        .select({ id: items.id, receiptId: items.receiptId, amountCents: items.amountCents })
        .from(items)
        .innerJoin(receipts, eq(items.receiptId, receipts.id))
        .where(and(eq(receipts.groupId, groupId), isNull(receipts.deletedAt)))
        .orderBy(asc(items.receiptId), asc(items.position))
        .all();
    const shareRows = db
        .select({ itemId: shares.itemId, memberId: shares.memberId })
        .from(shares)
        .innerJoin(items, eq(shares.itemId, items.id))
        .innerJoin(receipts, eq(items.receiptId, receipts.id))
        .where(and(eq(receipts.groupId, groupId), isNull(receipts.deletedAt)))
        .all();

    const membersByItem = new Map<number, number[]>();
    for (const row of shareRows) {
        const list = membersByItem.get(row.itemId);
        if (list) list.push(row.memberId);
        else membersByItem.set(row.itemId, [row.memberId]);
    }

    const byReceipt = new Map<number, SplitItem[]>();
    for (const row of itemRows) {
        const item = { amountCents: row.amountCents, memberIds: membersByItem.get(row.id) ?? [] };
        const list = byReceipt.get(row.receiptId);
        if (list) list.push(item);
        else byReceipt.set(row.receiptId, [item]);
    }
    return byReceipt;
}

/** Balance of every member of the group in cents; positive means the group owes them. */
export function groupBalances(db: Db, groupId: number): Map<number, number> {
    const memberIds = db
        .select({ id: members.id })
        .from(members)
        .where(eq(members.groupId, groupId))
        .orderBy(asc(members.id))
        .all()
        .map((row) => row.id);

    const rotations = receiptRotations(db, groupId);
    const itemsByReceipt = splitItemsByReceipt(db, groupId);
    const receiptRows = db
        .select({ id: receipts.id, paidBy: receipts.paidBy })
        .from(receipts)
        .where(and(eq(receipts.groupId, groupId), isNull(receipts.deletedAt)))
        .all();
    const balanceReceipts: BalanceReceipt[] = receiptRows.map((row) => ({
        paidBy: row.paidBy,
        items: itemsByReceipt.get(row.id) ?? [],
        rotation: rotations.get(row.id) ?? 0,
    }));

    const balancePayments: BalancePayment[] = db
        .select({
            from: payments.fromMember,
            to: payments.toMember,
            amountCents: payments.amountCents,
        })
        .from(payments)
        .where(and(eq(payments.groupId, groupId), isNull(payments.deletedAt)))
        .all();

    return computeBalances(memberIds, balanceReceipts, balancePayments);
}
