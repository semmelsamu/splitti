// Step 3 of the text recognition: read the fragments.
//
// Every fragment is cut out of the working image along its own tilt and scaled
// to a comfortable letter size. Tesseract gets each of these strips as a page
// of its own in "single text line" mode: no page layout to guess, and its own
// black-and-white threshold per strip. All strips go through one Tesseract run.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { PreparedImage } from './preprocess';
import type { Component, Fragment } from './segment';
import { recognizeImages } from './tesseract';
import type { TextFragment } from './types';

/** Height of the band of letters in a strip, in pixels. Tesseract likes capitals around 30 px. */
const BAND_HEIGHT = 40;
/** White border around each strip, in pixels. */
const BORDER = 12;
/**
 * Every fragment is read several times with a different white point: the share
 * of the way from print to paper at which a pixel counts as paper. A low value
 * erases the grey of creases, a high value keeps faint print. Which one reads
 * best differs from strip to strip, so the readings vote.
 */
const WHITE_POINTS = [0.5, 0.65, 0.85];

/** Text that has the shape of what receipts print in their number columns. */
const WELL_FORMED = [
  /^-?\d{1,3},\d{2}( [A-Z])?$/, // price, optionally with tax code
  /^\d{1,3} \* \d{1,3},\d{2}$/, // quantity times unit price
  /^\d{1,2},\d{3} kg$/, // weight
];
const WELL_FORMED_BONUS = 50;

interface Strip {
  data: Uint8Array;
  width: number;
  height: number;
}

export async function readFragments(
  image: PreparedImage,
  fragments: readonly Fragment[],
): Promise<TextFragment[]> {
  const strips: { fragment: Fragment; strip: Strip }[] = [];
  for (const fragment of fragments) {
    for (const strip of renderStrips(image, fragment, fragments)) strips.push({ fragment, strip });
  }
  if (strips.length === 0) return [];

  // SPLITTI_OCR_DEBUG_DIR keeps the strips for troubleshooting.
  const debugDir = process.env.SPLITTI_OCR_DEBUG_DIR;
  const dir = debugDir
    ? path.join(debugDir, `strips-${Date.now()}`)
    : await fs.mkdtemp(path.join(os.tmpdir(), 'splitti-ocr-'));
  try {
    await fs.mkdir(dir, { recursive: true });
    const files = await Promise.all(
      strips.map(async ({ strip }, index) => {
        const file = path.join(dir, `${String(index).padStart(4, '0')}.pgm`);
        await fs.writeFile(file, toPgm(strip));
        return file;
      }),
    );
    const pages = await recognizeImages(files, path.join(dir, 'strips.txt'));

    const readings = new Map<Fragment, Reading[]>();
    strips.forEach(({ fragment }, index) => {
      const words = [...(pages[index] ?? [])].sort((a, b) => a.left - b.left);
      if (words.length === 0) return;
      const list = readings.get(fragment) ?? [];
      list.push({
        text: words.map((word) => word.text).join(' '),
        confidence: words.reduce((sum, word) => sum + word.confidence, 0) / words.length,
      });
      readings.set(fragment, list);
    });

    const result: TextFragment[] = [];
    for (const fragment of fragments) {
      const best = pickReading(readings.get(fragment) ?? []);
      if (!best) continue;
      result.push({
        text: best.text,
        confidence: best.confidence,
        left: fragment.left,
        right: fragment.right,
        cx: fragment.cx,
        cy: fragment.cy,
      });
    }
    return result;
  } finally {
    if (!debugDir) await fs.rm(dir, { recursive: true, force: true });
  }
}

export interface Reading {
  text: string;
  /** 0–100 */
  confidence: number;
}

/**
 * Chooses among several readings of the same fragment. Identical readings add
 * up their confidence; a reading with the shape of a price, a quantity or a
 * weight gets a bonus, because that is what the number columns contain.
 */
export function pickReading(readings: readonly Reading[]): Reading | null {
  const votes = new Map<string, { score: number; confidence: number }>();
  for (const reading of readings) {
    const text = reading.text.replace(/\s+/g, ' ').trim();
    if (text === '') continue;
    const vote = votes.get(text) ?? {
      score: WELL_FORMED.some((shape) => shape.test(text)) ? WELL_FORMED_BONUS : 0,
      confidence: 0,
    };
    vote.score += reading.confidence;
    vote.confidence = Math.max(vote.confidence, reading.confidence);
    votes.set(text, vote);
  }
  let best: Reading | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const [text, vote] of votes) {
    if (vote.score > bestScore) {
      bestScore = vote.score;
      best = { text, confidence: vote.confidence };
    }
  }
  return best;
}

/** Binary PGM: the simplest greyscale file format, read by Tesseract directly. */
function toPgm(strip: Strip): Buffer {
  const width = strip.width + 2 * BORDER;
  const height = strip.height + 2 * BORDER;
  const header = Buffer.from(`P5\n${width} ${height}\n255\n`, 'ascii');
  const pixels = Buffer.alloc(width * height, 255);
  for (let row = 0; row < strip.height; row++) {
    pixels.set(
      strip.data.subarray(row * strip.width, (row + 1) * strip.width),
      (row + BORDER) * width + BORDER,
    );
  }
  return Buffer.concat([header, pixels]);
}

/**
 * Cuts one fragment out of the working image: sheared so that its text line is
 * level, padded, scaled to the standard letter size, contrast stretched once
 * per white point. Returns no strips if there is nothing dark in it.
 */
function renderStrips(image: PreparedImage, fragment: Fragment, all: readonly Fragment[]): Strip[] {
  const { grey, width, height } = image;
  const { slope, cx } = fragment;

  // Band of the letters after levelling the line.
  let bandTop = Number.POSITIVE_INFINITY;
  let bandBottom = Number.NEGATIVE_INFINITY;
  for (const letter of fragment.letters) {
    const shift = slope * ((letter.left + letter.right) / 2 - cx);
    bandTop = Math.min(bandTop, letter.top - shift);
    bandBottom = Math.max(bandBottom, letter.bottom - shift);
  }
  const band = bandBottom - bandTop;
  if (!(band > 0)) return [];

  // Room for umlaut dots above, commas below and a minus sign in front.
  const padY = 0.35 * fragment.letterHeight;
  const padX = 0.8 * fragment.letterHeight;
  const scale = Math.min(3, Math.max(0.4, BAND_HEIGHT / band));

  const sourceLeft = fragment.left - padX;
  const sourceTop = bandTop - padY;
  const stripWidth = Math.ceil((fragment.right - fragment.left + 2 * padX) * scale);
  const stripHeight = Math.ceil((band + 2 * padY) * scale);
  const data = new Uint8Array(stripWidth * stripHeight);

  // Print of other fragments that reaches into the strip (the line above or
  // below) is left out; the fragment's own letters and marks always stay.
  const foreign = new Uint8Array(stripWidth * stripHeight);
  /** Marks the box of a letter, enlarged by `halo` source pixels, in the strip. */
  const paint = (part: Component, halo: number, value: 0 | 1) => {
    const shift = slope * ((part.left + part.right) / 2 - cx);
    const within = (n: number, max: number) => Math.min(max, Math.max(0, n));
    const u0 = within(Math.floor((part.left - halo - sourceLeft) * scale), stripWidth);
    const u1 = within(Math.ceil((part.right + halo - sourceLeft) * scale), stripWidth);
    const v0 = within(Math.floor((part.top - halo - shift - sourceTop) * scale), stripHeight);
    const v1 = within(Math.ceil((part.bottom + halo - shift - sourceTop) * scale), stripHeight);
    if (u1 <= u0) return;
    for (let v = v0; v < v1; v++) foreign.fill(value, v * stripWidth + u0, v * stripWidth + u1);
  };
  const reach = band + 2 * padY + Math.abs(slope) * (fragment.right - fragment.left);
  for (const other of all) {
    if (other === fragment) continue;
    if (other.right < sourceLeft || other.left > fragment.right + padX) continue;
    if (other.bottom < fragment.top - reach || other.top > fragment.bottom + reach) continue;
    for (const part of other.letters) {
      // Only ordinary letters whose centre lies outside this fragment's band are
      // neighbours. Anything centred inside the band may be a piece of this
      // fragment's own print that the grouping put elsewhere.
      const centre = (part.top + part.bottom) / 2 - slope * ((part.left + part.right) / 2 - cx);
      if (centre > bandTop && centre < bandBottom) continue;
      if (part.bottom - part.top > 1.4 * other.letterHeight) continue;
      paint(part, 2, 1);
    }
  }
  for (const part of [...fragment.letters, ...fragment.marks]) paint(part, 3, 0);

  const histogram = new Uint32Array(256);
  for (let v = 0; v < stripHeight; v++) {
    for (let u = 0; u < stripWidth; u++) {
      const index = v * stripWidth + u;
      if (foreign[index] === 1) {
        data[index] = 255;
        continue;
      }
      const x = sourceLeft + u / scale;
      const y = sourceTop + v / scale + slope * (x - cx);
      const value = sample(grey, width, height, x, y);
      data[index] = value;
      histogram[value] = (histogram[value] as number) + 1;
    }
  }

  // Black point: the darkest half percent of the strip, so faint print becomes
  // as black as strong print.
  let count = 0;
  let black = 0;
  const target = data.length * 0.005;
  for (let value = 0; value < 256; value++) {
    count += histogram[value] as number;
    if (count >= target) {
      black = value;
      break;
    }
  }
  if (black > 0.7 * 255) return [];

  return WHITE_POINTS.map((whitePoint) => {
    const range = Math.max(1, whitePoint * (255 - black));
    const stretched = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const level = ((data[i] as number) - black) / range;
      stretched[i] = Math.round(255 * Math.min(1, Math.max(0, level)));
    }
    return { data: stretched, width: stripWidth, height: stripHeight };
  });
}

/** Bilinear sample; outside the image is paper. */
function sample(grey: Uint8Array, width: number, height: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const at = (px: number, py: number): number =>
    px < 0 || py < 0 || px >= width || py >= height ? 255 : (grey[py * width + px] as number);
  const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx;
  const bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
  return Math.round(top * (1 - fy) + bottom * fy);
}
