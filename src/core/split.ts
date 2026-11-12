// Splitting a receipt among people. Pure functions, integer cents only.
//
// Rules (docs/PLAN.md, "Aufteilungsregeln"):
//   - Every position is shared equally by the members selected for it;
//     a position without members is borne by nobody.
//   - Per receipt, each person's exact share is summed over all positions and
//     rounded only then, so nobody is off by more than one cent per receipt.
//   - Leftover cents go to the people with the largest rounding remainder.
//     On a tie the order rotates from receipt to receipt.

export interface SplitItem {
    amountCents: number;
    /** Members who share this position; empty = nobody. */
    memberIds: readonly number[];
}

/**
 * Share of each member in cents. The shares add up to exactly the sum of the
 * positions that have members. Members that take part in no position are not
 * in the result.
 *
 * @param rotation Decides ties between equal remainders: the running number of
 *   the receipt within its group. Receipt n prefers the tied member at index
 *   n (modulo the number of participants, in ascending member id order).
 */
export function splitReceipt(items: readonly SplitItem[], rotation = 0): Map<number, number> {
    if (!Number.isInteger(rotation) || rotation < 0) {
        throw new Error(`rotation must be a non-negative integer: ${rotation}`);
    }

    // Exact shares as fractions over one common denominator: the least common
    // multiple of all group sizes. BigInt, so large groups cannot overflow.
    let denominator = 1n;
    const assigned: { amount: bigint; members: number[] }[] = [];
    for (const item of items) {
        if (!Number.isInteger(item.amountCents)) {
            throw new Error(`Not an integer cent amount: ${item.amountCents}`);
        }
        const members = [...new Set(item.memberIds)];
        if (members.length === 0) continue;
        assigned.push({ amount: BigInt(item.amountCents), members });
        denominator = lcm(denominator, BigInt(members.length));
    }

    const numerators = new Map<number, bigint>();
    let total = 0n;
    for (const { amount, members } of assigned) {
        total += amount;
        const part = amount * (denominator / BigInt(members.length));
        for (const member of members) numerators.set(member, (numerators.get(member) ?? 0n) + part);
    }

    // Round down, remember the remainder.
    const participants = [...numerators.keys()].sort((a, b) => a - b);
    const count = participants.length;
    const parts = participants.map((member, index) => {
        const numerator = numerators.get(member) as bigint;
        const cents = floorDivide(numerator, denominator);
        return {
            member,
            cents,
            remainder: numerator - cents * denominator,
            // Position in the tie order of this receipt.
            turn: (index - (rotation % count) + count) % count,
        };
    });

    // What rounding down left over: fewer cents than there are participants.
    let leftover = total - parts.reduce((sum, part) => sum + part.cents, 0n);
    const byRemainder = [...parts].sort((a, b) =>
        a.remainder === b.remainder ? a.turn - b.turn : a.remainder > b.remainder ? -1 : 1,
    );
    for (const part of byRemainder) {
        if (leftover === 0n) break;
        part.cents += 1n;
        leftover -= 1n;
    }

    return new Map(parts.map((part) => [part.member, Number(part.cents)]));
}

/** Sum of the positions that somebody bears: the amount that counts for the settlement. */
export function assignedTotal(items: readonly SplitItem[]): number {
    return items.reduce(
        (sum, item) => (item.memberIds.length > 0 ? sum + item.amountCents : sum),
        0,
    );
}

function gcd(a: bigint, b: bigint): bigint {
    while (b !== 0n) [a, b] = [b, a % b];
    return a;
}

function lcm(a: bigint, b: bigint): bigint {
    return (a / gcd(a, b)) * b;
}

/** Division rounding towards minus infinity (BigInt division truncates towards zero). */
function floorDivide(a: bigint, b: bigint): bigint {
    const quotient = a / b;
    return a % b !== 0n && a < 0n ? quotient - 1n : quotient;
}
