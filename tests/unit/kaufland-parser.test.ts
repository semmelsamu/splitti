import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkReceipt, parseKauflandReceipt, spreadDiscount } from '../../src/ocr/kaufland';
import type { ParsedItem, ParsedReceipt } from '../../src/ocr/types';

const fixtures = path.resolve('tests/fixtures/receipts');

function templateLines(name: string): string[] {
  return fs.readFileSync(path.join(fixtures, `kaufland-${name}.txt`), 'utf8').split('\n');
}

function expected(name: string): ParsedReceipt {
  return JSON.parse(fs.readFileSync(path.join(fixtures, `kaufland-${name}.expected.json`), 'utf8'));
}

/** Parses an invented receipt: the lines between "Preis EUR" and the footer. */
function parseBlock(articleLines: string[], footer: string[] = []): ParsedReceipt {
  return parseKauflandReceipt(['Preis EUR', ...articleLines, ...footer]);
}

function sum(items: ParsedItem[]): number {
  return items.reduce((total, item) => total + item.amountCents, 0);
}

describe('Kaufland parser on the three typed-out test receipts', () => {
  // The date line is printed below the part that was typed out (the templates end
  // at the tax table); it is added here the way the photo shows it.
  const dateLineOnPhoto: Record<string, string | null> = {
    a: null,
    b: 'Datum 27.10.26',
    c: 'Datum 09.11.26',
  };

  for (const name of ['a', 'b', 'c']) {
    describe(`kaufland-${name}`, () => {
      const want = expected(name);
      const got = parseKauflandReceipt(templateLines(name));

      it('yields exactly the expected positions', () => {
        expect(got.items).toStrictEqual(want.items);
      });

      it('reads the receipt total', () => {
        expect(got.detectedTotalCents).toBe(want.detectedTotalCents);
      });

      it('reads the gross amounts of the tax table', () => {
        expect(got.taxGrossCents).toStrictEqual(want.taxGrossCents);
      });

      it('names the merchant', () => {
        expect(got.merchant).toBe(want.merchant);
      });

      it('passes both checks: positions add up to the total and match the tax table', () => {
        expect(checkReceipt(got)).toStrictEqual({
          itemsSumCents: want.detectedTotalCents,
          totalMatches: true,
          taxTableMatches: true,
        });
      });

      it('reads the date where the receipt shows one', () => {
        const dateLine = dateLineOnPhoto[name];
        const lines = dateLine ? [...templateLines(name), dateLine] : templateLines(name);
        expect(parseKauflandReceipt(lines).date).toBe(want.date);
      });
    });
  }

  it('has no date when the typed-out part ends before the date line', () => {
    expect(parseKauflandReceipt(templateLines('b')).date).toBeNull();
  });
});

describe('special lines', () => {
  it('joins a quantity line with the name above it', () => {
    const { items } = parseBlock(['Barilla Girandole', '3 * 1,00 3,00 B']);
    expect(items).toStrictEqual([
      {
        label: 'Barilla Girandole',
        amountCents: 300,
        kind: 'item',
        taxCode: 'B',
        quantity: 3,
        unitPriceCents: 100,
      },
    ]);
  });

  it('joins a weight line with the name above it', () => {
    const { items } = parseBlock(['Äpfel Pink Lady kg', '0,440 kg 1,54 B']);
    expect(items).toStrictEqual([
      { label: 'Äpfel Pink Lady kg', amountCents: 154, kind: 'item', taxCode: 'B', weightKg: 0.44 },
    ]);
  });

  it('marks deposit as its own kind, with and without quantity', () => {
    const { items } = parseBlock([
      'Paul. Spezi Zero 0,95 A',
      'Pfandartikel 0,25 A',
      'Pfandartikel 2 * 0,25 0,50 A',
    ]);
    expect(items.map((item) => [item.label, item.kind, item.amountCents])).toEqual([
      ['Paul. Spezi Zero', 'item', 95],
      ['Pfandartikel', 'deposit', 25],
      ['Pfandartikel', 'deposit', 50],
    ]);
    expect(items[2]).toMatchObject({ quantity: 2, unitPriceCents: 25 });
  });

  it('does not mistake numbers inside a name for the price', () => {
    const { items } = parseBlock([
      'Kartoffeln 2,5kg 3,79 B',
      'KLC TaTü 4lg 15x10 1,75 A',
      'Gelbstecker 10 st. 5,79 A',
    ]);
    expect(items.map((item) => [item.label, item.amountCents])).toEqual([
      ['Kartoffeln 2,5kg', 379],
      ['KLC TaTü 4lg 15x10', 175],
      ['Gelbstecker 10 st.', 579],
    ]);
    expect(items.every((item) => item.quantity === undefined)).toBe(true);
  });

  it('drops everything below the total: payment, tax table, card data, loyalty points', () => {
    const receipt = parseBlock(
      ['Salami vegan 1,00 B'],
      [
        'Summe 1,00',
        'Kartenzahlung 1,00',
        'Steuer % Brutto Netto Steuer',
        'B 7,00% 1,00 0,93 0,07',
        'Kartenzahlung',
        '-K-U-N-D-E-N-B-E-L-E-G-',
        'Kaufland DE 6310',
        'Kaufland Card Punkte 12',
        'EUR 1,00',
      ],
    );
    expect(receipt.items).toHaveLength(1);
    expect(receipt.detectedTotalCents).toBe(100);
    expect(receipt.taxGrossCents).toEqual({ B: 100 });
  });

  it('ignores the receipt head above "Preis EUR"', () => {
    const receipt = parseKauflandReceipt([
      'Kaufland',
      'Musterstraße 1 2,50 B',
      'DE187842010',
      'Preis EUR',
      'Salami vegan 1,00 B',
      'Summe 1,00',
    ]);
    expect(receipt.items.map((item) => item.label)).toEqual(['Salami vegan']);
  });
});

// The plan has no real receipt with a discount line, so these templates are invented.
describe('discounts (invented templates)', () => {
  it('a discount directly below an article reduces that article', () => {
    const receipt = parseBlock(
      ['Bio Bananen 1,99 B', 'Rabatt 30% -0,60 B', 'Salami vegan 1,00 B'],
      ['Summe 2,39'],
    );
    expect(receipt.items).toStrictEqual([
      { label: 'Bio Bananen', amountCents: 139, kind: 'item', taxCode: 'B' },
      { label: 'Salami vegan', amountCents: 100, kind: 'item', taxCode: 'B' },
    ]);
    expect(checkReceipt(receipt).totalMatches).toBe(true);
  });

  it('accepts the minus sign behind the amount', () => {
    const { items } = parseBlock(['Bio Bananen 1,99 B', 'Preisvorteil 0,60- B']);
    expect(items[0]?.amountCents).toBe(139);
  });

  it('applies several discount lines to the same article', () => {
    const { items } = parseBlock(['Käse 4,00 B', 'Rabatt -0,50 B', 'Coupon -1,00 B']);
    expect(items).toHaveLength(1);
    expect(items[0]?.amountCents).toBe(250);
  });

  it('reduces the total price of a quantity line', () => {
    const { items } = parseBlock(['Barilla Girandole', '3 * 1,00 3,00 B', 'Rabatt -0,30 B']);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ label: 'Barilla Girandole', amountCents: 270, quantity: 3 });
  });

  it('spreads a discount on the whole purchase over all positions by price', () => {
    const receipt = parseBlock(
      ['Wein 6,00 A', 'Brot 3,00 B', 'Butter 1,00 B', 'Zwischensumme 10,00', '10% Rabatt -1,00'],
      ['Summe 9,00'],
    );
    expect(receipt.items.map((item) => item.amountCents)).toEqual([540, 270, 90]);
    expect(checkReceipt(receipt).totalMatches).toBe(true);
  });

  it('recognises a whole-purchase discount by its wording, without a subtotal line', () => {
    const { items } = parseBlock(['Wein 6,00 A', 'Brot 4,00 B', 'Rabatt auf Einkauf -2,00']);
    expect(items.map((item) => item.amountCents)).toEqual([480, 320]);
  });

  it('keeps the sum exact when the spread does not divide evenly', () => {
    const receipt = parseBlock(
      ['A 0,99 B', 'B 0,99 B', 'C 0,99 B', 'Zwischensumme 2,97', 'Rabatt -1,00'],
      ['Summe 1,97'],
    );
    expect(sum(receipt.items)).toBe(197);
    // 33,33 cents each; the leftover cent goes to the first position.
    expect(receipt.items.map((item) => item.amountCents)).toEqual([65, 66, 66]);
  });

  it('keeps a discount as its own position when it would turn the article negative', () => {
    const { items } = parseBlock(['Brötchen 0,30 B', 'Gutschein -1,00 B']);
    expect(items).toStrictEqual([
      { label: 'Brötchen', amountCents: 30, kind: 'item', taxCode: 'B' },
      { label: 'Gutschein', amountCents: -100, kind: 'discount', taxCode: 'B' },
    ]);
  });

  it('treats returned deposit as a position, not as a discount on the article above', () => {
    const { items } = parseBlock(['Wasser 0,49 A', 'Leergut -1,50 A']);
    expect(items).toStrictEqual([
      { label: 'Wasser', amountCents: 49, kind: 'item', taxCode: 'A' },
      { label: 'Leergut', amountCents: -150, kind: 'deposit', taxCode: 'A' },
    ]);
  });
});

describe('spreadDiscount', () => {
  const item = (amountCents: number): ParsedItem => ({ label: 'x', amountCents, kind: 'item' });

  it('always removes exactly the discount', () => {
    for (const discount of [1, 7, 50, 99, 333]) {
      const items = [item(279), item(95), item(300), item(189), item(1)];
      const before = sum(items);
      spreadDiscount(items, discount);
      expect(sum(items)).toBe(before - discount);
    }
  });

  it('leaves positions with a negative amount alone', () => {
    const items = [item(1000), item(-150)];
    spreadDiscount(items, 100);
    expect(items.map((i) => i.amountCents)).toEqual([900, -150]);
  });
});

describe('tolerance for OCR slips', () => {
  it('reads a dot as decimal separator and lookalikes of the tax code', () => {
    const { items } = parseBlock([
      'Tradizion.Margher. 1.79 8',
      'Kartoffeln 2,5Kg 3,796',
      'KLC Vollwaschm. 4,25 *',
      'Barilla Pesto Ros.',
      '3 + 1,88 5,64 B7',
    ]);
    expect(items.map((i) => [i.label, i.amountCents, i.taxCode])).toEqual([
      ['Tradizion.Margher.', 179, 'B'],
      ['Kartoffeln 2,5Kg', 379, 'B'],
      ['KLC Vollwaschm.', 425, 'A'],
      ['Barilla Pesto Ros.', 564, 'B'],
    ]);
    expect(items[3]).toMatchObject({ quantity: 3, unitPriceCents: 188 });
  });

  it('tidies names: blank before a full stop, comma for full stop, stray characters at the end', () => {
    const { items } = parseBlock([
      'Ofenfr .Rucolapesto 1,79 B',
      'Taek ,Strawb .Chees/ 2,49 B',
      'Rotbusch Sahne-Ka, 2,49 B',
      'Kartoffeln 2,5Kg 3,79 B',
      'Paul. Spezi Zero 0,95 A',
    ]);
    expect(items.map((i) => i.label)).toEqual([
      'Ofenfr.Rucolapesto',
      'Taek.Strawb.Chees',
      'Rotbusch Sahne-Ka.',
      'Kartoffeln 2,5Kg',
      'Paul. Spezi Zero',
    ]);
  });

  it('strips stray characters in front of a name', () => {
    const { items } = parseBlock(['/ Pfandartikel 2 * 0,25 0,50 A', '>KVeg.No Milk 0,95 A']);
    expect(items.map((i) => [i.label, i.kind])).toEqual([
      ['Pfandartikel', 'deposit'],
      ['KVeg.No Milk', 'item'],
    ]);
  });

  it('accepts a price without a readable tax code', () => {
    const receipt = parseBlock(['KLC.Backpapier 0,79'], ['Summe 0,79']);
    expect(receipt.items).toStrictEqual([
      { label: 'KLC.Backpapier', amountCents: 79, kind: 'item' },
    ]);
    // Without tax codes the tax table cannot be compared.
    expect(checkReceipt(receipt).taxTableMatches).toBeNull();
  });

  it('keeps an article whose price is unreadable, marked for review', () => {
    const { items } = parseBlock(['Kveg. Tofu Natur 2,2', 'Gelbstecker 10 St. 5,79 A']);
    expect(items).toStrictEqual([
      // The remains of the price are not part of the name.
      { label: 'Kveg. Tofu Natur', amountCents: 0, kind: 'item', needsReview: true },
      { label: 'Gelbstecker 10 St.', amountCents: 579, kind: 'item', taxCode: 'A' },
    ]);
  });

  it('fills in the one unreadable price from the receipt total and keeps it marked', () => {
    const receipt = parseBlock(
      ['Ofenfr.Rucolapesto 1,79 B', "Tradizion.Margher. \\',798", 'Paul. Spezi Zero 0,95 A'],
      ['Summe 4,53'],
    );
    expect(receipt.items[1]).toStrictEqual({
      label: 'Tradizion.Margher.',
      amountCents: 179,
      kind: 'item',
      needsReview: true,
    });
    expect(checkReceipt(receipt).totalMatches).toBe(true);
  });

  it('does not guess when more than one price is unreadable', () => {
    const receipt = parseBlock(['Brot', 'Butter', 'Salami vegan 1,00 B'], ['Summe 4,00']);
    expect(receipt.items.map((item) => item.amountCents)).toEqual([0, 0, 100]);
  });

  it('corrects a misread total of a quantity line with the help of the receipt total', () => {
    const receipt = parseBlock(
      ['Paul. Spezi Zero 0,95 A', 'Pfandartikel 2 * 0,25 1,50 A'],
      ['Summe 1,45'],
    );
    expect(receipt.items[1]).toStrictEqual({
      label: 'Pfandartikel',
      amountCents: 50,
      kind: 'deposit',
      taxCode: 'A',
      quantity: 2,
      unitPriceCents: 25,
    });
  });

  it('corrects a misread total of a quantity line with the help of the tax table', () => {
    const receipt = parseBlock(
      ['Paul. Spezi Zero 0,95 A', 'Pfandartikel 2 * 0,25 1,50 A', 'Brot 9,99 B'],
      ['Steuer % Brutto Netto Steuer', 'A 19,00% 1,45 1,22 0,23'],
    );
    expect(receipt.items[1]?.amountCents).toBe(50);
  });

  it('marks a quantity line whose numbers disagree when nothing can decide', () => {
    const receipt = parseBlock(['Pfandartikel 2 * 0,25 1,50 A']);
    expect(receipt.items[0]).toMatchObject({ amountCents: 150, needsReview: true });
  });

  it('reads a price whose comma was lost if the tax code follows', () => {
    const { items } = parseBlock(['Ofenfr.Rucolapesto 179 B', 'Gelbstecker 10 St. 1050 A']);
    expect(items.map((i) => [i.label, i.amountCents])).toEqual([
      ['Ofenfr.Rucolapesto', 179],
      ['Gelbstecker 10 St.', 1050],
    ]);
  });

  it('recognises the total line when OCR garbles the word "Summe"', () => {
    for (const word of ['Sunne', 'Sume', 'SUME', 'Sullme', 'Sumne']) {
      const receipt = parseBlock(['Salami vegan 1,00 B'], [`${word} 1,00`, 'Kartenzahlung 1,00']);
      expect(receipt.items, word).toHaveLength(1);
      expect(receipt.detectedTotalCents, word).toBe(100);
    }
  });

  it('does not take an article starting like "Summe" for the total', () => {
    const { items } = parseBlock(['Sahne 0,99 B', 'Suppe 1,49 B', 'Salami vegan 1,00 B']);
    expect(items.map((i) => i.label)).toEqual(['Sahne', 'Suppe', 'Salami vegan']);
  });

  it('computes the total of a quantity line when the total is missing', () => {
    const { items } = parseBlock(['Barilla Girandole', '3 * 1,00', 'Salami vegan 1,00 B']);
    expect(items[0]).toMatchObject({ label: 'Barilla Girandole', amountCents: 300, quantity: 3 });
    expect(items[1]).toMatchObject({ label: 'Salami vegan', amountCents: 100 });
  });

  it('joins a total that was split off below its quantity line', () => {
    const { items } = parseBlock([
      'Barilla Girandole',
      '3 * 1,00',
      '3,00 B',
      'Salami vegan 1,00 B',
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]).toStrictEqual({
      label: 'Barilla Girandole',
      amountCents: 300,
      kind: 'item',
      taxCode: 'B',
      quantity: 3,
      unitPriceCents: 100,
    });
  });

  it('does not take "6 x 1,50" in a name for a quantity when the arithmetic disagrees', () => {
    const { items } = parseBlock(['Wasser 6 x 1,50 4,99 A']);
    expect(items).toStrictEqual([
      { label: 'Wasser 6 x 1,50', amountCents: 499, kind: 'item', taxCode: 'A' },
    ]);
  });

  it('does not take a volume in a name for a price', () => {
    const { items } = parseBlock(['Coca Cola 1,25 l', '2 * 1,19 2,38 A']);
    expect(items).toStrictEqual([
      {
        label: 'Coca Cola 1,25 l',
        amountCents: 238,
        kind: 'item',
        taxCode: 'A',
        quantity: 2,
        unitPriceCents: 119,
      },
    ]);
  });

  it('starts at the top when the photo does not show "Preis EUR"', () => {
    const receipt = parseKauflandReceipt([
      'irgendein Rest vom Kopf',
      'KLC.Nougat Pockets 2,79 B',
      'Barilla Girandole',
      '3 * 1,00 3,00 B',
      'Summe 5,79',
    ]);
    expect(receipt.items.map((i) => [i.label, i.amountCents])).toEqual([
      ['KLC.Nougat Pockets', 279],
      ['Barilla Girandole', 300],
    ]);
  });

  it('ends the block at the payment line when "Summe" is unreadable', () => {
    const receipt = parseBlock(
      ['Salami vegan 1,00 B', 'KLC.Käseaufschnitt 1,89 B'],
      [
        'Sunne 114883',
        'Kartenzahlung 2,89',
        'Steuer % Brutto Netto Steuer',
        'B 7,00% 2,89 2,70 0,19',
      ],
    );
    expect(receipt.items).toHaveLength(2);
    expect(receipt.detectedTotalCents).toBe(289);
  });

  it('takes a lone amount without tax code as the total when the word "Summe" is lost', () => {
    const receipt = parseBlock(
      ['Salami vegan 1,00 B', 'KLC.Käseaufschnitt 1,89 B'],
      ['D u 2,89', 'Kartenzahlung 2,89'],
    );
    expect(receipt.items).toHaveLength(2);
    expect(receipt.detectedTotalCents).toBe(289);
  });

  it('prefers the total that payment line and tax table agree on over a misread "Summe"', () => {
    const receipt = parseBlock(
      ['Salami vegan 1,00 B', 'KVeg.No Milk 0,95 A'],
      [
        'Summe 7,95',
        'Kartenzahlung 1,95',
        'Steuer % Brutto Netto Steuer',
        'A 19,00% 0,95 0,80 0,15',
        'B 7,00% 1,00 0,93 0,07',
      ],
    );
    expect(receipt.detectedTotalCents).toBe(195);
  });

  it('repairs a misread gross amount in the tax table from net and tax', () => {
    const receipt = parseBlock(
      ['KVeg.No Milk 0,95 A'],
      ['Summe 0,95', 'Steuer % Brutto Netto Steuer', 'A 19,00% 0,99 0,80 0,15'],
    );
    expect(receipt.taxGrossCents).toEqual({ A: 95 });
  });

  it('reads a tax table row with a lost gross amount', () => {
    const receipt = parseBlock(
      ['KVeg.No Milk 0,95 A'],
      ['Summe 0,95', 'Steuer % Brutto Netto Steuer', 'A 19,00% 099 0,80 0,15'],
    );
    expect(receipt.taxGrossCents).toEqual({ A: 95 });
  });

  it('reads a date with a comma instead of a dot', () => {
    const receipt = parseBlock(['Salami vegan 1,00 B'], ['Summe 1,00', 'Datum 27.10,26']);
    expect(receipt.date).toBe('2026-10-27');
  });

  it('returns no positions for text that is not a receipt', () => {
    const receipt = parseKauflandReceipt(['Lorem ipsum', 'dolor sit amet', '']);
    expect(receipt.items).toEqual([]);
    expect(receipt.detectedTotalCents).toBeNull();
    expect(receipt.date).toBeNull();
  });
});

describe('checkReceipt', () => {
  it('reports a mismatch between positions and total', () => {
    const receipt = parseBlock(['Salami vegan 1,00 B'], ['Summe 1,50']);
    expect(checkReceipt(receipt)).toMatchObject({ itemsSumCents: 100, totalMatches: false });
  });

  it('reports a mismatch between positions and tax table', () => {
    const receipt = parseBlock(
      ['Salami vegan 1,00 B', 'KVeg.No Milk 0,95 A'],
      ['Summe 1,95', 'A 19,00% 1,00 0,84 0,16', 'B 7,00% 0,95 0,89 0,06'],
    );
    expect(checkReceipt(receipt)).toMatchObject({ totalMatches: true, taxTableMatches: false });
  });

  it('cannot judge the total when the receipt shows none', () => {
    const receipt = parseBlock(['Salami vegan 1,00 B']);
    expect(checkReceipt(receipt)).toMatchObject({ totalMatches: null });
  });
});
