import { describe, expect, it } from 'vitest';
import { type Component, findComponents, groupFragments } from '../../src/ocr/segment';

/** A blank ink mask to draw synthetic "print" on. */
function canvas(width: number, height: number) {
  const ink = new Uint8Array(width * height);
  return {
    ink,
    width,
    height,
    rect(x: number, y: number, w: number, h: number) {
      for (let row = y; row < y + h; row++) ink.fill(1, row * width + x, row * width + x + w);
    },
    /** Draws `count` letter-sized boxes on a line; returns the x after the last one. */
    word(x: number, y: number, count: number, { w = 12, h = 20, gap = 4, drop = 0 } = {}) {
      for (let i = 0; i < count; i++) {
        this.rect(x + i * (w + gap), y + Math.round(i * drop), w, h);
      }
      return x + count * (w + gap) - gap;
    },
    segment() {
      return groupFragments(findComponents(ink, width, height));
    },
  };
}

describe('findComponents', () => {
  it('finds separate blobs with their bounding box and area', () => {
    const c = canvas(100, 60);
    c.rect(10, 10, 12, 20);
    c.rect(40, 12, 5, 8);
    expect(findComponents(c.ink, c.width, c.height)).toEqual([
      { left: 10, top: 10, right: 22, bottom: 30, area: 240 },
      { left: 40, top: 12, right: 45, bottom: 20, area: 40 },
    ]);
  });

  it('joins pixels that touch only at a corner', () => {
    const c = canvas(40, 40);
    c.rect(10, 10, 4, 4);
    c.rect(14, 14, 4, 4);
    expect(findComponents(c.ink, c.width, c.height)).toHaveLength(1);
  });

  it('drops specks of a few pixels', () => {
    const c = canvas(40, 40);
    c.rect(10, 10, 2, 2);
    expect(findComponents(c.ink, c.width, c.height)).toEqual([]);
  });
});

describe('groupFragments', () => {
  it('finds nothing on an empty page', () => {
    expect(canvas(200, 100).segment()).toEqual({ fragments: [], letterHeight: 0, slope: 0 });
  });

  it('groups the letters of each line into one fragment', () => {
    const c = canvas(400, 200);
    c.word(20, 20, 8);
    c.word(20, 60, 6);
    const { fragments, letterHeight } = c.segment();
    expect(letterHeight).toBe(20);
    expect(fragments.map((f) => f.letters.length)).toEqual([8, 6]);
    expect(fragments[0]).toMatchObject({ left: 20, top: 20, right: 144, bottom: 40, cy: 30 });
    expect(fragments[1]?.cy).toBe(70);
  });

  it('keeps the name and the price column of a line apart', () => {
    const c = canvas(600, 120);
    c.word(20, 20, 10);
    c.word(480, 20, 4);
    c.word(20, 60, 10);
    const { fragments } = c.segment();
    expect(fragments).toHaveLength(3);
    const [name, price] = [...fragments.slice(0, 2)].sort((a, b) => a.left - b.left);
    expect(name?.right).toBeLessThan(price?.left ?? 0);
    expect(name?.cy).toBe(price?.cy);
  });

  it('joins words separated by a single blank, but not by a wide gap', () => {
    const c = canvas(600, 120);
    const end = c.word(20, 20, 5);
    c.word(end + 16, 20, 5); // one blank: a letter cell wide
    c.word(20, 60, 12);
    const { fragments } = c.segment();
    expect(fragments.map((f) => f.letters.length)).toEqual([10, 12]);
  });

  it('measures the tilt of a line from its letters', () => {
    const c = canvas(600, 200);
    // Every letter sits one pixel lower than the one before: 1 px per 16 px.
    c.word(20, 20, 20, { drop: 1 });
    c.word(20, 120, 20, { drop: 1 });
    const { fragments, slope } = c.segment();
    expect(fragments).toHaveLength(2);
    expect(fragments[0]?.slope).toBeCloseTo(1 / 16, 2);
    expect(slope).toBeCloseTo(1 / 16, 2);
  });

  it('gives a short fragment the prevailing tilt of the page', () => {
    const c = canvas(700, 200);
    c.word(20, 20, 20, { drop: 1 });
    c.word(20, 120, 20, { drop: 1 });
    c.word(560, 60, 3); // too short to tell its own tilt
    const { fragments } = c.segment();
    const short = fragments.find((f) => f.letters.length === 3);
    expect(short?.slope).toBeCloseTo(1 / 16, 2);
  });

  it('lets a small sign between letters connect them, as in "3 * 1,00"', () => {
    const c = canvas(400, 160);
    // Monospace cells of 13 px for 20 px letters, as on the receipts:
    // "3" in cell 0, "*" in cell 2, "1,00" from cell 4.
    c.rect(20, 20, 12, 20);
    c.rect(49, 26, 7, 7); // the "*", at mid-height
    c.word(72, 20, 4, { gap: 1 });
    c.word(20, 80, 12); // enough letters elsewhere to know the letter size
    const { fragments } = c.segment();
    const quantity = fragments.find((f) => f.top === 20);
    expect(quantity?.letters).toHaveLength(5);
    expect(quantity?.marks.map((m) => [m.left, m.top])).toEqual([[49, 26]]);
  });

  it('collects commas and dots as marks of the fragment', () => {
    const c = canvas(400, 160);
    c.word(20, 20, 4);
    c.rect(33, 38, 2, 6); // a comma below the baseline, in the gap between two letters
    c.word(20, 80, 12);
    const { fragments } = c.segment();
    expect(fragments.find((f) => f.top === 20)?.marks).toHaveLength(1);
  });

  it('extends the fragment to the pieces of a broken letter at its end', () => {
    const c = canvas(400, 160);
    const end = c.word(20, 20, 4);
    // What is left of a faint tax code one blank further right: two crumbs.
    c.rect(end + 16, 22, 8, 6);
    c.rect(end + 18, 32, 8, 6);
    c.word(20, 80, 12);
    const { fragments } = c.segment();
    const price = fragments.find((f) => f.top === 20);
    expect(price?.letters).toHaveLength(4);
    expect(price?.marks).toHaveLength(2);
    expect(price?.right).toBe(end + 26);
  });

  it('ignores a single blob and anything far larger than a letter', () => {
    const c = canvas(600, 300);
    c.word(20, 20, 12);
    c.rect(300, 100, 12, 20); // a lone blob: a speck or a crease, not text
    c.rect(20, 150, 500, 120); // a shadow or a stain
    const { fragments } = c.segment();
    expect(fragments).toHaveLength(1);
    expect(fragments[0]?.letters).toHaveLength(12);
  });

  it('keeps the double-height total apart from ordinary text beside it', () => {
    const c = canvas(700, 200);
    c.word(20, 20, 12);
    c.word(20, 80, 5, { w: 14, h: 22 }); // "Summe" in ordinary size
    c.word(400, 70, 4, { w: 26, h: 46 }); // "11,63" in double height
    const { fragments } = c.segment();
    const big = fragments.find((f) => f.letterHeight === 46);
    expect(big?.letters).toHaveLength(4);
    expect(fragments).toHaveLength(3);
  });

  it('reunites a word that fell apart where the print is faint', () => {
    const c = canvas(600, 160);
    const end = c.word(20, 20, 4);
    // Two faint letters: only crumbs of them made it into the ink mask.
    c.rect(end + 6, 28, 5, 6);
    c.rect(end + 22, 30, 5, 6);
    c.word(end + 36, 20, 6);
    c.word(20, 80, 12);
    const { fragments } = c.segment();
    const word = fragments.find((f) => f.top === 20);
    expect(word?.letters).toHaveLength(10);
    expect(fragments).toHaveLength(2);
  });

  it('drops a blob fused with a crease from the letters, but keeps it visible as a mark', () => {
    const c = canvas(600, 200);
    c.word(20, 60, 6);
    c.rect(20 + 6 * 16, 30, 12, 50); // letter plus crease shadow: 2.5 times as tall
    c.word(20, 120, 12);
    const { fragments } = c.segment();
    const line = fragments.find((f) => f.top === 60);
    expect(line?.letters).toHaveLength(6);
    expect(line?.letters.every((letter: Component) => letter.bottom - letter.top === 20)).toBe(
      true,
    );
  });
});
