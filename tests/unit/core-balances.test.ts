import { describe, expect, it } from 'vitest';
import { type BalanceReceipt, computeBalances } from '../../src/core/balances';
import { seeded } from './helpers/random';

function sumOf(balances: Map<number, number>): number {
  return [...balances.values()].reduce((a, b) => a + b, 0);
}

describe('computeBalances', () => {
  it('is zero for everyone in an empty group', () => {
    expect(computeBalances([1, 2, 3], [], [])).toEqual(
      new Map([
        [1, 0],
        [2, 0],
        [3, 0],
      ]),
    );
  });

  it('is what someone paid minus their share', () => {
    // Karl pays 40,00 for four people: he is owed 30,00, the others owe 10,00 each.
    const balances = computeBalances(
      [1, 2, 3, 4],
      [{ paidBy: 2, rotation: 0, items: [{ amountCents: 4000, memberIds: [1, 2, 3, 4] }] }],
      [],
    );
    expect(balances).toEqual(
      new Map([
        [1, -1000],
        [2, 3000],
        [3, -1000],
        [4, -1000],
      ]),
    );
  });

  it('leaves a payer who bears everything themselves at zero', () => {
    const balances = computeBalances(
      [1, 2],
      [{ paidBy: 1, rotation: 0, items: [{ amountCents: 500, memberIds: [1] }] }],
      [],
    );
    expect(balances.get(1)).toBe(0);
    expect(balances.get(2)).toBe(0);
  });

  it('adds up several receipts', () => {
    const receipts: BalanceReceipt[] = [
      { paidBy: 1, rotation: 0, items: [{ amountCents: 1000, memberIds: [1, 2] }] },
      { paidBy: 2, rotation: 1, items: [{ amountCents: 600, memberIds: [1, 2, 3] }] },
    ];
    // 1: +1000 − 500 − 200 = +300; 2: +600 − 500 − 200 = −100; 3: −200
    expect(computeBalances([1, 2, 3], receipts, [])).toEqual(
      new Map([
        [1, 300],
        [2, -100],
        [3, -200],
      ]),
    );
  });

  it('a payment moves the balance of both people towards zero', () => {
    const receipts: BalanceReceipt[] = [
      { paidBy: 1, rotation: 0, items: [{ amountCents: 1000, memberIds: [1, 2] }] },
    ];
    const balances = computeBalances([1, 2], receipts, [{ from: 2, to: 1, amountCents: 500 }]);
    expect(balances).toEqual(
      new Map([
        [1, 0],
        [2, 0],
      ]),
    );
  });

  it('a payment that is too large turns the debt around', () => {
    const balances = computeBalances([1, 2], [], [{ from: 2, to: 1, amountCents: 700 }]);
    expect(balances).toEqual(
      new Map([
        [1, -700],
        [2, 700],
      ]),
    );
  });

  it('ignores positions that nobody bears', () => {
    const balances = computeBalances(
      [1, 2],
      [
        {
          paidBy: 1,
          rotation: 0,
          items: [
            { amountCents: 1000, memberIds: [1, 2] },
            { amountCents: 333, memberIds: [] },
          ],
        },
      ],
      [],
    );
    expect(balances).toEqual(
      new Map([
        [1, 500],
        [2, -500],
      ]),
    );
  });

  it('includes people who are no longer in the member list but appear in old receipts', () => {
    const balances = computeBalances(
      [1],
      [{ paidBy: 1, rotation: 0, items: [{ amountCents: 300, memberIds: [1, 9] }] }],
      [],
    );
    expect(balances.get(9)).toBe(-150);
    expect(sumOf(balances)).toBe(0);
  });

  it('uses the rotation of each receipt for the odd cent', () => {
    const items = [{ amountCents: 100, memberIds: [1, 2, 3] }];
    const first = computeBalances([1, 2, 3], [{ paidBy: 1, rotation: 0, items }], []);
    const second = computeBalances([1, 2, 3], [{ paidBy: 1, rotation: 1, items }], []);
    expect(first.get(2)).toBe(-33);
    expect(second.get(2)).toBe(-34);
  });

  it('always adds up to zero (random groups, receipts and payments)', () => {
    const random = seeded(4711);
    for (let round = 0; round < 300; round++) {
      const members = Array.from({ length: random.int(1, 8) }, (_, index) => index + 1);
      const pick = () => members[random.int(0, members.length - 1)] as number;
      const receipts: BalanceReceipt[] = Array.from(
        { length: random.int(0, 12) },
        (_, rotation) => ({
          paidBy: pick(),
          rotation,
          items: Array.from({ length: random.int(1, 10) }, () => ({
            amountCents: random.int(-200, 5000),
            memberIds: random.next() < 0.1 ? [] : random.subset(members),
          })),
        }),
      );
      const payments = Array.from({ length: random.int(0, 6) }, () => ({
        from: pick(),
        to: pick(),
        amountCents: random.int(1, 5000),
      }));
      const balances = computeBalances(members, receipts, payments);
      expect(sumOf(balances), `round ${round}`).toBe(0);
      for (const cents of balances.values()) expect(Number.isInteger(cents)).toBe(true);
    }
  });
});
