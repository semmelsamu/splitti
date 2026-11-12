// Rule set for the Kaufland receipt layout. Pure logic on text lines: it knows
// nothing about images or Tesseract and is tested against typed-out receipts.
//
// Layout (see docs/PLAN.md, "Testzettel"):
//   - The article block starts after "Preis EUR" and ends at "Summe".
//   - An article line is text, price and a tax code (A or B).
//   - A quantity line ("3 * 1,00") or weight line ("0,440 kg") belongs to the
//     name in the line above and carries the price.
//   - "Pfandartikel" is a deposit, optionally with the quantity in the same line.
//   - A negative line is a discount: directly below an article it reduces that
//     article, for the whole purchase it is spread over all positions by price.
//   - Everything below "Summe" has no cost effect; total, tax table and date are
//     read from there as check values.
//
// The lines usually come from OCR, so the patterns tolerate its typical slips
// (a dot instead of the decimal comma, "8" instead of "B", "+" instead of "*").

import type { ParsedItem, ParsedReceipt, ReceiptChecks } from './types';

const MERCHANT = 'Kaufland';
const UNKNOWN_LABEL = 'Unbekannter Artikel';

/** "2,79" – tolerant of a dot and of a stray space next to the separator. */
const AMOUNT = String.raw`\d{1,4}\s?[,.]\s?\d{2}`;

/** What OCR makes of the tax codes. */
const TAX_CODE_LOOKALIKES: Record<string, string> = {
  A: 'A',
  '4': 'A',
  R: 'A',
  '*': 'A',
  B: 'B',
  '8': 'B',
  '6': 'B',
  ß: 'B',
};

/**
 * Price at the end of a line: optional minus, amount, optional minus,
 * optional tax code, at most two stray non-letters.
 */
const PRICE_TAIL = new RegExp(
  String.raw`^(?<head>.*?)(?<![\d,.])(?<minusBefore>-\s?)?(?<amount>${AMOUNT})(?<minusAfter>-)?\s*(?<code>[AB48R*6ß])?[^\p{L}\s]{0,2}$`,
  'u',
);

/** "3 * 1,00" at the end of the text before the price, optionally after a name. */
const QUANTITY = new RegExp(
  String.raw`^(?<name>.*?)\s*(?<![\d,.])(?<quantity>\d{1,3})\s*(?<sign>[*x×+])\s*(?<unit>${AMOUNT})$`,
  'u',
);

/** "3 *" – a quantity line whose total was lost; the "price" found is the unit price. */
const QUANTITY_WITHOUT_TOTAL = /^(?<name>.*?)\s*(?<![\d,.])(?<quantity>\d{1,3})\s*[*×]$/u;

/** "0,440 kg" */
const WEIGHT = /^(?<weight>\d{1,2}\s?[,.]\s?\d{3})\s*kg\b/iu;

const HEADER = /^\W{0,2}Pre[il1][sß]\s+\S{2,5}$/i;
const SUBTOTAL = /^Zwischensumme\b/i;
/** Lines that can only appear below the article block, besides the fuzzy matches in isBlockEnd(). */
const BLOCK_END = /^(Bar\b|Gegeben\b|Rückgeld\b|-?K-U-N-D)/i;
const ENDS_WITH_AMOUNT = new RegExp(String.raw`(?<![\d,.])(${AMOUNT})$`);
/** "179 B": a price whose comma was lost, recognisable by the tax code behind it. */
const PRICE_WITHOUT_COMMA = /(?<=\s)(\d{1,2})(\d{2})\s?([AB])$/;
/** "A 19,00% 0,95 0,80 0,15"; the rate may come out as "19,C0%" or "7,00C%". */
const TAX_ROW = /^(?<code>[AB])\W{0,2}\s*(?<rate>\d{1,2})\s?[,.]\s?\S{1,4}\s+(?<rest>.*)$/;
const DEPOSIT = /pfand|leergut/i;
const WHOLE_PURCHASE = /einkauf|gesamt|alles/i;
const DATE_LINE = /^Datum\b\D*(\d{1,2})\s?[.,]\s?(\d{1,2})\s?[.,]\s?(\d{4}|\d{2})(?!\d)/i;
const DATE_ANYWHERE = /(?<!\d)(\d{2})\.(\d{2})\.(\d{4}|\d{2})(?!\d)/;

export function parseKauflandReceipt(rawLines: readonly string[]): ParsedReceipt {
  const lines = rawLines.map(normalizeLine).filter((line) => line !== '');

  const headerIndex = lines.findIndex((line) => HEADER.test(line));
  // Without the header (photo starts at the first article) the block starts at
  // the top, and text before the first priced line is treated as receipt head.
  const hasHeader = headerIndex !== -1;

  const items: ParsedItem[] = [];
  let pendingName: string | null = null;
  let quantityAwaitingTotal: ParsedItem | null = null;
  let afterSubtotal = false;
  let purchaseDiscountCents = 0;
  let printedTotal: number | null = null;
  // Quantity lines whose printed total is not quantity times unit price: one of
  // the numbers was misread. The receipt total decides at the end which one.
  const doubtful: { item: ParsedItem; computedCents: number }[] = [];

  // A name that is followed neither by a price nor by a quantity or weight line:
  // an article whose price was unreadable. What is left of the price at the end
  // of the line (a token without letters) is not part of the name.
  const flushPendingName = () => {
    if (pendingName !== null && (hasHeader || items.length > 0)) {
      const label = pendingName.replace(/(\s+[^\p{L}\s]+)+$/u, '') || pendingName;
      items.push({ label, amountCents: 0, kind: 'item', needsReview: true });
    }
    pendingName = null;
  };

  let index = hasHeader ? headerIndex + 1 : 0;
  for (; index < lines.length; index++) {
    const line = lines[index] as string;

    if (isTotalLine(line)) {
      printedTotal = lastAmount(line);
      index++;
      break;
    }
    if (isBlockEnd(line)) break;
    if (SUBTOTAL.test(line)) {
      afterSubtotal = true;
      continue;
    }

    const tail = PRICE_TAIL.exec(line)?.groups;
    if (!tail) {
      // A line without a price: the name of the article priced in the next line.
      const name = cleanLabel(line);
      if (name !== '') {
        flushPendingName();
        pendingName = name;
      }
      continue;
    }

    // The text in front of the price, as printed: the patterns below need its
    // "*" and "kg". It is tidied only where it becomes a name.
    const head = (tail.head ?? '').replace(/^[^\p{L}\p{N}]+/u, '').trim();
    const amount = toCents(tail.amount as string);
    const negative = tail.minusBefore !== undefined || tail.minusAfter !== undefined;
    const taxCode = tail.code ? TAX_CODE_LOOKALIKES[tail.code] : undefined;
    const awaitingTotal = quantityAwaitingTotal;
    quantityAwaitingTotal = null;

    if (negative) {
      if (DEPOSIT.test(head)) {
        // Returned deposit is a position of its own, not a discount on the article above.
        flushPendingName();
        items.push(
          withTax({ label: cleanLabel(head), amountCents: -amount, kind: 'deposit' }, taxCode),
        );
        continue;
      }
      flushPendingName();
      const previous = items.at(-1);
      const wholePurchase = afterSubtotal || WHOLE_PURCHASE.test(head) || previous === undefined;
      if (wholePurchase) {
        purchaseDiscountCents += amount;
      } else if (previous.amountCents - amount > 0) {
        previous.amountCents -= amount;
        // With a discount the printed total no longer has to match the arithmetic.
        const entry = doubtful.findIndex((d) => d.item === previous);
        if (entry !== -1) doubtful.splice(entry, 1);
      } else {
        items.push(
          withTax(
            { label: cleanLabel(head) || 'Rabatt', amountCents: -amount, kind: 'discount' },
            taxCode,
          ),
        );
      }
      continue;
    }

    const weight = WEIGHT.exec(head)?.groups;
    if (weight) {
      const label = pendingName ?? UNKNOWN_LABEL;
      pendingName = null;
      const item = withTax({ label, amountCents: amount, kind: kindOf(label) }, taxCode);
      item.weightKg = Number((weight.weight as string).replace(/\s/g, '').replace(',', '.'));
      if (label === UNKNOWN_LABEL) item.needsReview = true;
      items.push(item);
      continue;
    }

    const quantity = QUANTITY.exec(head)?.groups;
    if (quantity) {
      const count = Number(quantity.quantity);
      const unit = toCents(quantity.unit as string);
      // "*" is the printed sign. Lookalikes only count if the arithmetic agrees,
      // so a label like "Wasser 6 x 1,50" is not mistaken for a quantity.
      if (quantity.sign === '*' || count * unit === amount) {
        const name = cleanLabel(quantity.name ?? '');
        if (name !== '') flushPendingName();
        const label = name !== '' ? name : (pendingName ?? UNKNOWN_LABEL);
        pendingName = null;
        const item = withTax({ label, amountCents: amount, kind: kindOf(label) }, taxCode);
        item.quantity = count;
        item.unitPriceCents = unit;
        if (label === UNKNOWN_LABEL) item.needsReview = true;
        if (count * unit !== amount) doubtful.push({ item, computedCents: count * unit });
        items.push(item);
        continue;
      }
    }

    const quantityOnly = QUANTITY_WITHOUT_TOTAL.exec(head)?.groups;
    if (quantityOnly) {
      // The total at the right edge is missing; quantity times unit price replaces it.
      const count = Number(quantityOnly.quantity);
      const name = cleanLabel(quantityOnly.name ?? '');
      if (name !== '') flushPendingName();
      const label = name !== '' ? name : (pendingName ?? UNKNOWN_LABEL);
      pendingName = null;
      const item: ParsedItem = {
        label,
        amountCents: count * amount,
        kind: kindOf(label),
        quantity: count,
        unitPriceCents: amount,
        needsReview: true,
      };
      items.push(item);
      quantityAwaitingTotal = item;
      continue;
    }

    if (letterCount(head) < 3) {
      // A price without a name; one or two stray letters are OCR noise, not a label.
      if (awaitingTotal) {
        // The total of the quantity line above, split off into its own line.
        awaitingTotal.amountCents = amount;
        if (taxCode) awaitingTotal.taxCode = taxCode;
        delete awaitingTotal.needsReview;
        continue;
      }
      if (pendingName !== null) {
        const label = pendingName;
        pendingName = null;
        items.push(withTax({ label, amountCents: amount, kind: kindOf(label) }, taxCode));
        continue;
      }
      if (!taxCode) {
        // The total line whose word "Summe" was unreadable.
        printedTotal = amount;
        index++;
        break;
      }
      items.push(
        withTax(
          { label: UNKNOWN_LABEL, amountCents: amount, kind: 'item', needsReview: true },
          taxCode,
        ),
      );
      continue;
    }

    // The ordinary case: name, price, tax code.
    flushPendingName();
    const label = cleanLabel(head);
    items.push(withTax({ label, amountCents: amount, kind: kindOf(label) }, taxCode));
  }
  flushPendingName();

  if (purchaseDiscountCents > 0) spreadDiscount(items, purchaseDiscountCents);

  // Below the block: payment, tax table and date as check values.
  let paymentTotal: number | null = null;
  const taxGrossCents: Record<string, number> = {};
  for (; index < lines.length; index++) {
    const line = lines[index] as string;
    if (paymentTotal === null && (wordLike(line, 'kartenzahlung', 3) || /^EUR\b/i.test(line))) {
      const amount = ENDS_WITH_AMOUNT.exec(line);
      if (amount) {
        paymentTotal = toCents(amount[1] as string);
        continue;
      }
    }
    const taxRow = TAX_ROW.exec(line)?.groups;
    if (taxRow) {
      const code = taxRow.code as string;
      const gross = grossFromTaxRow(Number(taxRow.rate), allAmounts(taxRow.rest as string));
      if (gross !== null && taxGrossCents[code] === undefined) taxGrossCents[code] = gross;
    }
  }

  const taxValues = Object.values(taxGrossCents);
  const taxTotal = taxValues.length > 0 ? taxValues.reduce((a, b) => a + b, 0) : null;
  // On a tie the printed total wins, then the payment line: the tax table is
  // only complete if every row was readable.
  const detectedTotalCents = mostAgreedValue([printedTotal, paymentTotal, taxTotal]);

  // Doubtful quantity lines: if quantity times unit price makes the positions
  // add up to the receipt total, or to the gross amount of their tax code, the
  // printed total was the misread number.
  const itemsSum = items.reduce((sum, item) => sum + item.amountCents, 0);
  for (const { item, computedCents } of doubtful) {
    const change = computedCents - item.amountCents;
    const code = item.taxCode;
    const codeSum = items
      .filter((other) => other.taxCode === code)
      .reduce((sum, other) => sum + other.amountCents, 0);
    const fixesTotal = itemsSum + change === detectedTotalCents;
    const fixesTaxCode = code !== undefined && codeSum + change === taxGrossCents[code];
    if (fixesTotal || fixesTaxCode) {
      item.amountCents = computedCents;
      break;
    }
  }
  for (const { item } of doubtful) {
    if ((item.quantity ?? 0) * (item.unitPriceCents ?? 0) !== item.amountCents) {
      item.needsReview = true;
    }
  }

  // Exactly one article without a readable price: the receipt total says what
  // it cost. The position stays marked so that someone looks at it.
  const unpriced = items.filter((item) => item.amountCents === 0 && item.needsReview);
  if (unpriced.length === 1 && detectedTotalCents !== null) {
    const missing = detectedTotalCents - items.reduce((sum, item) => sum + item.amountCents, 0);
    if (missing > 0) (unpriced[0] as ParsedItem).amountCents = missing;
  }

  return {
    merchant: MERCHANT,
    date: findDate(lines),
    detectedTotalCents,
    taxGrossCents,
    items,
  };
}

/** Compares the positions with the receipt total and with the tax table. */
export function checkReceipt(receipt: ParsedReceipt): ReceiptChecks {
  const itemsSumCents = receipt.items.reduce((sum, item) => sum + item.amountCents, 0);
  const totalMatches =
    receipt.detectedTotalCents === null ? null : receipt.detectedTotalCents === itemsSumCents;

  let taxTableMatches: boolean | null = null;
  const codes = Object.keys(receipt.taxGrossCents);
  if (codes.length > 0 && receipt.items.every((item) => item.taxCode !== undefined)) {
    const sums: Record<string, number> = {};
    for (const item of receipt.items) {
      const code = item.taxCode as string;
      sums[code] = (sums[code] ?? 0) + item.amountCents;
    }
    const allCodes = new Set([...codes, ...Object.keys(sums)]);
    taxTableMatches = [...allCodes].every((code) => sums[code] === receipt.taxGrossCents[code]);
  }

  return { itemsSumCents, totalMatches, taxTableMatches };
}

/**
 * Spreads a discount on the whole purchase over all positions in proportion to
 * their price. The reductions add up to exactly the discount: leftover cents go
 * to the positions with the largest remainder, earlier positions first.
 */
export function spreadDiscount(items: ParsedItem[], discountCents: number): void {
  const targets = items.filter((item) => item.amountCents > 0);
  const base = targets.reduce((sum, item) => sum + item.amountCents, 0);
  if (base === 0 || discountCents <= 0) return;

  const parts = targets.map((item, position) => {
    const exact = discountCents * item.amountCents;
    return { item, position, cents: Math.floor(exact / base), remainder: exact % base };
  });
  let leftover = discountCents - parts.reduce((sum, part) => sum + part.cents, 0);
  const byRemainder = [...parts].sort(
    (a, b) => b.remainder - a.remainder || a.position - b.position,
  );
  for (const part of byRemainder) {
    if (leftover === 0) break;
    part.cents += 1;
    leftover -= 1;
  }
  for (const part of parts) part.item.amountCents -= part.cents;
}

function normalizeLine(line: string): string {
  return (
    line
      // Tesseract likes typographic lookalikes of the comma and the apostrophe.
      .replace(/[‚„]/g, ',')
      .replace(/[‘’´`]/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .replace(PRICE_WITHOUT_COMMA, '$1,$2 $3')
  );
}

/**
 * "Summe", also when OCR turns the narrow bold letters into "Sunne" or "Sullme".
 * A lookalike only counts without a tax code behind the amount; "Suppe 1,49 B"
 * is an article.
 */
function isTotalLine(line: string): boolean {
  if (/^Summe\b/i.test(line)) return true;
  if (!wordLike(line, 'summe', 2)) return false;
  return PRICE_TAIL.exec(line)?.groups?.code === undefined;
}

function isBlockEnd(line: string): boolean {
  return BLOCK_END.test(line) || wordLike(line, 'kartenzahlung', 3) || wordLike(line, 'steuer', 1);
}

/**
 * Does the line start with (something OCR made of) the given word? Compares the
 * letters up to the first digit, blanks removed, so "Kar tenzahlung 30,22" and
 * "Karterzahlung" both count as "kartenzahlung".
 */
function wordLike(line: string, word: string, maxDistance: number): boolean {
  const start = (/^[^\d]*/.exec(line)?.[0] ?? '').toLowerCase().replace(/[^\p{L}]/gu, '');
  const first = (/^\P{L}*(\p{L}+)/u.exec(line)?.[1] ?? '').toLowerCase();
  return [start, first].some(
    (candidate) =>
      Math.abs(candidate.length - word.length) <= maxDistance &&
      editDistance(candidate, word) <= maxDistance,
  );
}

/** Levenshtein distance. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = (previous[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1);
      current[j] = Math.min(
        substitution,
        (previous[j] as number) + 1,
        (current[j - 1] as number) + 1,
      );
    }
    previous = current;
  }
  return previous[b.length] as number;
}

/**
 * Tidies an article name. Kaufland abbreviates with full stops ("Teek.Türk.Apfel");
 * the only commas in names are decimal commas ("2,5kg"). OCR adds stray
 * characters at both ends, a blank in front of a full stop, and reads a full
 * stop as a comma now and then.
 */
function cleanLabel(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/ ([.,])/g, '$1')
    .replace(/(?<!\d),|,(?!\d)/g, '.')
    .replace(/[^\p{L}\p{N}.%)]+$/u, '')
    .trim();
}

function letterCount(text: string): number {
  return text.match(/\p{L}/gu)?.length ?? 0;
}

function kindOf(label: string): ParsedItem['kind'] {
  return /^pfand/i.test(label) ? 'deposit' : 'item';
}

function withTax(item: ParsedItem, taxCode: string | undefined): ParsedItem {
  if (taxCode) item.taxCode = taxCode;
  return item;
}

function toCents(amount: string): number {
  const digits = amount.replace(/\s/g, '').replace('.', ',');
  const [euros, cents] = digits.split(',');
  return Number(euros) * 100 + Number(cents);
}

function allAmounts(text: string): number[] {
  const pattern = new RegExp(String.raw`(?<![\d,.])${AMOUNT}(?![\d,.])`, 'g');
  return (text.match(pattern) ?? []).map(toCents);
}

function lastAmount(text: string): number | null {
  return allAmounts(text).at(-1) ?? null;
}

/**
 * Gross amount of one tax table row ("A 19,00% 0,95 0,80 0,15": gross, net, tax).
 * The three numbers check each other, so one misread number can be told apart.
 */
function grossFromTaxRow(ratePercent: number, amounts: number[]): number | null {
  const rate = ratePercent / 100;
  const near = (a: number, b: number) => Math.abs(a - b) <= 2;
  const netOf = (gross: number) => Math.round(gross / (1 + rate));

  if (amounts.length >= 3) {
    const [gross, net, tax] = amounts as [number, number, number];
    if (gross === net + tax) return gross;
    // Gross misread: net and tax still fit the rate.
    if (near(net * rate, tax)) return net + tax;
    return gross;
  }
  if (amounts.length === 2) {
    const [first, second] = amounts as [number, number];
    if (near(first * rate, second)) return first + second; // net, tax
    if (near(netOf(first), second) || near(first - netOf(first), second)) return first; // gross, …
    return null;
  }
  return null;
}

function findDate(lines: readonly string[]): string | null {
  for (const line of lines) {
    const match = DATE_LINE.exec(line);
    const date = match && toIsoDate(match[1], match[2], match[3]);
    if (date) return date;
  }
  for (const line of lines) {
    const match = DATE_ANYWHERE.exec(line);
    const date = match && toIsoDate(match[1], match[2], match[3]);
    if (date) return date;
  }
  return null;
}

function toIsoDate(day?: string, month?: string, year?: string): string | null {
  const d = Number(day);
  const m = Number(month);
  let y = Number(year);
  if (year?.length === 2) y += 2000;
  if (!(d >= 1 && d <= 31 && m >= 1 && m <= 12 && y >= 2000 && y <= 2100)) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** The value most sources agree on; on a tie the earlier source wins. */
function mostAgreedValue(candidates: (number | null)[]): number | null {
  let best: number | null = null;
  let bestCount = 0;
  for (const candidate of candidates) {
    if (candidate === null) continue;
    const count = candidates.filter((other) => other === candidate).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}
