// Text recognition: image in, positions out.
//
// The steps behind this interface (see docs/PLAN.md, "Texterkennung im Detail"):
//   preprocess.ts  photo → clean working image
//   segment.ts     working image → text fragments with position and tilt
//   recognize.ts   fragments → text (Tesseract)
//   lines.ts       fragments → text lines
//   kaufland.ts    text lines → positions, total, tax table, date
//
// Only this file is used by the rest of the app, so the engine or the rule set
// can be replaced without touching anything else.

import { checkReceipt, parseKauflandReceipt } from './kaufland';
import { assembleLines } from './lines';
import { type PreparedImage, prepareImage } from './preprocess';
import { readFragments } from './recognize';
import { findComponents, groupFragments } from './segment';
import type { ParsedReceipt, ReceiptChecks } from './types';

export interface Recognition {
    /** Upright JPEG of the photo for storage and display. */
    image: Buffer;
    receipt: ParsedReceipt;
    checks: ReceiptChecks;
    /** The text lines as read, for the report and for troubleshooting. */
    lines: string[];
    /** False if nothing usable was found; the UI then opens an empty receipt with the image. */
    usable: boolean;
}

export async function recognizeReceipt(input: Buffer): Promise<Recognition> {
    const prepared = await prepareImage(input);
    const lines = await readLines(prepared);
    const receipt = parseKauflandReceipt(lines);
    return {
        image: prepared.display,
        receipt,
        checks: checkReceipt(receipt),
        lines,
        usable: receipt.items.length > 0,
    };
}

async function readLines(prepared: PreparedImage): Promise<string[]> {
    const components = findComponents(prepared.ink, prepared.width, prepared.height);
    const { fragments, letterHeight, slope } = groupFragments(components);
    if (fragments.length === 0) return [];
    const texts = await readFragments(prepared, fragments);
    return assembleLines(texts, slope, letterHeight).map((line) => line.text);
}

export type { ParsedItem, ParsedReceipt, ReceiptChecks } from './types';
