import { describe, expect, it } from 'vitest';
import { assembleLines } from '../../src/ocr/lines';
import type { TextFragment } from '../../src/ocr/types';

function fragment(text: string, left: number, cy: number, width = text.length * 18): TextFragment {
  return { text, confidence: 90, left, right: left + width, cx: left + width / 2, cy };
}

function texts(fragments: TextFragment[], slope = 0, letterHeight = 30): string[] {
  return assembleLines(fragments, slope, letterHeight).map((line) => line.text);
}

describe('assembleLines', () => {
  it('returns nothing for nothing', () => {
    expect(assembleLines([], 0, 30)).toEqual([]);
  });

  it('puts name and price of the same height into one line, name first', () => {
    const lines = texts([
      fragment('2,79 B', 880, 100),
      fragment('KLC.Nougat Pockets', 100, 102),
      fragment('0,95 A', 880, 150),
      fragment('KVeg.No Milk', 100, 151),
    ]);
    expect(lines).toEqual(['KLC.Nougat Pockets 2,79 B', 'KVeg.No Milk 0,95 A']);
  });

  it('orders the lines from top to bottom regardless of input order', () => {
    const lines = texts([
      fragment('Summe', 100, 500),
      fragment('Preis EUR', 800, 50),
      fragment('Salami vegan', 100, 300),
    ]);
    expect(lines).toEqual(['Preis EUR', 'Salami vegan', 'Summe']);
  });

  it('follows the tilt of the page: the right column sits lower on a falling line', () => {
    // Lines fall 5 px per 100 px; the price is 40 px lower than the name of its line
    // and thereby closer to the name of the next line (pitch 50 px).
    const slope = 0.05;
    const lines = texts(
      [
        fragment('Brot', 100, 100, 100),
        fragment('1,00 B', 900, 140, 100),
        fragment('Butter', 100, 150, 100),
        fragment('2,00 B', 900, 190, 100),
      ],
      slope,
    );
    expect(lines).toEqual(['Brot 1,00 B', 'Butter 2,00 B']);
  });

  it('does not give the price of a quantity line to the name above it (warped receipt A)', () => {
    // Positions measured on test receipt A: the price column sits about 15 px
    // higher than the left column, and a name-only line lies in between.
    const lines = texts(
      [
        fragment('Barilla Girandole', 110, 262, 390),
        fragment('3 * 1,00', 140, 315, 170),
        fragment('3,00 B', 890, 298, 140),
        fragment('Hauchgenuss vegan', 115, 375, 385),
        fragment('2 * 1,00', 136, 415, 185),
        fragment('2,00 B', 890, 403, 140),
        fragment('Salami vegan', 110, 470, 280),
        fragment('1,00 B', 894, 458, 140),
      ],
      -0.02,
    );
    expect(lines).toEqual([
      'Barilla Girandole',
      '3 * 1,00 3,00 B',
      'Hauchgenuss vegan',
      '2 * 1,00 2,00 B',
      'Salami vegan 1,00 B',
    ]);
  });

  it('keeps fragments apart that share horizontal space, however close their height', () => {
    const lines = texts([fragment('Zeile eins', 100, 100), fragment('Zeile zwei', 120, 110)]);
    expect(lines).toEqual(['Zeile eins', 'Zeile zwei']);
  });

  it('joins the columns of a table row', () => {
    const lines = texts([
      fragment('A 19,00%', 90, 600),
      fragment('0,95', 420, 598),
      fragment('0,80', 650, 601),
      fragment('0,15', 890, 599),
    ]);
    expect(lines).toEqual(['A 19,00% 0,95 0,80 0,15']);
  });

  it('glues the halves of a split word together without a blank', () => {
    const lines = texts([
      fragment('KLC.Käs', 100, 100, 126),
      fragment('eaufschnitt', 232, 101, 198), // 6 px after the first half: a letter gap
      fragment('1,89 B', 880, 99),
    ]);
    expect(lines).toEqual(['KLC.Käseaufschnitt 1,89 B']);
  });

  it('separates words that are a blank apart', () => {
    const lines = texts([fragment('Paul.', 100, 100, 90), fragment('Spezi Zero', 212, 100, 180)]);
    expect(lines).toEqual(['Paul. Spezi Zero']);
  });
});
