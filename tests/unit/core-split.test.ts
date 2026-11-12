import { describe, expect, it } from 'vitest';
import { assignedTotal, type SplitItem, splitReceipt } from '../../src/core/split';
import { seeded } from './helpers/random';

const DU = 1;
const KARL = 2;
const ROSI = 3;
const VIERTE = 4;

/** The worked example from the plan: receipt A, 11,63 €. */
const RECEIPT_A: SplitItem[] = [
    { amountCents: 279, memberIds: [DU, ROSI] }, // KLC.Nougat Pockets
    { amountCents: 95, memberIds: [DU] }, // KVeg.No Milk
    { amountCents: 300, memberIds: [DU, KARL, ROSI, VIERTE] }, // Barilla Girandole
    { amountCents: 200, memberIds: [DU, KARL] }, // Hauchgenuss vegan
    { amountCents: 100, memberIds: [KARL] }, // Salami vegan
    { amountCents: 189, memberIds: [DU, KARL] }, // KLC.Käseaufschnitt
];

function sumOf(shares: Map<number, number>): number {
    return [...shares.values()].reduce((a, b) => a + b, 0);
}

/** Exact share of every member as a fraction, computed independently of the implementation. */
function exactShares(items: readonly SplitItem[]): Map<number, { num: bigint; den: bigint }> {
    const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b));
    const shares = new Map<number, { num: bigint; den: bigint }>();
    for (const item of items) {
        const members = [...new Set(item.memberIds)];
        for (const member of members) {
            const old = shares.get(member) ?? { num: 0n, den: 1n };
            const n = BigInt(members.length);
            const num = old.num * n + BigInt(item.amountCents) * old.den;
            const den = old.den * n;
            const divisor = gcd(num, den) || 1n;
            shares.set(member, { num: num / divisor, den: den / divisor });
        }
    }
    return shares;
}

function randomReceipt(random: ReturnType<typeof seeded>): SplitItem[] {
    const members = Array.from({ length: random.int(1, 8) }, (_, index) => index + 1);
    return Array.from({ length: random.int(1, 20) }, () => ({
        // Mostly prices, now and then a negative amount (returned deposit, discount).
        amountCents: random.next() < 0.1 ? -random.int(1, 500) : random.int(1, 5000),
        memberIds: random.subset(members),
    }));
}

describe('worked example from the plan (receipt A, 11,63 €)', () => {
    it('gives Du 5,04 and the fourth person 0,75 in every case', () => {
        for (const rotation of [0, 1, 2, 3, 4, 5]) {
            const shares = splitReceipt(RECEIPT_A, rotation);
            expect(shares.get(DU)).toBe(504);
            expect(shares.get(VIERTE)).toBe(75);
        }
    });

    it('gives the leftover cent to Karl or Rosi, who have the same remainder', () => {
        const outcomes = new Set<string>();
        for (const rotation of [0, 1, 2, 3]) {
            const shares = splitReceipt(RECEIPT_A, rotation);
            outcomes.add(`${shares.get(KARL)}/${shares.get(ROSI)}`);
        }
        expect([...outcomes].sort()).toEqual(['369/215', '370/214']);
    });

    it('adds up to 11,63 in both cases', () => {
        for (const rotation of [0, 1, 2, 3]) {
            expect(sumOf(splitReceipt(RECEIPT_A, rotation))).toBe(1163);
        }
    });

    it('matches the exact shares 5,04 / 3,695 / 2,145 / 0,75', () => {
        const exact = exactShares(RECEIPT_A);
        const asCents = (member: number) => {
            const share = exact.get(member) as { num: bigint; den: bigint };
            return Number(share.num) / Number(share.den);
        };
        expect(asCents(DU)).toBe(504);
        expect(asCents(KARL)).toBe(369.5);
        expect(asCents(ROSI)).toBe(214.5);
        expect(asCents(VIERTE)).toBe(75);
    });
});

describe('splitReceipt', () => {
    it('splits a position equally', () => {
        const shares = splitReceipt([{ amountCents: 4000, memberIds: [1, 2, 3, 4] }]);
        expect([...shares.entries()]).toEqual([
            [1, 1000],
            [2, 1000],
            [3, 1000],
            [4, 1000],
        ]);
    });

    it('gives a position with one member to that member in full', () => {
        expect(splitReceipt([{ amountCents: 95, memberIds: [7] }])).toEqual(new Map([[7, 95]]));
    });

    it('lets nobody bear a position without members', () => {
        const shares = splitReceipt([
            { amountCents: 100, memberIds: [1, 2] },
            { amountCents: 999, memberIds: [] },
        ]);
        expect(shares).toEqual(
            new Map([
                [1, 50],
                [2, 50],
            ]),
        );
    });

    it('returns nothing when nothing is assigned', () => {
        expect(splitReceipt([])).toEqual(new Map());
        expect(splitReceipt([{ amountCents: 100, memberIds: [] }])).toEqual(new Map());
    });

    it('rounds once per receipt, not per position', () => {
        // Three positions of one cent shared by three people: one cent each,
        // not a full cent to the same person three times.
        const items = [1, 2, 3].map(() => ({ amountCents: 1, memberIds: [1, 2, 3] }));
        expect(splitReceipt(items)).toEqual(
            new Map([
                [1, 1],
                [2, 1],
                [3, 1],
            ]),
        );
    });

    it('hands out the leftover cent when all remainders are equal', () => {
        const shares = splitReceipt([
            { amountCents: 100, memberIds: [1, 2, 3] },
            { amountCents: 100, memberIds: [1, 2] },
            { amountCents: 1, memberIds: [3] },
        ]);
        expect(sumOf(shares)).toBe(201);
        // Exact: 83,33… / 83,33… / 34,33…: all three have the remainder 1/3 and one
        // cent is left; with rotation 0 it goes to the first member.
        expect(shares).toEqual(
            new Map([
                [1, 84],
                [2, 83],
                [3, 34],
            ]),
        );
    });

    it('gives the leftover cent to the largest remainder, whoever is first in turn', () => {
        // 1: 0,50; 2: 0,50 + 0,333…; 3: 0,333…; 4: 0,333… → one cent left, member 2
        // has the largest remainder (0,833…).
        const items = [
            { amountCents: 1, memberIds: [1, 2] },
            { amountCents: 1, memberIds: [2, 3, 4] },
        ];
        for (const rotation of [0, 1, 2, 3]) {
            const shares = splitReceipt(items, rotation);
            expect(sumOf(shares)).toBe(2);
            expect(shares.get(2), `rotation ${rotation}`).toBe(1);
        }
    });

    it('rotates ties from receipt to receipt', () => {
        const items = [{ amountCents: 100, memberIds: [1, 2, 3] }];
        const lucky = [0, 1, 2, 3, 4, 5].map((rotation) => {
            const shares = splitReceipt(items, rotation);
            return [...shares.entries()].find(([, cents]) => cents === 34)?.[0];
        });
        expect(lucky).toEqual([1, 2, 3, 1, 2, 3]);
    });

    it('spreads several leftover cents over different people', () => {
        const shares = splitReceipt([{ amountCents: 200, memberIds: [1, 2, 3] }], 1);
        // 66,67 each; two cents left; the turn starts with member 2.
        expect(shares).toEqual(
            new Map([
                [1, 66],
                [2, 67],
                [3, 67],
            ]),
        );
    });

    it('handles negative amounts such as returned deposit', () => {
        const shares = splitReceipt([
            { amountCents: 100, memberIds: [1, 2, 3] },
            { amountCents: -25, memberIds: [1, 2] },
        ]);
        expect(sumOf(shares)).toBe(75);
        for (const cents of shares.values()) expect(Number.isInteger(cents)).toBe(true);
    });

    it('counts a member listed twice for a position only once', () => {
        expect(splitReceipt([{ amountCents: 100, memberIds: [1, 1, 2] }])).toEqual(
            new Map([
                [1, 50],
                [2, 50],
            ]),
        );
    });

    it('is deterministic', () => {
        expect(splitReceipt(RECEIPT_A, 3)).toEqual(splitReceipt(RECEIPT_A, 3));
    });

    it('rejects amounts that are not whole cents', () => {
        expect(() => splitReceipt([{ amountCents: 1.5, memberIds: [1] }])).toThrow();
    });

    it('copes with large groups without losing a cent', () => {
        const members = Array.from({ length: 23 }, (_, index) => index + 1);
        const items = [
            { amountCents: 99999, memberIds: members },
            { amountCents: 12345, memberIds: members.slice(0, 19) },
            { amountCents: 777, memberIds: members.slice(3, 20) },
        ];
        expect(sumOf(splitReceipt(items, 5))).toBe(99999 + 12345 + 777);
    });
});

describe('properties over random receipts', () => {
    const random = seeded(20261112);
    const receipts = Array.from({ length: 500 }, () => randomReceipt(random));

    it('the shares add up to the receipt total', () => {
        receipts.forEach((items, index) => {
            expect(sumOf(splitReceipt(items, index))).toBe(assignedTotal(items));
        });
    });

    it('nobody is off by a cent or more from their exact share', () => {
        receipts.forEach((items, index) => {
            const shares = splitReceipt(items, index);
            for (const [member, { num, den }] of exactShares(items)) {
                const cents = BigInt(shares.get(member) as number);
                const difference = cents * den - num;
                const absolute = difference < 0n ? -difference : difference;
                expect(absolute < den, `receipt ${index}, member ${member}`).toBe(true);
            }
        });
    });

    it('exactly the members of assigned positions get a share', () => {
        receipts.forEach((items, index) => {
            const expected = new Set(items.flatMap((item) => item.memberIds));
            expect(new Set(splitReceipt(items, index).keys())).toEqual(expected);
        });
    });

    it('the rotation changes who gets a leftover cent, never how many cents are handed out', () => {
        for (const items of receipts.slice(0, 100)) {
            const base = splitReceipt(items, 0);
            for (const rotation of [1, 2, 3, 7]) {
                const other = splitReceipt(items, rotation);
                expect(sumOf(other)).toBe(sumOf(base));
                for (const [member, cents] of base) {
                    expect(Math.abs((other.get(member) as number) - cents)).toBeLessThanOrEqual(1);
                }
            }
        }
    });
});

describe('assignedTotal', () => {
    it('counts only positions that somebody bears', () => {
        expect(
            assignedTotal([
                { amountCents: 279, memberIds: [1] },
                { amountCents: 25, memberIds: [] },
            ]),
        ).toBe(279);
    });
});
