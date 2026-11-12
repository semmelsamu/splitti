// Money is always an integer number of cents. These helpers are the only place
// where cents turn into text and back.

/** 1163 → "11,63"; -50 → "-0,50". */
export function formatCents(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error(`Not an integer cent amount: ${cents}`);
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;
  return `${sign}${euros},${String(rest).padStart(2, '0')}`;
}

/** 1163 → "11,63 €". */
export function formatEuro(cents: number): string {
  return `${formatCents(cents)} €`;
}

/**
 * Reads an amount typed by a person: "40", "40,5", "40,50", "40.50", "-0,25", "1.234,56", "12 €".
 * Returns integer cents, or null if the text is not an amount.
 */
export function parseAmount(input: string): number | null {
  let text = input.trim().replace(/€/g, '').replace(/\s+/g, '');
  if (text === '') return null;

  let negative = false;
  if (text.startsWith('-') || text.startsWith('−')) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }

  // With both separators present, the last one is the decimal separator ("1.234,56").
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    const thousands = lastComma > lastDot ? '.' : ',';
    text = text.split(thousands).join('');
  }
  text = text.replace(',', '.');

  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const euros = Number(match[1]);
  const decimals = (match[2] ?? '').padEnd(2, '0');
  const cents = euros * 100 + Number(decimals);
  return negative ? -cents : cents;
}
