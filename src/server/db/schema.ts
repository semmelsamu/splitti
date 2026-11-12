import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// Seven tables as laid out in docs/PLAN.md ("Datenbankschema").
// Money is always integer cents. Timestamps are ISO-8601 strings in UTC,
// calendar dates are YYYY-MM-DD strings.

export const groups = sqliteTable('groups', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    token: text('token').notNull().unique(),
    createdAt: text('created_at').notNull(),
});

export const members = sqliteTable(
    'members',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        groupId: integer('group_id')
            .notNull()
            .references(() => groups.id),
        name: text('name').notNull(),
        color: text('color').notNull(),
        active: integer('active', { mode: 'boolean' }).notNull().default(true),
        createdAt: text('created_at').notNull(),
    },
    (t) => [index('members_group_idx').on(t.groupId)],
);

export const receipts = sqliteTable(
    'receipts',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        groupId: integer('group_id')
            .notNull()
            .references(() => groups.id),
        paidBy: integer('paid_by')
            .notNull()
            .references(() => members.id),
        date: text('date').notNull(),
        merchant: text('merchant').notNull(),
        detectedTotalCents: integer('detected_total_cents'),
        imagePath: text('image_path'),
        source: text('source', { enum: ['scan', 'manual'] }).notNull(),
        createdBy: integer('created_by').references(() => members.id),
        createdAt: text('created_at').notNull(),
        deletedAt: text('deleted_at'),
    },
    (t) => [index('receipts_group_idx').on(t.groupId)],
);

export const items = sqliteTable(
    'items',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        receiptId: integer('receipt_id')
            .notNull()
            .references(() => receipts.id, { onDelete: 'cascade' }),
        label: text('label').notNull(),
        amountCents: integer('amount_cents').notNull(),
        kind: text('kind', { enum: ['item', 'deposit', 'discount'] }).notNull(),
        position: integer('position').notNull(),
    },
    (t) => [index('items_receipt_idx').on(t.receiptId)],
);

export const shares = sqliteTable(
    'shares',
    {
        itemId: integer('item_id')
            .notNull()
            .references(() => items.id, { onDelete: 'cascade' }),
        memberId: integer('member_id')
            .notNull()
            .references(() => members.id),
    },
    (t) => [primaryKey({ columns: [t.itemId, t.memberId] })],
);

export const payments = sqliteTable(
    'payments',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        groupId: integer('group_id')
            .notNull()
            .references(() => groups.id),
        fromMember: integer('from_member')
            .notNull()
            .references(() => members.id),
        toMember: integer('to_member')
            .notNull()
            .references(() => members.id),
        amountCents: integer('amount_cents').notNull(),
        date: text('date').notNull(),
        createdBy: integer('created_by').references(() => members.id),
        createdAt: text('created_at').notNull(),
        deletedAt: text('deleted_at'),
    },
    (t) => [index('payments_group_idx').on(t.groupId)],
);

export const changes = sqliteTable(
    'changes',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        groupId: integer('group_id')
            .notNull()
            .references(() => groups.id),
        memberId: integer('member_id').references(() => members.id),
        at: text('at').notNull(),
        entity: text('entity', { enum: ['group', 'member', 'receipt', 'payment'] }).notNull(),
        entityId: integer('entity_id').notNull(),
        action: text('action').notNull(),
        summary: text('summary').notNull(),
    },
    (t) => [index('changes_group_idx').on(t.groupId, t.id)],
);
