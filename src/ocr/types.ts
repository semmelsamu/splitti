// Shared types of the text recognition. The interface of the whole module is
// "image in, positions out" (see index.ts), so the engine behind it stays replaceable.

export type ItemKind = 'item' | 'deposit' | 'discount';

/** One position as read from the receipt, before it becomes a draft in the UI. */
export interface ParsedItem {
  label: string;
  /** After deduction of discounts that belong to this position. */
  amountCents: number;
  kind: ItemKind;
  /** Tax code printed after the price (Kaufland: A = 19 %, B = 7 %). Missing if unreadable. */
  taxCode?: string;
  /** Only for quantity lines ("3 * 1,00"). */
  quantity?: number;
  unitPriceCents?: number;
  /** Only for goods sold by weight ("0,440 kg"). */
  weightKg?: number;
  /** Set when the line could not be read completely, e.g. a name without a price. */
  needsReview?: true;
}

export interface ParsedReceipt {
  merchant: string;
  /** YYYY-MM-DD, or null if the receipt shows no readable date. */
  date: string | null;
  /** The total printed on the receipt, or null if unreadable. */
  detectedTotalCents: number | null;
  /** Gross amounts of the tax table per tax code. */
  taxGrossCents: Record<string, number>;
  items: ParsedItem[];
}

/** The second check from the plan: positions against total and tax table. */
export interface ReceiptChecks {
  itemsSumCents: number;
  /** null if the receipt total could not be read. */
  totalMatches: boolean | null;
  /** null if the tax table could not be read or a position has no tax code. */
  taxTableMatches: boolean | null;
}

/** A word as delivered by Tesseract, in pixels of the image that was recognised. */
export interface OcrWord {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** 0–100 */
  confidence: number;
}

/** A piece of recognised text with its place on the receipt (pixels of the working image). */
export interface TextFragment {
  text: string;
  /** 0–100, average over its words. */
  confidence: number;
  left: number;
  right: number;
  /** Centre of the band of letters. */
  cx: number;
  cy: number;
}

/** A text line of the receipt: fragments from left to right, name first, price last. */
export interface OcrLine {
  text: string;
  fragments: TextFragment[];
}
