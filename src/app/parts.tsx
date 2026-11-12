// Pieces shared by the receipt screens: member chips, the "paid by" picker,
// the receipt image and its viewer.

import { useState } from 'react';
import type { MemberDto, ReceiptSummaryDto } from '../shared/api-types';
import { formatShortDate } from './format';
import { type GroupState, useGroup } from './group';
import { Button, Chip, Dialog } from './ui';

/** Members to offer for a position: the active ones plus anyone already selected. */
export function selectableMembers(group: GroupState, selected: readonly number[]): MemberDto[] {
    const wanted = new Set(selected);
    const list = group.members.filter((member) => member.active || wanted.has(member.id));
    // The device's own member comes first, as in the wireframes.
    return [...list].sort(
        (a, b) => Number(b.id === group.me.id) - Number(a.id === group.me.id) || a.id - b.id,
    );
}

interface MemberChipsProps {
    members: readonly MemberDto[];
    selected: readonly number[];
    onChange: (memberIds: number[]) => void;
    /** Accessible name of the group of chips, e.g. the position's label. */
    label: string;
}

/** One chip per member plus "alle": who shares this position. */
export function MemberChips({ members, selected, onChange, label }: MemberChipsProps) {
    const group = useGroup();
    const chosen = new Set(selected);
    const toggle = (id: number) => {
        onChange(chosen.has(id) ? selected.filter((other) => other !== id) : [...selected, id]);
    };
    return (
        // biome-ignore lint/a11y/useSemanticElements: a fieldset would bring its own border and legend layout
        <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
            {members.map((member) => (
                <Chip
                    key={member.id}
                    pressed={chosen.has(member.id)}
                    onClick={() => toggle(member.id)}
                >
                    {group.label(member.id)}
                </Chip>
            ))}
            <div className="flex-1" />
            <Button
                variant="text"
                className="px-2.5 text-[13px]"
                onClick={() => onChange(members.map((member) => member.id))}
            >
                alle
            </Button>
        </div>
    );
}

/** Sheet to choose who paid. */
export function PayerDialog({
    selected,
    onSelect,
    onClose,
}: {
    selected: number;
    onSelect: (memberId: number) => void;
    onClose: () => void;
}) {
    const group = useGroup();
    const members = selectableMembers(group, [selected]);
    return (
        <Dialog title="Bezahlt von" onClose={onClose}>
            <div className="flex flex-col gap-2">
                {members.map((member) => (
                    <button
                        key={member.id}
                        type="button"
                        aria-pressed={member.id === selected}
                        onClick={() => {
                            onSelect(member.id);
                            onClose();
                        }}
                        className={`min-h-12 cursor-pointer rounded-lg border px-4 text-left text-base ${
                            member.id === selected
                                ? 'border-accent bg-accent font-semibold text-white'
                                : 'border-field bg-white text-ink'
                        }`}
                    >
                        {group.label(member.id)}
                    </button>
                ))}
            </div>
        </Dialog>
    );
}

/** The small "Zettel" tile; tapping it shows the photo in full. */
export function ReceiptImageButton({ src }: { src: string }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                type="button"
                aria-label="Zettelbild ansehen"
                onClick={() => setOpen(true)}
                className="h-16 w-12 shrink-0 cursor-pointer overflow-hidden rounded border border-dashed border-field bg-white p-0 text-[11px] text-muted"
            >
                <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
            {open && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Zettelbild"
                    className="fixed inset-0 z-50 flex flex-col bg-black"
                >
                    <div className="flex shrink-0 justify-end p-2">
                        <Button variant="secondary" onClick={() => setOpen(false)}>
                            Schließen
                        </Button>
                    </div>
                    {/* The photo scrolls and can be pinched larger. */}
                    <div className="min-h-0 flex-1 overflow-auto">
                        <img
                            src={src}
                            alt="Foto des Kassenzettels"
                            className="mx-auto block w-full max-w-[900px]"
                        />
                    </div>
                </div>
            )}
        </>
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
