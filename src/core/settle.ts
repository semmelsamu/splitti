// Settling up: the fewest transfers that bring every balance to zero.
// Pure function, integer cents only.

export interface Transfer {
    from: number;
    to: number;
    amountCents: number;
}

/**
 * Above this many people with a non-zero balance the exact search (2^n subsets)
 * is skipped and the plain pairing is used; it needs at most n − 1 transfers.
 */
const EXACT_LIMIT = 16;

/**
 * Proposes transfers from people who owe (negative balance) to people who are
 * owed (positive balance).
 *
 * The number of transfers is minimal: people are divided into as many groups as
 * possible whose balances cancel out, and a group of k people needs k − 1
 * transfers. Finding these groups is exact for up to 16 people with open
 * balances.
 */
export function settle(balances: ReadonlyMap<number, number>): Transfer[] {
    const open = [...balances.entries()]
        .filter(([, cents]) => cents !== 0)
        .sort(([a], [b]) => a - b);
    for (const [, cents] of open) {
        if (!Number.isInteger(cents)) throw new Error(`Not an integer cent amount: ${cents}`);
    }
    const sum = open.reduce((total, [, cents]) => total + cents, 0);
    if (sum !== 0) throw new Error(`Balances do not add up to zero: ${sum}`);
    if (open.length === 0) return [];

    const groups = open.length <= EXACT_LIMIT ? cancellingGroups(open) : [open];
    const transfers = groups.flatMap(pairUp);

    // Stable, readable order: largest amount first.
    return transfers.sort(
        (a, b) => b.amountCents - a.amountCents || a.from - b.from || a.to - b.to,
    );
}

/**
 * Splits the people into the largest possible number of groups that each add
 * up to zero. Dynamic programming over all subsets: best[set] is the largest
 * number of cancelling groups that can be peeled off the set.
 */
function cancellingGroups(open: readonly [number, number][]): [number, number][][] {
    const n = open.length;
    const full = (1 << n) - 1;
    const sums = new Float64Array(full + 1);
    const best = new Uint8Array(full + 1);

    for (let set = 1; set <= full; set++) {
        const lowest = set & -set;
        const index = 31 - Math.clz32(lowest);
        sums[set] = (sums[set ^ lowest] as number) + (open[index] as [number, number])[1];
        let most = 0;
        for (let rest = set; rest !== 0; rest &= rest - 1) {
            const without = set ^ (rest & -rest);
            if ((best[without] as number) > most) most = best[without] as number;
        }
        best[set] = most + (sums[set] === 0 ? 1 : 0);
    }

    // Walk back from the full set; every time the remaining set adds up to zero,
    // the people removed since the last such point form one group.
    const groups: [number, number][][] = [];
    let current: [number, number][] = [];
    let set = full;
    while (set !== 0) {
        const target = (best[set] as number) - (sums[set] === 0 ? 1 : 0);
        for (let rest = set; rest !== 0; rest &= rest - 1) {
            const bit = rest & -rest;
            if (best[set ^ bit] === target) {
                current.push(open[31 - Math.clz32(bit)] as [number, number]);
                set ^= bit;
                break;
            }
        }
        if (sums[set] === 0) {
            groups.push(current);
            current = [];
        }
    }
    return groups;
}

/** Within one group: the largest debtor pays the largest creditor until all are even. */
function pairUp(group: readonly [number, number][]): Transfer[] {
    const debtors = group
        .filter(([, cents]) => cents < 0)
        .map(([member, cents]) => ({ member, cents: -cents }))
        .sort((a, b) => b.cents - a.cents || a.member - b.member);
    const creditors = group
        .filter(([, cents]) => cents > 0)
        .map(([member, cents]) => ({ member, cents }))
        .sort((a, b) => b.cents - a.cents || a.member - b.member);

    const transfers: Transfer[] = [];
    let d = 0;
    let c = 0;
    while (d < debtors.length && c < creditors.length) {
        const debtor = debtors[d] as { member: number; cents: number };
        const creditor = creditors[c] as { member: number; cents: number };
        const amountCents = Math.min(debtor.cents, creditor.cents);
        transfers.push({ from: debtor.member, to: creditor.member, amountCents });
        debtor.cents -= amountCents;
        creditor.cents -= amountCents;
        if (debtor.cents === 0) d++;
        if (creditor.cents === 0) c++;
    }
    return transfers;
}
