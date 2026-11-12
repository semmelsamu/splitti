// A receipt while it is being split: what the split screen works on, for a new
// scan, a new manual receipt and a saved receipt that is being changed alike.
// A new receipt lives in the session storage until it is saved, so reloading
// the page or looking at the receipt image does not lose the work.

import type {
    ItemKind,
    ReceiptDetailDto,
    ReceiptInput,
    ReceiptSource,
    ScanDto,
} from '../shared/api-types';
import { todayIso } from './format';

export interface DraftItem {
    /** Stable handle for the UI; not sent to the server. */
    key: string;
    /** Id of the saved position when changing a receipt. */
    id?: number;
    label: string;
    amountCents: number;
    kind: ItemKind;
    /** Opt-in: empty until someone is tapped. */
    memberIds: number[];
    /** The recognition was unsure about this line. */
    needsReview: boolean;
}

export interface ReceiptDraft {
    /** Id of the saved receipt being changed; null for a new one. */
    receiptId: number | null;
    source: ReceiptSource;
    /** Handle of the uploaded photo of a new scan. */
    imageId: string | null;
    merchant: string;
    /** YYYY-MM-DD */
    date: string;
    paidBy: number;
    detectedTotalCents: number | null;
    /** How many positions the recognition found; null if this is not a fresh scan. */
    recognized: number | null;
    items: DraftItem[];
}

let counter = 0;
/** crypto.randomUUID needs HTTPS; a counter is enough for keys within one draft. */
export function newKey(): string {
    counter += 1;
    return `${Date.now().toString(36)}-${counter}`;
}

export function draftFromScan(scan: ScanDto, paidBy: number): ReceiptDraft {
    return {
        receiptId: null,
        source: 'scan',
        imageId: scan.imageId,
        merchant: scan.merchant,
        date: scan.date ?? todayIso(),
        paidBy,
        detectedTotalCents: scan.detectedTotalCents,
        recognized: scan.items.length,
        items: scan.items.map((item) => ({
            key: newKey(),
            label: item.label,
            amountCents: item.amountCents,
            kind: item.kind,
            memberIds: [],
            needsReview: item.needsReview,
        })),
    };
}

export function emptyDraft(paidBy: number, merchant: string, date: string): ReceiptDraft {
    return {
        receiptId: null,
        source: 'manual',
        imageId: null,
        merchant,
        date,
        paidBy,
        detectedTotalCents: null,
        recognized: null,
        items: [],
    };
}

export function draftFromReceipt(receipt: ReceiptDetailDto): ReceiptDraft {
    return {
        receiptId: receipt.id,
        source: receipt.source,
        imageId: null,
        merchant: receipt.merchant,
        date: receipt.date,
        paidBy: receipt.paidBy,
        detectedTotalCents: receipt.detectedTotalCents,
        recognized: null,
        items: receipt.items.map((item) => ({
            key: newKey(),
            id: item.id,
            label: item.label,
            amountCents: item.amountCents,
            kind: item.kind,
            memberIds: [...item.memberIds],
            needsReview: false,
        })),
    };
}

export function toReceiptInput(draft: ReceiptDraft): ReceiptInput {
    return {
        paidBy: draft.paidBy,
        date: draft.date,
        merchant: draft.merchant.trim(),
        source: draft.source,
        detectedTotalCents: draft.detectedTotalCents,
        imageId: draft.imageId,
        items: draft.items.map((item) => ({
            ...(item.id === undefined ? {} : { id: item.id }),
            label: item.label.trim(),
            amountCents: item.amountCents,
            kind: item.kind,
            memberIds: item.memberIds,
        })),
    };
}

/** Kind of a position from what the user typed: deposit by its name, discount by its sign. */
export function kindFor(label: string, amountCents: number): ItemKind {
    if (amountCents < 0) return /pfand|leergut/i.test(label) ? 'deposit' : 'discount';
    return /^pfand/i.test(label.trim()) ? 'deposit' : 'item';
}

// --- the new receipt in progress, per group ---------------------------------

const storageKey = (token: string) => `splitti.draft.${token}`;

export function loadDraft(token: string): ReceiptDraft | null {
    try {
        const raw = window.sessionStorage.getItem(storageKey(token));
        return raw ? (JSON.parse(raw) as ReceiptDraft) : null;
    } catch {
        return null;
    }
}

export function storeDraft(token: string, draft: ReceiptDraft): void {
    try {
        window.sessionStorage.setItem(storageKey(token), JSON.stringify(draft));
    } catch {
        // Without session storage the draft only lives in memory.
    }
}

export function clearDraft(token: string): void {
    try {
        window.sessionStorage.removeItem(storageKey(token));
    } catch {
        // Nothing to clear.
    }
}

// --- what is still missing before the receipt can be saved -------------------

export interface DraftStatus {
    itemsSumCents: number;
    /** Positions nobody is selected for. */
    unassigned: number;
    /** Positions with a price of zero. */
    unpriced: number;
    /** Difference to the total printed on the receipt; null if there is none. */
    deviationCents: number | null;
    canSave: boolean;
}

export function draftStatus(draft: ReceiptDraft): DraftStatus {
    const itemsSumCents = draft.items.reduce((sum, item) => sum + item.amountCents, 0);
    const unassigned = draft.items.filter((item) => item.memberIds.length === 0).length;
    const unpriced = draft.items.filter((item) => item.amountCents === 0).length;
    return {
        itemsSumCents,
        unassigned,
        unpriced,
        deviationCents:
            draft.detectedTotalCents === null ? null : itemsSumCents - draft.detectedTotalCents,
        canSave:
            draft.items.length > 0 &&
            unassigned === 0 &&
            unpriced === 0 &&
            draft.merchant.trim() !== '',
    };
}
