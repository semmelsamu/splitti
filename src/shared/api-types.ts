// Shapes of the JSON the API sends and receives, shared by server and UI.

export interface MemberDto {
  id: number;
  name: string;
  color: string;
  /** False for members that were removed but still appear in old entries. */
  active: boolean;
}

export interface BalanceDto {
  memberId: number;
  /** Positive: the group owes this member. Negative: the member owes the group. */
  cents: number;
}

export interface GroupDto {
  group: { name: string; createdAt: string };
  members: MemberDto[];
  balances: BalanceDto[];
}

export interface CreatedGroupDto {
  token: string;
  memberId: number;
}

export interface ApiErrorDto {
  error: string;
  /** German, fit to show to the user. */
  message: string;
}

export type ItemKind = 'item' | 'deposit' | 'discount';
export type ReceiptSource = 'scan' | 'manual';

/** Result of POST …/scan: a draft, nothing is saved yet except the image. */
export interface ScanDto {
  /** Handle of the uploaded image; passed on when the receipt is saved. */
  imageId: string;
  /** False if nothing usable was recognised: the receipt starts empty, with the image. */
  usable: boolean;
  merchant: string;
  /** YYYY-MM-DD, or null if the receipt shows no readable date. */
  date: string | null;
  detectedTotalCents: number | null;
  items: ScanItemDto[];
}

export interface ScanItemDto {
  label: string;
  amountCents: number;
  kind: ItemKind;
  /** The line could not be read completely; the UI asks the user to check it. */
  needsReview: boolean;
}

/** A position as sent when saving a receipt. */
export interface ItemInput {
  /** Id of the existing position when changing a receipt; omitted for new ones. */
  id?: number;
  label: string;
  amountCents: number;
  kind: ItemKind;
  /** At least one member; equal shares. */
  memberIds: number[];
}

export interface ReceiptInput {
  paidBy: number;
  /** YYYY-MM-DD */
  date: string;
  merchant: string;
  source: ReceiptSource;
  detectedTotalCents: number | null;
  /** From ScanDto; only when creating a scanned receipt. */
  imageId?: string | null;
  items: ItemInput[];
}

export interface ReceiptSummaryDto {
  id: number;
  merchant: string;
  date: string;
  source: ReceiptSource;
  paidBy: number;
  /** Sum of the positions: the amount that counts. */
  totalCents: number;
  hasImage: boolean;
  createdAt: string;
  /** ISO timestamp if the receipt is deleted (and can be restored). */
  deletedAt: string | null;
}

export interface ItemDto {
  id: number;
  label: string;
  amountCents: number;
  kind: ItemKind;
  memberIds: number[];
}

export interface ChangeDto {
  id: number;
  /** Who made the change; null if unknown. */
  memberId: number | null;
  /** ISO timestamp */
  at: string;
  entity: 'group' | 'member' | 'receipt' | 'payment';
  entityId: number;
  action: string;
  /** German sentence without subject, e.g. "hat den Beleg angelegt". */
  summary: string;
}

export interface ReceiptDetailDto extends ReceiptSummaryDto {
  detectedTotalCents: number | null;
  items: ItemDto[];
  /** What each member bears of this receipt, rounded per the rules of the plan. */
  shares: { memberId: number; cents: number }[];
  history: ChangeDto[];
}
