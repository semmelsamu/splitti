// Text for people: amounts, dates, and how balances are worded.

import { formatEuro } from '../core/money';

export { formatCents, formatEuro, parseAmount } from '../core/money';

/** "2026-11-10" → "10.11.2026" */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : iso;
}

/** "2026-11-10" → "10.11." */
export function formatShortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${match[3]}.${match[2]}.` : iso;
}

/** ISO timestamp → "12.11.2026, 20:15" in the device's time zone. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}, ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Today as YYYY-MM-DD in the device's time zone. */
export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "bekommt 12,40 €", "schuldet 8,15 €" or "ausgeglichen" (third person, for a list of members). */
export function balanceText(cents: number): string {
  if (cents > 0) return `bekommt ${formatEuro(cents)}`;
  if (cents < 0) return `schuldet ${formatEuro(-cents)}`;
  return 'ausgeglichen';
}

/** "du bekommst 12,40 €", "du schuldest 8,15 €" or "ausgeglichen" (for the start screen). */
export function ownBalanceText(cents: number): string {
  if (cents > 0) return `du bekommst ${formatEuro(cents)}`;
  if (cents < 0) return `du schuldest ${formatEuro(-cents)}`;
  return 'ausgeglichen';
}

/** "1 Mitglied", "4 Mitglieder" */
export function memberCountText(count: number): string {
  return count === 1 ? '1 Mitglied' : `${count} Mitglieder`;
}
