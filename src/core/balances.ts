// Balances of a group. Pure functions, integer cents only.
//
// Balance of a person = what they paid minus their share, over all receipts
// and payments of the group. Positive: the group owes them money.

import { type SplitItem, splitReceipt } from './split';

export interface BalanceReceipt {
  paidBy: number;
  items: readonly SplitItem[];
  /** Running number of the receipt within its group, see splitReceipt(). */
  rotation: number;
}

export interface BalancePayment {
  from: number;
  to: number;
  amountCents: number;
}

/**
 * Balance per member in cents. Every id in `memberIds` is in the result, also
 * with a balance of zero; members that only appear in receipts or payments are
 * added. The balances always add up to zero.
 */
export function computeBalances(
  memberIds: readonly number[],
  receipts: readonly BalanceReceipt[],
  payments: readonly BalancePayment[],
): Map<number, number> {
  const balances = new Map<number, number>(memberIds.map((id) => [id, 0]));
  const add = (member: number, cents: number) => {
    balances.set(member, (balances.get(member) ?? 0) + cents);
  };

  for (const receipt of receipts) {
    const shares = splitReceipt(receipt.items, receipt.rotation);
    let total = 0;
    for (const [member, cents] of shares) {
      add(member, -cents);
      total += cents;
    }
    // The payer advanced exactly what the others (and they themselves) bear.
    add(receipt.paidBy, total);
  }

  for (const payment of payments) {
    if (!Number.isInteger(payment.amountCents)) {
      throw new Error(`Not an integer cent amount: ${payment.amountCents}`);
    }
    // Paying someone reduces the payer's debt and the receiver's credit.
    add(payment.from, payment.amountCents);
    add(payment.to, -payment.amountCents);
  }

  return balances;
}
