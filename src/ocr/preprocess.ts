// Step 1 of the text recognition: turn a phone photo into a clean working image.
//
//   1. Apply the camera rotation stored in the image data.
//   2. Bring the long side to about 2000 pixels.
//   3. Find the paper and cut away table and background.
//   4. Convert to greyscale and even out shadows and creases.
//   5. Mark where there is print (the "ink mask" used to find the text lines).
//
// Steps 3 to 5 go beyond the minimum in the plan; they are what makes crumpled
// receipts on a wooden table readable (see docs/DECISIONS.md).

import sharp from 'sharp';

/** Target for the long side of the image, in pixels. */
const LONG_SIDE = 2000;
/** The paper search works on a reduced image; this is the reduction factor. */
const MASK_SCALE = 8;
/** Rows of the reduced image, up and down, that vote on where the paper edge is. */
const EDGE_WINDOW = 6;
/** Cell size for the local brightness estimates, in pixels. */
const SHADE_CELL = 16;

export interface PreparedImage {
  /** Colour JPEG for storage and display: upright, long side at most 2000 px. */
  display: Buffer;
  /**
   * Working image, cut to the paper: brightness relative to the paper around
   * each pixel, 255 = paper, 0 = black. Shadows and creases are evened out.
   */
  grey: Uint8Array;
  /** 1 where there is print, 0 elsewhere. Same size as `grey`. */
  ink: Uint8Array;
  width: number;
  height: number;
}

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export async function prepareImage(input: Buffer): Promise<PreparedImage> {
  // rotate() without an angle applies the EXIF orientation written by the camera.
  const upright = sharp(input, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' });

  const display = await upright
    .clone()
    .resize({ width: LONG_SIDE, height: LONG_SIDE, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  const { data: rgb, info } = await upright
    .clone()
    .resize({ width: LONG_SIDE, height: LONG_SIDE, fit: 'inside' })
    .removeAlpha()
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = info;

  const paper = findPaper(rgb, width, height);
  const box = paper?.box ?? { left: 0, top: 0, width, height };

  // Greyscale cut-out; everything outside the paper becomes white.
  const cut = new Uint8Array(box.width * box.height);
  for (let y = 0; y < box.height; y++) {
    const sourceY = box.top + y;
    for (let x = 0; x < box.width; x++) {
      const sourceX = box.left + x;
      if (paper && !paper.contains(sourceX, sourceY)) {
        cut[y * box.width + x] = 255;
        continue;
      }
      const i = (sourceY * width + sourceX) * 3;
      cut[y * box.width + x] = Math.round(
        0.299 * (rgb[i] as number) +
          0.587 * (rgb[i + 1] as number) +
          0.114 * (rgb[i + 2] as number),
      );
    }
  }

  const { grey, ink } = await evenOutShading(cut, box.width, box.height);
  return { display, grey, ink, width: box.width, height: box.height };
}

/**
 * Finds the receipt: the largest bright, colourless area of the photo.
 * White paper is bright in all three colour channels and they are close together;
 * a wooden table is strong in red and weak in blue, a dark cloth is weak in all.
 * "Whiteness" is therefore the smallest channel minus the spread of the channels.
 * Returns null if no plausible paper is found; then the whole image is used.
 */
function findPaper(
  rgb: Buffer,
  width: number,
  height: number,
): { box: Box; contains: (x: number, y: number) => boolean } | null {
  const w = Math.floor(width / MASK_SCALE);
  const h = Math.floor(height / MASK_SCALE);
  if (w < 8 || h < 8) return null;

  // Reduced image of the whiteness (average per cell).
  const small = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = 0; dy < MASK_SCALE; dy++) {
        const row = ((y * MASK_SCALE + dy) * width + x * MASK_SCALE) * 3;
        for (let dx = 0; dx < MASK_SCALE; dx++) {
          const i = row + dx * 3;
          const r = rgb[i] as number;
          const g = rgb[i + 1] as number;
          const b = rgb[i + 2] as number;
          const min = Math.min(r, g, b);
          sum += Math.max(0, 2 * min - Math.max(r, g, b));
        }
      }
      small[y * w + x] = Math.round(sum / (MASK_SCALE * MASK_SCALE));
    }
  }

  const threshold = otsuThreshold(small);
  const white = new Uint8Array(w * h);
  for (let i = 0; i < small.length; i++) white[i] = (small[i] as number) > threshold ? 1 : 0;

  // Shrinking the white area by one cell cuts thin bridges to other bright things
  // on the table; the paper itself is grown back afterwards.
  const core = largestComponent(erode(white, w, h), w, h);
  if (!core) return null;
  const component = dilate(core, w, h);

  // Per row, the paper spans from its leftmost to its rightmost white cell; this
  // fills the holes that text and dark creases leave in the white area.
  const rowStart = new Int32Array(h).fill(-1);
  const rowEnd = new Int32Array(h).fill(-1);
  let minX = w;
  let maxX = -1;
  let minY = h;
  let maxY = -1;
  let cells = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (component[y * w + x] !== 1) continue;
      cells++;
      if (rowStart[y] === -1) rowStart[y] = x;
      rowEnd[y] = x;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const boxCells = (maxX - minX + 1) * (maxY - minY + 1);
  const coversEnough = cells >= 0.08 * w * h;
  const isCompact = cells >= 0.45 * boxCells;
  if (!coversEnough || !isCompact) return null;

  const box: Box = {
    left: minX * MASK_SCALE,
    top: minY * MASK_SCALE,
    width: (maxX - minX + 1) * MASK_SCALE,
    height: (maxY - minY + 1) * MASK_SCALE,
  };

  // A dark crease that reaches the paper edge dents the white area. The edge of
  // each row is therefore taken from the rows around it (about 50 px up and
  // down), ignoring the quarter of them that reaches least far.
  const smoothStart = new Int32Array(h).fill(-1);
  const smoothEnd = new Int32Array(h).fill(-1);
  for (let y = minY; y <= maxY; y++) {
    const starts: number[] = [];
    const ends: number[] = [];
    for (let ny = Math.max(minY, y - EDGE_WINDOW); ny <= Math.min(maxY, y + EDGE_WINDOW); ny++) {
      if (rowStart[ny] === -1) continue;
      starts.push(rowStart[ny] as number);
      ends.push(rowEnd[ny] as number);
    }
    if (starts.length === 0) continue;
    starts.sort((a, b) => a - b);
    ends.sort((a, b) => a - b);
    smoothStart[y] = starts[Math.floor(starts.length * 0.25)] as number;
    smoothEnd[y] = ends[Math.ceil(ends.length * 0.75) - 1] as number;
  }

  const contains = (x: number, y: number): boolean => {
    const cy = Math.floor(y / MASK_SCALE);
    if (cy < 0 || cy >= h) return false;
    const start = smoothStart[cy] as number;
    if (start === -1) return false;
    const cx = Math.floor(x / MASK_SCALE);
    return cx >= start && cx <= (smoothEnd[cy] as number);
  };

  return { box, contains };
}

/** A cell stays set only if all eight neighbours are set too. */
function erode(mask: Uint8Array, w: number, h: number): Uint8Array {
  const result = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let all = 1;
      for (let dy = -1; dy <= 1 && all; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (mask[(y + dy) * w + x + dx] !== 1) {
            all = 0;
            break;
          }
        }
      }
      result[y * w + x] = all;
    }
  }
  return result;
}

/** A cell becomes set if it or one of its eight neighbours is set. */
function dilate(mask: Uint8Array, w: number, h: number): Uint8Array {
  const result = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] !== 1) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < w) result[ny * w + nx] = 1;
        }
      }
    }
  }
  return result;
}

/** Otsu's method: the threshold that separates two brightness groups best. */
function otsuThreshold(values: Uint8Array): number {
  const histogram = new Array<number>(256).fill(0);
  for (const value of values) histogram[value] = (histogram[value] as number) + 1;

  const total = values.length;
  let sumAll = 0;
  for (let i = 0; i < 256; i++) sumAll += i * (histogram[i] as number);

  let sumBelow = 0;
  let countBelow = 0;
  let best = 0;
  let bestVariance = -1;
  for (let t = 0; t < 256; t++) {
    countBelow += histogram[t] as number;
    if (countBelow === 0) continue;
    const countAbove = total - countBelow;
    if (countAbove === 0) break;
    sumBelow += t * (histogram[t] as number);
    const meanBelow = sumBelow / countBelow;
    const meanAbove = (sumAll - sumBelow) / countAbove;
    const variance = countBelow * countAbove * (meanBelow - meanAbove) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = t;
    }
  }
  return best;
}

/** Marks the largest 4-connected group of set cells with 1, everything else with 0. */
function largestComponent(mask: Uint8Array, w: number, h: number): Uint8Array | null {
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let bestLabel = 0;
  let bestSize = 0;
  let nextLabel = 0;

  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== 1 || labels[start] !== 0) continue;
    nextLabel++;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    labels[start] = nextLabel;
    while (top > 0) {
      const cell = stack[--top] as number;
      size++;
      const x = cell % w;
      const y = (cell - x) / w;
      const neighbours = [
        x > 0 ? cell - 1 : -1,
        x < w - 1 ? cell + 1 : -1,
        y > 0 ? cell - w : -1,
        y < h - 1 ? cell + w : -1,
      ];
      for (const next of neighbours) {
        if (next !== -1 && mask[next] === 1 && labels[next] === 0) {
          labels[next] = nextLabel;
          stack[top++] = next;
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = nextLabel;
    }
  }

  if (bestLabel === 0) return null;
  const result = new Uint8Array(w * h);
  for (let i = 0; i < labels.length; i++) result[i] = labels[i] === bestLabel ? 1 : 0;
  return result;
}

/**
 * Evens out shadows and creases and marks the print.
 *
 * Every pixel is divided by the brightness of the paper around it: the brightest
 * value per cell (text is darker than paper), widened and blurred. In the result
 * 255 is paper; creases stay close to it, print is much darker. How dark the
 * print is varies (shadow, glare, fading), so the threshold for "this is print"
 * follows the darkest value in the neighbourhood.
 */
async function evenOutShading(
  cut: Uint8Array,
  width: number,
  height: number,
): Promise<{ grey: Uint8Array; ink: Uint8Array }> {
  const w = Math.ceil(width / SHADE_CELL);
  const h = Math.ceil(height / SHADE_CELL);

  const cellMax = new Uint8Array(w * h);
  for (let y = 0; y < height; y++) {
    const cy = Math.floor(y / SHADE_CELL);
    for (let x = 0; x < width; x++) {
      const cell = cy * w + Math.floor(x / SHADE_CELL);
      const value = cut[y * width + x] as number;
      if (value > (cellMax[cell] as number)) cellMax[cell] = value;
    }
  }

  // A cell that lies entirely inside a fat letter has no paper in it; take the
  // brightest of the neighbouring cells as well.
  const paper = await upscale(windowed(cellMax, w, h, 1, Math.max), w, h, width, height);

  const grey = new Uint8Array(width * height);
  const cellMin = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < height; y++) {
    const cy = Math.floor(y / SHADE_CELL);
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const value = Math.min(
        255,
        Math.round(((cut[i] as number) * 255) / Math.max(paper[i] as number, 1)),
      );
      grey[i] = value;
      const cell = cy * w + Math.floor(x / SHADE_CELL);
      if (value < (cellMin[cell] as number)) cellMin[cell] = value;
    }
  }
  const darkest = await upscale(windowed(cellMin, w, h, 2, Math.min), w, h, width, height);

  // Print: clearly darker than the paper and close to the darkest value around.
  // The bounds keep plain creases (lighter than 65 % of the paper) out, and
  // keep faint print (up to 45 %) in even next to very black print.
  const ink = new Uint8Array(width * height);
  for (let i = 0; i < ink.length; i++) {
    const limit = Math.min(0.65, Math.max(0.45, (darkest[i] as number) / 255 + 0.22));
    ink[i] = (grey[i] as number) < limit * 255 ? 1 : 0;
  }
  return { grey, ink };
}

/** Replaces every cell by the max or min of the cells within `radius` around it. */
function windowed(
  cells: Uint8Array,
  w: number,
  h: number,
  radius: number,
  pick: (a: number, b: number) => number,
): Uint8Array {
  const result = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let value = cells[y * w + x] as number;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          value = pick(value, cells[ny * w + nx] as number);
        }
      }
      result[y * w + x] = value;
    }
  }
  return result;
}

/** Blurs a cell grid and scales it up to the full image. */
function upscale(
  cells: Uint8Array,
  w: number,
  h: number,
  width: number,
  height: number,
): Promise<Buffer> {
  return (
    sharp(Buffer.from(cells), { raw: { width: w, height: h, channels: 1 } })
      .blur(1.5)
      .resize({ width, height, fit: 'fill', kernel: 'cubic' })
      // sharp widens greyscale input to three channels unless told otherwise.
      .toColourspace('b-w')
      .raw()
      .toBuffer()
  );
}
