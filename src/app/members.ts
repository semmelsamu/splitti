// Member lists of a group and the texts built from them.

import type { MemberDto, ReceiptSummaryDto } from '../shared/api-types';
import { formatShortDate } from './format';
import type { GroupState } from './group';

/** Members to offer for a position: the active ones plus anyone already selected. */
export function selectableMembers(group: GroupState, selected: readonly number[]): MemberDto[] {
    const wanted = new Set(selected);
    const list = group.members.filter((member) => member.active || wanted.has(member.id));
    // The device's own member comes first, as in the wireframes.
    return [...list].sort(
        (a, b) => Number(b.id === group.me.id) - Number(a.id === group.me.id) || a.id - b.id,
    );
}

/** "10.11. · bezahlt von Du · Scan" */
export function receiptMeta(group: GroupState, receipt: ReceiptSummaryDto): string {
    return `${formatShortDate(receipt.date)} · bezahlt von ${group.label(receipt.paidBy)} · ${
        receipt.source === 'scan' ? 'Scan' : 'manuell'
    }`;
}

/** Names of the members of a position: "Du, Rosi", or "alle" if everyone takes part. */
export function sharersText(group: GroupState, memberIds: readonly number[]): string {
    const active = group.activeMembers.map((member) => member.id);
    const everyone =
        active.length > 1 &&
        memberIds.length === active.length &&
        active.every((id) => memberIds.includes(id));
    if (everyone) return 'alle';
    const order = selectableMembers(group, memberIds).filter((member) =>
        memberIds.includes(member.id),
    );
    return order.map((member) => group.label(member.id)).join(', ');
}
