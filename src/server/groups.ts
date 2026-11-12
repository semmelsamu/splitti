// Groups and members. A group is reached only through its token; members are
// names with a colour, not accounts.

import { randomBytes } from 'node:crypto';
import { and, asc, eq, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { MEMBER_COLOR_VALUES, memberColorName, nextMemberColor } from '../shared/member-colors';
import { logChange } from './changes';
import { type Db, schema } from './db';
import { type Group, invalid, notFound, nowIso } from './http';

const { groups, members, receipts, shares, payments, changes } = schema;

export type Member = typeof members.$inferSelect;

const name = (what: string) =>
    z
        .string({ error: `${what} fehlt.` })
        .trim()
        .min(1, `${what} fehlt.`)
        .max(40, `${what} ist zu lang (höchstens 40 Zeichen).`);

export const newGroupShape = z.object({
    name: name('Der Name der Gruppe'),
    ownName: name('Dein Name'),
    members: z
        .array(name('Der Name eines Mitglieds'))
        .max(30, 'Das sind zu viele Mitglieder.')
        .default([]),
});

export const renameGroupShape = z.object({ name: name('Der Name der Gruppe') });

export const newMemberShape = z.object({ name: name('Der Name') });

export const updateMemberShape = z
    .object({
        name: name('Der Name').optional(),
        active: z.boolean().optional(),
        // Only the colours of the palette, no free choice.
        color: z
            .enum(MEMBER_COLOR_VALUES, { error: 'Diese Farbe steht nicht zur Auswahl.' })
            .optional(),
    })
    .refine(
        (value) =>
            value.name !== undefined || value.active !== undefined || value.color !== undefined,
        { message: 'Es wurde nichts zum Ändern angegeben.' },
    );

/** A long random code; the link with this code is the only key to the group. */
function newToken(): string {
    return randomBytes(24).toString('base64url');
}

function assertUniqueNames(names: readonly string[]): void {
    const seen = new Set<string>();
    for (const candidate of names) {
        const key = candidate.toLocaleLowerCase('de');
        if (seen.has(key)) throw invalid(`Der Name „${candidate}“ kommt doppelt vor.`);
        seen.add(key);
    }
}

export function createGroup(
    db: Db,
    input: z.infer<typeof newGroupShape>,
): { token: string; memberId: number } {
    const names = [input.ownName, ...input.members];
    assertUniqueNames(names);
    const now = nowIso();

    return db.transaction((tx) => {
        const token = newToken();
        const group = tx
            .insert(groups)
            .values({ name: input.name, token, createdAt: now })
            .returning()
            .get();
        const colors: string[] = [];
        const created = names.map((memberName) => {
            const color = nextMemberColor(colors);
            colors.push(color);
            return tx
                .insert(members)
                .values({
                    groupId: group.id,
                    name: memberName,
                    color,
                    active: true,
                    createdAt: now,
                })
                .returning()
                .get();
        });
        const creator = created[0] as Member;
        logChange(tx, {
            groupId: group.id,
            memberId: creator.id,
            entity: 'group',
            entityId: group.id,
            action: 'created',
            summary: 'hat die Gruppe erstellt',
        });
        return { token, memberId: creator.id };
    });
}

export function listMembers(db: Db, groupId: number): Member[] {
    return db
        .select()
        .from(members)
        .where(eq(members.groupId, groupId))
        .orderBy(asc(members.id))
        .all();
}

/** A member of this group, or a 404: ids from other groups do not exist here. */
export function getMember(db: Db, groupId: number, memberId: number): Member {
    const member = db
        .select()
        .from(members)
        .where(and(eq(members.id, memberId), eq(members.groupId, groupId)))
        .get();
    if (!member) throw notFound('Dieses Mitglied gibt es in der Gruppe nicht.');
    return member;
}

export function renameGroup(db: Db, group: Group, newName: string, actorId: number | null): void {
    if (newName === group.name) return;
    db.transaction((tx) => {
        tx.update(groups).set({ name: newName }).where(eq(groups.id, group.id)).run();
        logChange(tx, {
            groupId: group.id,
            memberId: actorId,
            entity: 'group',
            entityId: group.id,
            action: 'renamed',
            summary: `hat die Gruppe in „${newName}“ umbenannt`,
        });
    });
}

export function addMember(
    db: Db,
    group: Group,
    memberName: string,
    actorId: number | null,
): Member {
    const existing = listMembers(db, group.id);
    const sameName = existing.find(
        (member) => member.name.toLocaleLowerCase('de') === memberName.toLocaleLowerCase('de'),
    );
    if (sameName?.active) throw invalid(`„${memberName}“ gibt es in der Gruppe schon.`);

    return db.transaction((tx) => {
        // Someone who was removed and comes back gets their old entries back.
        if (sameName) {
            tx.update(members).set({ active: true }).where(eq(members.id, sameName.id)).run();
            logChange(tx, {
                groupId: group.id,
                memberId: actorId ?? sameName.id,
                entity: 'member',
                entityId: sameName.id,
                action: 'reactivated',
                summary: `hat „${sameName.name}“ wieder aufgenommen`,
            });
            return { ...sameName, active: true };
        }

        const member = tx
            .insert(members)
            .values({
                groupId: group.id,
                name: memberName,
                color: nextMemberColor(existing.map((other) => other.color)),
                active: true,
                createdAt: nowIso(),
            })
            .returning()
            .get();
        logChange(tx, {
            groupId: group.id,
            // Someone who adds themselves has no identity yet; the entry is theirs.
            memberId: actorId ?? member.id,
            entity: 'member',
            entityId: member.id,
            action: 'created',
            summary:
                actorId === null
                    ? 'ist der Gruppe beigetreten'
                    : `hat „${member.name}“ hinzugefügt`,
        });
        return member;
    });
}

/** Does anything in the group still refer to this member? */
function hasEntries(db: Pick<Db, 'select'>, memberId: number): boolean {
    const count = (query: { get(): { n: number } | undefined }) => query.get()?.n ?? 0;
    const n = sql<number>`count(*)`.as('n');
    return (
        count(
            db
                .select({ n })
                .from(receipts)
                .where(or(eq(receipts.paidBy, memberId), eq(receipts.createdBy, memberId))),
        ) > 0 ||
        count(db.select({ n }).from(shares).where(eq(shares.memberId, memberId))) > 0 ||
        count(
            db
                .select({ n })
                .from(payments)
                .where(
                    or(
                        eq(payments.fromMember, memberId),
                        eq(payments.toMember, memberId),
                        eq(payments.createdBy, memberId),
                    ),
                ),
        ) > 0 ||
        count(db.select({ n }).from(changes).where(eq(changes.memberId, memberId))) > 0
    );
}

export interface MemberUpdateResult {
    /** The member after the change, or null if it was deleted for good. */
    member: Member | null;
}

/**
 * Renames, recolours, removes or re-admits a member. Removing deletes a member that has
 * no entries at all; a member with entries is only deactivated, so that old
 * receipts and balances stay correct.
 */
export function updateMember(
    db: Db,
    group: Group,
    memberId: number,
    input: z.infer<typeof updateMemberShape>,
    actorId: number | null,
): MemberUpdateResult {
    const member = getMember(db, group.id, memberId);

    return db.transaction((tx) => {
        let current: Member = member;

        if (input.name !== undefined && input.name !== member.name) {
            const newName = input.name;
            const taken = listMembers(db, group.id).some(
                (other) =>
                    other.id !== member.id &&
                    other.name.toLocaleLowerCase('de') === newName.toLocaleLowerCase('de'),
            );
            if (taken) throw invalid(`„${newName}“ gibt es in der Gruppe schon.`);
            tx.update(members).set({ name: newName }).where(eq(members.id, member.id)).run();
            logChange(tx, {
                groupId: group.id,
                memberId: actorId,
                entity: 'member',
                entityId: member.id,
                action: 'renamed',
                summary: `hat „${member.name}“ in „${newName}“ umbenannt`,
            });
            current = { ...current, name: newName };
        }

        if (input.color !== undefined && input.color !== member.color) {
            tx.update(members).set({ color: input.color }).where(eq(members.id, member.id)).run();
            logChange(tx, {
                groupId: group.id,
                memberId: actorId,
                entity: 'member',
                entityId: member.id,
                action: 'recolored',
                summary: `hat die Farbe von „${current.name}“ auf ${memberColorName(input.color)} geändert`,
            });
            current = { ...current, color: input.color };
        }

        if (input.active === false && current.active) {
            // The actor's own log entries count as entries, so check before logging.
            if (!hasEntries(tx, member.id) && actorId !== member.id) {
                tx.delete(members).where(eq(members.id, member.id)).run();
                logChange(tx, {
                    groupId: group.id,
                    memberId: actorId,
                    entity: 'member',
                    entityId: member.id,
                    action: 'deleted',
                    summary: `hat „${current.name}“ entfernt`,
                });
                return { member: null };
            }
            tx.update(members).set({ active: false }).where(eq(members.id, member.id)).run();
            logChange(tx, {
                groupId: group.id,
                memberId: actorId,
                entity: 'member',
                entityId: member.id,
                action: 'deactivated',
                summary: `hat „${current.name}“ entfernt`,
            });
            current = { ...current, active: false };
        } else if (input.active === true && !current.active) {
            tx.update(members).set({ active: true }).where(eq(members.id, member.id)).run();
            logChange(tx, {
                groupId: group.id,
                memberId: actorId,
                entity: 'member',
                entityId: member.id,
                action: 'reactivated',
                summary: `hat „${current.name}“ wieder aufgenommen`,
            });
            current = { ...current, active: true };
        }

        return { member: current };
    });
}

/** What the client gets to know about a member. */
export function memberView(member: Member) {
    return { id: member.id, name: member.name, color: member.color, active: member.active };
}
