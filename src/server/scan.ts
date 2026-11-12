// POST …/scan: photo in, draft out. The recognition itself is in src/ocr and
// knows nothing about groups; this file connects it to the group's storage.

import sharp from 'sharp';
import { formatCents } from '../core/money';
import { type ParsedItem, recognizeReceipt } from '../ocr';
import type { ScanDto, ScanItemDto } from '../shared/api-types';
import { ApiError, invalid } from './http';
import { removeOldDrafts, saveDraftImage } from './images';

/** Photos from a phone camera are a few megabytes. */
const MAX_BYTES = 20 * 1024 * 1024;

// One recognition at a time: it keeps a small home server responsive when two
// people scan at once. Later requests wait their turn.
let queue: Promise<unknown> = Promise.resolve();
function inTurn<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

/**
 * Name of a position in the draft. Quantity and weight have no column of their
 * own in the data model, so they become part of the name, as in the wireframe
 * ("Barilla Girandole · 3 × 1,00").
 */
export function draftLabel(item: ParsedItem): string {
  if (item.quantity !== undefined && item.unitPriceCents !== undefined) {
    return `${item.label} · ${item.quantity} × ${formatCents(item.unitPriceCents)}`;
  }
  if (item.weightKg !== undefined) {
    return `${item.label} · ${item.weightKg.toFixed(3).replace('.', ',')} kg`;
  }
  return item.label;
}

function draftItem(item: ParsedItem): ScanItemDto {
  return {
    label: draftLabel(item).slice(0, 80),
    amountCents: item.amountCents,
    kind: item.kind,
    needsReview: item.needsReview === true,
  };
}

export async function scanReceipt(groupId: number, request: Request): Promise<ScanDto> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BYTES) throw tooLarge();
  const image = Buffer.from(await request.arrayBuffer());
  if (image.length === 0) throw invalid('Es wurde kein Bild hochgeladen.');
  if (image.length > MAX_BYTES) throw tooLarge();

  // Is it an image at all? Checked before queueing, so the answer comes at once.
  try {
    await sharp(image, { failOn: 'none' }).metadata();
  } catch {
    throw unreadable();
  }

  const recognition = await inTurn(async () => {
    try {
      return await recognizeReceipt(image);
    } catch (error) {
      // The file looked like an image but could not be decoded.
      if (isUnreadableImage(error)) throw unreadable();
      throw error;
    }
  });

  removeOldDrafts();
  const imageId = saveDraftImage(groupId, recognition.image);

  return {
    imageId,
    usable: recognition.usable,
    merchant: recognition.receipt.merchant,
    date: recognition.receipt.date,
    detectedTotalCents: recognition.receipt.detectedTotalCents,
    items: recognition.usable ? recognition.receipt.items.map(draftItem) : [],
  };
}

function unreadable(): ApiError {
  return invalid('Das Bild konnte nicht gelesen werden. Bitte ein JPEG- oder PNG-Foto wählen.');
}

function tooLarge(): ApiError {
  return new ApiError(413, 'too_large', 'Das Bild ist zu groß (höchstens 20 MB).');
}

function isUnreadableImage(error: unknown): boolean {
  return (
    error instanceof Error &&
    /unsupported image format|Input buffer|bad seek|corrupt|premature end/i.test(error.message)
  );
}
