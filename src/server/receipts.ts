// Receipts with their positions and shares. A manual entry is a receipt with a
// single position, so scanned and manual costs take the same path.
//
// Every function takes the group and checks that receipts, positions and
// members belong to it; an id from another group is treated as not existing.

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { formatEuro } from '../core/money';
import { splitReceipt } from '../core/split';
import type { ChangeDto, ItemDto, ReceiptDetailDto, ReceiptSummaryDto } from '../shared/api-types';
import { receiptRotations } from './balances';
import { logChange } from './changes';
import { type Db, schema } from './db';
import { listMembers } from './groups';
import { ApiError, type Group, invalid, notFound, nowIso } from './http';
import { adoptDraftImage } from './images';

const { receipts, items, shares, changes } = schema;

type ReceiptRow = typeof receipts.$inferSelect;

const isoDate = z
    .string({ error: 'Das Datum fehlt.' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Das Datum ist ungültig.')
    .refine((value) => {
        const date = new Date(`${value}T00:00:00Z`);
        return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
    }, 'Das Datum ist ungültig.');

const cents = (what: string) =>
    z
        .number({ error: `${what} fehlt.` })
        .int(`${what} muss ein ganzer Cent-Betrag sein.`)
        .min(-10_000_000, `${what} ist zu groß.`)
        .max(10_000_000, `${what} ist zu groß.`);

const itemShape = z.object({
    id: z.number().int().positive().optional(),
    label: z
        .string({ error: 'Die Bezeichnung einer Position fehlt.' })
        .trim()
        .min(1, 'Die Bezeichnung einer Position fehlt.')
        .max(80, 'Die Bezeichnung einer Position ist zu lang (höchstens 80 Zeichen).'),
    amountCents: cents('Der Betrag einer Position').refine(
        (value) => value !== 0,
        'Eine Position hat noch keinen Preis.',
    ),
    kind: z.enum(['item', 'deposit', 'discount'], {
        error: 'Die Art einer Position ist ungültig.',
    }),
    memberIds: z
        .array(z.number().int().positive(), { error: 'Die Zuordnung einer Position fehlt.' })
        .min(1, 'Jede Position braucht mindestens eine Person.'),
});

export const receiptShape = z.object({
    paidBy: z.number({ error: 'Es fehlt, wer bezahlt hat.' }).int().positive(),
    date: isoDate,
    merchant: z
        .string({ error: 'Die Bezeichnung fehlt.' })
        .trim()
        .min(1, 'Die Bezeichnung fehlt.')
        .max(60, 'Die Bezeichnung ist zu lang (höchstens 60 Zeichen).'),
    source: z.enum(['scan', 'manual']),
    detectedTotalCents: cents('Die Zettelsumme').nullable().default(null),
    imageId: z.string().nullable().optional(),
    items: z
        .array(itemShape, { error: 'Der Beleg hat keine Positionen.' })
        .min(1, 'Der Beleg hat keine Positionen.')
        .max(300, 'Der Beleg hat zu viele Positionen.'),
});

export type ReceiptInputData = z.infer<typeof receiptShape>;

/** The receipt with this id in this group, deleted or not; otherwise a 404. */
function getReceiptRow(db: Db, group: Group, receiptId: number): ReceiptRow {
    const row = db
        .select()
        .from(receipts)
        .where(and(eq(receipts.id, receiptId), eq(receipts.groupId, group.id)))
        .get();
    if (!row) throw notFound('Diesen Beleg gibt es in der Gruppe nicht.');
    return row;
}

/** Payer and everyone with a share must be members of this group. */
function assertMembersOfGroup(db: Db, group: Group, input: ReceiptInputData): void {
    const known = new Set(listMembers(db, group.id).map((member) => member.id));
    if (!known.has(input.paidBy)) throw invalid('Wer bezahlt hat, gehört nicht zur Gruppe.');
    for (const item of input.items) {
        for (const memberId of item.memberIds) {
            if (!known.has(memberId)) {
                throw invalid(
                    `Bei „${item.label}“ ist jemand ausgewählt, der nicht zur Gruppe gehört.`,
                );
            }
        }
    }
}

function insertItems(
    tx: Pick<Db, 'insert'>,
    receiptId: number,
    list: ReceiptInputData['items'],
    firstPosition = 0,
): void {
    list.forEach((item, index) => {
        const row = tx
            .insert(items)
            .values({
                receiptId,
                label: item.label,
                amountCents: item.amountCents,
                kind: item.kind,
                position: firstPosition + index,
            })
            .returning({ id: items.id })
            .get();
        for (const memberId of new Set(item.memberIds)) {
            tx.insert(shares).values({ itemId: row.id, memberId }).run();
        }
    });
}

export function createReceipt(
    db: Db,
    group: Group,
    input: ReceiptInputData,
    actorId: number | null,
): number {
    assertMembersOfGroup(db, group, input);
    // The image is moved first: if that fails, nothing is written to the database.
    const imagePath = input.imageId ? adoptDraftImage(group.id, input.imageId) : null;

    return db.transaction((tx) => {
        const receipt = tx
            .insert(receipts)
            .values({
                groupId: group.id,
                paidBy: input.paidBy,
                date: input.date,
                merchant: input.merchant,
                detectedTotalCents: input.detectedTotalCents,
                imagePath,
                source: input.source,
                createdBy: actorId,
                createdAt: nowIso(),
            })
            .returning({ id: receipts.id })
            .get();
        insertItems(tx, receipt.id, input.items);
        logChange(tx, {
            groupId: group.id,
            memberId: actorId,
            entity: 'receipt',
            entityId: receipt.id,
            action: 'created',
            summary: 'hat den Beleg angelegt',
        });
        return receipt.id;
    });
}

interface StoredItem extends ItemDto {
    position: number;
}

function loadItems(db: Db, receiptIds: readonly number[]): Map<number, StoredItem[]> {
    const result = new Map<number, StoredItem[]>();
    if (receiptIds.length === 0) return result;
    const rows = db
        .select()
        .from(items)
        .where(inArray(items.receiptId, [...receiptIds]))
        .orderBy(asc(items.receiptId), asc(items.position), asc(items.id))
        .all();
    const shareRows =
        rows.length === 0
            ? []
            : db
                  .select()
                  .from(shares)
                  .where(
                      inArray(
                          shares.itemId,
                          rows.map((row) => row.id),
                      ),
                  )
                  .orderBy(asc(shares.memberId))
                  .all();
    const membersByItem = new Map<number, number[]>();
    for (const share of shareRows) {
        const list = membersByItem.get(share.itemId);
        if (list) list.push(share.memberId);
        else membersByItem.set(share.itemId, [share.memberId]);
    }
    for (const row of rows) {
        const item: StoredItem = {
            id: row.id,
            label: row.label,
            amountCents: row.amountCents,
            kind: row.kind,
            memberIds: membersByItem.get(row.id) ?? [],
            position: row.position,
        };
        const list = result.get(row.receiptId);
        if (list) list.push(item);
        else result.set(row.receiptId, [item]);
    }
    return result;
}

function summary(row: ReceiptRow, list: readonly ItemDto[]): ReceiptSummaryDto {
    return {
        id: row.id,
        merchant: row.merchant,
        date: row.date,
        source: row.source,
        paidBy: row.paidBy,
        totalCents: list.reduce((sum, item) => sum + item.amountCents, 0),
        hasImage: row.imagePath !== null,
        createdAt: row.createdAt,
        deletedAt: row.deletedAt,
    };
}

/** All receipts of the group, newest first, including deleted ones. */
export function listReceipts(db: Db, group: Group): ReceiptSummaryDto[] {
    const rows = db
        .select()
        .from(receipts)
        .where(eq(receipts.groupId, group.id))
        .orderBy(desc(receipts.date), desc(receipts.id))
        .all();
    const itemsByReceipt = loadItems(
        db,
        rows.map((row) => row.id),
    );
    return rows.map((row) => summary(row, itemsByReceipt.get(row.id) ?? []));
}

export function getReceipt(db: Db, group: Group, receiptId: number): ReceiptDetailDto {
    const row = getReceiptRow(db, group, receiptId);
    const list = (loadItems(db, [row.id]).get(row.id) ?? []).map(
        ({ position: _position, ...item }) => item,
    );
    const rotation = receiptRotations(db, group.id).get(row.id) ?? 0;
    const split = splitReceipt(list, rotation);
    const history: ChangeDto[] = db
        .select({
            id: changes.id,
            memberId: changes.memberId,
            at: changes.at,
            entity: changes.entity,
            entityId: changes.entityId,
            action: changes.action,
            summary: changes.summary,
        })
        .from(changes)
        .where(
            and(
                eq(changes.groupId, group.id),
                eq(changes.entity, 'receipt'),
                eq(changes.entityId, row.id),
            ),
        )
        .orderBy(asc(changes.id))
        .all();

    return {
        ...summary(row, list),
        detectedTotalCents: row.detectedTotalCents,
        items: list,
        shares: [...split.entries()].map(([memberId, cents]) => ({ memberId, cents })),
        history,
    };
}

/** Path of the receipt's image relative to the data directory. */
export function receiptImagePath(db: Db, group: Group, receiptId: number): string {
    const row = getReceiptRow(db, group, receiptId);
    if (!row.imagePath) throw notFound('Zu diesem Beleg gibt es kein Zettelbild.');
    return row.imagePath;
}

const sameMembers = (a: readonly number[], b: readonly number[]): boolean => {
    const left = [...new Set(a)].sort((x, y) => x - y);
    const right = [...new Set(b)].sort((x, y) => x - y);
    return left.length === right.length && left.every((value, index) => value === right[index]);
};

const quote = (label: string) => `„${label}“`;

/** One sentence per kind of change; many changes of a kind are counted instead of listed. */
function sentences(names: string[], one: (name: string) => string, many: (n: number) => string) {
    if (names.length === 0) return [];
    if (names.length > 3) return [many(names.length)];
    return names.map(one);
}

export function updateReceipt(
    db: Db,
    group: Group,
    receiptId: number,
    input: ReceiptInputData,
    actorId: number | null,
): void {
    const row = getReceiptRow(db, group, receiptId);
    if (row.deletedAt) {
        throw new ApiError(
            409,
            'deleted',
            'Dieser Beleg ist gelöscht. Stelle ihn wieder her, bevor du ihn änderst.',
        );
    }
    assertMembersOfGroup(db, group, input);

    const before = loadItems(db, [row.id]).get(row.id) ?? [];
    const beforeById = new Map(before.map((item) => [item.id, item]));
    for (const item of input.items) {
        if (item.id !== undefined && !beforeById.has(item.id)) {
            throw invalid(`Die Position „${item.label}“ gehört nicht zu diesem Beleg.`);
        }
    }
    const memberNames = new Map(
        listMembers(db, group.id).map((member) => [member.id, member.name]),
    );

    // What changed, in words for the change log.
    const lines: string[] = [];
    if (input.merchant !== row.merchant) {
        lines.push(`hat den Beleg in ${quote(input.merchant)} umbenannt`);
    }
    if (input.date !== row.date) {
        const [year, month, day] = input.date.split('-');
        lines.push(`hat das Datum auf ${day}.${month}.${year} geändert`);
    }
    if (input.paidBy !== row.paidBy) {
        lines.push(
            `hat „Bezahlt von“ von ${memberNames.get(row.paidBy) ?? '?'} auf ${
                memberNames.get(input.paidBy) ?? '?'
            } geändert`,
        );
    }
    const keptIds = new Set(
        input.items.flatMap((item) => (item.id === undefined ? [] : [item.id])),
    );
    const renamed: string[] = [];
    const repriced: string[] = [];
    const reassigned: string[] = [];
    const added: string[] = [];
    for (const item of input.items) {
        const old = item.id === undefined ? undefined : beforeById.get(item.id);
        if (!old) {
            added.push(item.label);
            continue;
        }
        if (old.label !== item.label) renamed.push(`${quote(old.label)} in ${quote(item.label)}`);
        if (old.amountCents !== item.amountCents) {
            repriced.push(
                `${quote(item.label)} von ${formatEuro(old.amountCents)} auf ${formatEuro(item.amountCents)}`,
            );
        }
        if (!sameMembers(old.memberIds, item.memberIds)) reassigned.push(item.label);
    }
    const removed = before.filter((item) => !keptIds.has(item.id)).map((item) => item.label);

    lines.push(
        ...sentences(
            renamed,
            (text) => `hat ${text} umbenannt`,
            (n) => `hat ${n} Positionen umbenannt`,
        ),
        ...sentences(
            repriced,
            (text) => `hat den Preis von ${text} geändert`,
            (n) => `hat den Preis von ${n} Positionen geändert`,
        ),
        ...sentences(
            reassigned,
            (label) => `hat ${quote(label)} neu zugeordnet`,
            (n) => `hat ${n} Positionen neu zugeordnet`,
        ),
        ...sentences(
            added,
            (label) => `hat ${quote(label)} hinzugefügt`,
            (n) => `hat ${n} Positionen hinzugefügt`,
        ),
        ...sentences(
            removed,
            (label) => `hat ${quote(label)} gelöscht`,
            (n) => `hat ${n} Positionen gelöscht`,
        ),
    );
    const reordered =
        lines.length === 0 &&
        input.items.some((item, index) => beforeById.get(item.id ?? -1)?.position !== index);
    if (lines.length === 0 && !reordered && input.detectedTotalCents === row.detectedTotalCents) {
        return; // Nothing changed: no write, no log entry.
    }

    db.transaction((tx) => {
        tx.update(receipts)
            .set({
                paidBy: input.paidBy,
                date: input.date,
                merchant: input.merchant,
                detectedTotalCents: input.detectedTotalCents,
            })
            .where(eq(receipts.id, row.id))
            .run();

        // Positions that are gone; their shares go with them (cascade).
        for (const item of before) {
            if (!keptIds.has(item.id)) tx.delete(items).where(eq(items.id, item.id)).run();
        }
        input.items.forEach((item, position) => {
            if (item.id === undefined) {
                insertItems(tx, row.id, [item], position);
                return;
            }
            tx.update(items)
                .set({
                    label: item.label,
                    amountCents: item.amountCents,
                    kind: item.kind,
                    position,
                })
                .where(eq(items.id, item.id))
                .run();
            tx.delete(shares).where(eq(shares.itemId, item.id)).run();
            for (const memberId of new Set(item.memberIds)) {
                tx.insert(shares).values({ itemId: item.id, memberId }).run();
            }
        });

        for (const line of lines) {
            logChange(tx, {
                groupId: group.id,
                memberId: actorId,
                entity: 'receipt',
                entityId: row.id,
                action: 'updated',
                summary: line,
            });
        }
    });
}

/** Marks the receipt as deleted; it no longer counts but can be restored. */
export function deleteReceipt(
    db: Db,
    group: Group,
    receiptId: number,
    actorId: number | null,
): void {
    const row = getReceiptRow(db, group, receiptId);
    if (row.deletedAt) return;
    db.transaction((tx) => {
        tx.update(receipts).set({ deletedAt: nowIso() }).where(eq(receipts.id, row.id)).run();
        logChange(tx, {
            groupId: group.id,
            memberId: actorId,
            entity: 'receipt',
            entityId: row.id,
            action: 'deleted',
            summary: 'hat den Beleg gelöscht',
        });
    });
}

export function restoreReceipt(
    db: Db,
    group: Group,
    receiptId: number,
    actorId: number | null,
): void {
    const row = getReceiptRow(db, group, receiptId);
    if (!row.deletedAt) return;
    db.transaction((tx) => {
        tx.update(receipts).set({ deletedAt: null }).where(eq(receipts.id, row.id)).run();
        logChange(tx, {
            groupId: group.id,
            memberId: actorId,
            entity: 'receipt',
            entityId: row.id,
            action: 'restored',
            summary: 'hat den Beleg wiederhergestellt',
        });
    });
}
