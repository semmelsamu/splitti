// The whole recognition on the three real photos. Needs the tesseract binary;
// the language model comes from tessdata/ in the repo.
//
// What is asserted is what matters for splitting costs and what proved stable:
// amounts, total, date. Exact names are not asserted letter by letter; the
// detailed result per line is in docs/OCR-BERICHT.md.

import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { type Recognition, recognizeReceipt } from '../../src/ocr';
import type { ParsedReceipt } from '../../src/ocr/types';

const fixtures = path.resolve('tests/fixtures/receipts');

function photo(name: string): Buffer {
    return fs.readFileSync(path.join(fixtures, `kaufland-${name}.png`));
}

function expected(name: string): ParsedReceipt {
    return JSON.parse(
        fs.readFileSync(path.join(fixtures, `kaufland-${name}.expected.json`), 'utf8'),
    );
}

/** Levenshtein distance. */
function distance(a: string, b: string): number {
    let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        for (let j = 1; j <= b.length; j++) {
            current[j] = Math.min(
                (previous[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
                (previous[j] as number) + 1,
                (current[j - 1] as number) + 1,
            );
        }
        previous = current;
    }
    return previous[b.length] as number;
}

describe('receipt A: unmarked, heavily crumpled', () => {
    const want = expected('a');
    let got: Recognition;
    beforeAll(async () => {
        got = await recognizeReceipt(photo('a'));
    });

    it('finds every position with the right amount, in order', () => {
        expect(got.receipt.items.map((item) => item.amountCents)).toEqual(
            want.items.map((item) => item.amountCents),
        );
    });

    it('joins the quantity lines with their articles', () => {
        expect(got.receipt.items.map((item) => item.quantity)).toEqual(
            want.items.map((item) => item.quantity),
        );
    });

    it('reads the total, and the positions add up to it', () => {
        expect(got.receipt.detectedTotalCents).toBe(want.detectedTotalCents);
        expect(got.checks.totalMatches).toBe(true);
    });

    it('reads the names with at most a few wrong characters', () => {
        got.receipt.items.forEach((item, index) => {
            const label = want.items[index]?.label ?? '';
            expect(distance(item.label, label), `${item.label} ~ ${label}`).toBeLessThanOrEqual(3);
        });
    });

    it('finds no date, because the photo shows none', () => {
        expect(got.receipt.date).toBeNull();
    });

    it('is usable and returns an upright JPEG for storage', () => {
        expect(got.usable).toBe(true);
        expect(got.image.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    });
});

describe('receipt B: seven prices under orange marker', () => {
    const want = expected('b');
    let got: Recognition;
    beforeAll(async () => {
        got = await recognizeReceipt(photo('b'));
    });

    it('finds every position with the right amount, in order', () => {
        expect(got.receipt.items.map((item) => item.amountCents)).toEqual(
            want.items.map((item) => item.amountCents),
        );
    });

    it('tells deposit from articles', () => {
        expect(got.receipt.items.map((item) => item.kind)).toEqual(
            want.items.map((item) => item.kind),
        );
    });

    it('reads total, tax table and date', () => {
        expect(got.receipt.detectedTotalCents).toBe(want.detectedTotalCents);
        expect(got.receipt.taxGrossCents).toEqual(want.taxGrossCents);
        expect(got.receipt.date).toBe(want.date);
        expect(got.checks.totalMatches).toBe(true);
    });
});

describe('receipt C: five prices boxed by hand', () => {
    const want = expected('c');
    // The typed-out template swaps two prices compared with the photo
    // (Teek.Türk.Apfel and K.Sandwichtoast VK). These are the amounts as the
    // photo shows them, top to bottom.
    const amountsOnPhoto = [189, 175, 79, 249, 249, 119, 229, 425, 209, 564, 188, 154];
    let got: Recognition;
    beforeAll(async () => {
        got = await recognizeReceipt(photo('c'));
    });

    it('finds all twelve positions', () => {
        expect(got.receipt.items).toHaveLength(want.items.length);
    });

    it('reads the amounts; only prices inside a hand-drawn box may deviate', () => {
        const boxedRows = new Set([3, 4, 9, 10, 11]);
        got.receipt.items.forEach((item, index) => {
            if (boxedRows.has(index)) return;
            expect(item.amountCents, item.label).toBe(amountsOnPhoto[index]);
        });
        const right = got.receipt.items.filter(
            (item, index) => item.amountCents === amountsOnPhoto[index],
        ).length;
        expect(right).toBeGreaterThanOrEqual(11);
    });

    it('reads total and date, so the deviation shows up in the sum check', () => {
        expect(got.receipt.detectedTotalCents).toBe(want.detectedTotalCents);
        expect(got.receipt.date).toBe(want.date);
    });

    it('joins quantity and weight lines with their articles', () => {
        expect(got.receipt.items[9]).toMatchObject({ quantity: 3, unitPriceCents: 188 });
        expect(got.receipt.items[11]).toMatchObject({ weightKg: 0.44 });
    });
});

describe('images without a receipt', () => {
    it('reports a blank image as not usable instead of failing', async () => {
        const sharp = (await import('sharp')).default;
        const blank = await sharp({
            create: { width: 600, height: 800, channels: 3, background: '#ffffff' },
        })
            .png()
            .toBuffer();
        const result = await recognizeReceipt(blank);
        expect(result.usable).toBe(false);
        expect(result.receipt.items).toEqual([]);
    });
});
