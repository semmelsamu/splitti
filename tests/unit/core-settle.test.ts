import { describe, expect, it } from 'vitest';
import { settle, type Transfer } from '../../src/core/settle';
import { seeded } from './helpers/random';

function apply(balances: ReadonlyMap<number, number>, transfers: Transfer[]): Map<number, number> {
  const result = new Map(balances);
  for (const { from, to, amountCents } of transfers) {
    result.set(from, (result.get(from) ?? 0) + amountCents);
    result.set(to, (result.get(to) ?? 0) - amountCents);
  }
  return result;
}

function allZero(balances: Map<number, number>): boolean {
  return [...balances.values()].every((cents) => cents === 0);
}

/**
 * Fewest transfers by brute force: the people are divided into groups that
 * cancel out in every possible way; a division into g groups needs n − g.
 */
function fewestTransfers(values: number[]): number {
  const nonZero = values.filter((value) => value !== 0);
  let mostGroups = 0;
  const groupSums: number[] = [];
  const assign = (index: number) => {
    if (index === nonZero.length) {
      if (groupSums.every((sum) => sum === 0)) mostGroups = Math.max(mostGroups, groupSums.length);
      return;
    }
    const value = nonZero[index] as number;
    for (let group = 0; group < groupSums.length; group++) {
      groupSums[group] = (groupSums[group] as number) + value;
      assign(index + 1);
      groupSums[group] = (groupSums[group] as number) - value;
    }
    groupSums.push(value);
    assign(index + 1);
    groupSums.pop();
  };
  assign(0);
  return nonZero.length - mostGroups;
}

describe('settle', () => {
  it('proposes nothing when everyone is even', () => {
    expect(settle(new Map())).toEqual([]);
    expect(
      settle(
        new Map([
          [1, 0],
          [2, 0],
        ]),
      ),
    ).toEqual([]);
  });

  it('lets the one who owes pay the one who is owed', () => {
    const transfers = settle(
      new Map([
        [1, 815],
        [2, -815],
      ]),
    );
    expect(transfers).toEqual([{ from: 2, to: 1, amountCents: 815 }]);
  });

  it('settles the example from the wireframe with three transfers', () => {
    // Du +12,40, Karl −8,15, Rosi −6,75, fourth person +2,50
    const balances = new Map([
      [1, 1240],
      [2, -815],
      [3, -675],
      [4, 250],
    ]);
    const transfers = settle(balances);
    expect(transfers).toEqual([
      { from: 2, to: 1, amountCents: 815 },
      { from: 3, to: 1, amountCents: 425 },
      { from: 3, to: 4, amountCents: 250 },
    ]);
    expect(allZero(apply(balances, transfers))).toBe(true);
  });

  it('finds pairs that cancel out exactly', () => {
    const balances = new Map([
      [1, 500],
      [2, 300],
      [3, -300],
      [4, -500],
    ]);
    const transfers = settle(balances);
    expect(transfers).toEqual([
      { from: 4, to: 1, amountCents: 500 },
      { from: 3, to: 2, amountCents: 300 },
    ]);
  });

  it('needs fewer transfers than pairing the largest amounts would', () => {
    // {+7, −3, −4} and {+6, −1, −5} cancel out separately: 4 transfers.
    // Always matching the largest debtor with the largest creditor needs 5.
    const balances = new Map([
      [1, 700],
      [2, 600],
      [3, -500],
      [4, -400],
      [5, -300],
      [6, -100],
    ]);
    const transfers = settle(balances);
    expect(transfers).toHaveLength(4);
    expect(allZero(apply(balances, transfers))).toBe(true);
  });

  it('only moves money from people who owe to people who are owed', () => {
    const balances = new Map([
      [1, 1000],
      [2, -250],
      [3, -750],
    ]);
    for (const { from, to, amountCents } of settle(balances)) {
      expect(balances.get(from)).toBeLessThan(0);
      expect(balances.get(to)).toBeGreaterThan(0);
      expect(amountCents).toBeGreaterThan(0);
    }
  });

  it('rejects balances that do not add up to zero', () => {
    expect(() =>
      settle(
        new Map([
          [1, 100],
          [2, -99],
        ]),
      ),
    ).toThrow();
  });

  it('is deterministic and independent of the order of the input', () => {
    const a = new Map([
      [3, -675],
      [1, 1240],
      [4, 250],
      [2, -815],
    ]);
    const b = new Map([
      [1, 1240],
      [2, -815],
      [3, -675],
      [4, 250],
    ]);
    expect(settle(a)).toEqual(settle(b));
  });

  it('brings everyone to zero with the fewest possible transfers (random groups)', () => {
    const random = seeded(815);
    for (let round = 0; round < 400; round++) {
      const size = random.int(2, 7);
      const values = Array.from({ length: size - 1 }, () =>
        // Small amounts, so that subsets cancelling out are common.
        random.next() < 0.2 ? 0 : random.int(-6, 6) * 100,
      );
      values.push(-values.reduce((a, b) => a + b, 0));
      const balances = new Map(values.map((value, index) => [index + 1, value]));

      const transfers = settle(balances);
      expect(allZero(apply(balances, transfers)), `round ${round}`).toBe(true);
      expect(transfers.length, `round ${round}: ${values.join(', ')}`).toBe(
        fewestTransfers(values),
      );
    }
  });

  it('still settles a group that is too large for the exact search', () => {
    const random = seeded(99);
    const values = Array.from({ length: 23 }, () => random.int(-5000, 5000));
    values.push(-values.reduce((a, b) => a + b, 0));
    const balances = new Map(values.map((value, index) => [index + 1, value]));
    const transfers = settle(balances);
    expect(allZero(apply(balances, transfers))).toBe(true);
    const open = values.filter((value) => value !== 0).length;
    expect(transfers.length).toBeLessThanOrEqual(open - 1);
  });

  it('handles sixteen people, the largest group searched exactly', () => {
    // Eight pairs that cancel out: eight transfers.
    const balances = new Map<number, number>();
    for (let pair = 0; pair < 8; pair++) {
      balances.set(2 * pair + 1, (pair + 1) * 137);
      balances.set(2 * pair + 2, -(pair + 1) * 137);
    }
    const transfers = settle(balances);
    expect(transfers).toHaveLength(8);
    expect(allZero(apply(balances, transfers))).toBe(true);
  });
});
