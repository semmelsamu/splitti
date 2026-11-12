// Step 2 of the text recognition: find the pieces of text on the paper.
//
// A crumpled receipt is not flat: lines bend, and the price column can sit a
// little higher or lower than the names. Page layout analysis that expects
// straight, parallel lines breaks on that. So the layout is worked out here,
// bottom-up and locally: connected blobs of print are letters, letters next to
// each other form a fragment ("KLC.Nougat Pockets", "2,79 B"), and each fragment
// gets its own tilt. Pure logic on the ink mask, testable without Tesseract.

/** A connected blob of print. `right` and `bottom` are exclusive. */
export interface Component {
  left: number;
  top: number;
  right: number;
  bottom: number;
  area: number;
}

/** A run of letters on one line. */
export interface Fragment {
  /** Bounding box of its letters and attached marks. `right` and `bottom` are exclusive. */
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** Centre of the band of letters. */
  cx: number;
  cy: number;
  /** Tilt of the text line as dy/dx (positive: falls to the right). */
  slope: number;
  /** Median height of its letters. */
  letterHeight: number;
  letters: Component[];
  /** Small print around the letters that belongs to no other fragment: commas, dots, signs. */
  marks: Component[];
}

export interface Segmentation {
  fragments: Fragment[];
  /** Median letter height of the whole receipt in pixels; 0 if no text was found. */
  letterHeight: number;
  /** Prevailing tilt of the text lines as dy/dx. */
  slope: number;
}

const MIN_AREA = 6;

/** Labels the 8-connected blobs of the ink mask. */
export function findComponents(ink: Uint8Array, width: number, height: number): Component[] {
  const seen = new Uint8Array(ink.length);
  const stack: number[] = [];
  const components: Component[] = [];

  for (let start = 0; start < ink.length; start++) {
    if (ink[start] !== 1 || seen[start] === 1) continue;
    let left = width;
    let right = 0;
    let top = height;
    let bottom = 0;
    let area = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const pixel = stack.pop() as number;
      const x = pixel % width;
      const y = (pixel - x) / width;
      area++;
      if (x < left) left = x;
      if (x >= right) right = x + 1;
      if (y < top) top = y;
      if (y >= bottom) bottom = y + 1;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const next = ny * width + nx;
          if (ink[next] === 1 && seen[next] === 0) {
            seen[next] = 1;
            stack.push(next);
          }
        }
      }
    }
    if (area >= MIN_AREA) components.push({ left, top, right, bottom, area });
  }
  return components;
}

/** Groups blobs into text fragments. */
export function groupFragments(components: readonly Component[]): Segmentation {
  const heightOf = (c: Component) => c.bottom - c.top;
  const widthOf = (c: Component) => c.right - c.left;

  // The typical letter: not tiny, not huge, reasonably filled.
  const candidates = components.filter((c) => {
    const h = heightOf(c);
    const w = widthOf(c);
    return h >= 12 && h <= 90 && w <= 3 * h && c.area >= 0.15 * w * h;
  });
  if (candidates.length < 10) return { fragments: [], letterHeight: 0, slope: 0 };
  const H = median(candidates.map(heightOf));

  // Letters and digits, including the double-height total. Wide blobs are letters
  // that touch each other; anything larger is a crease, a shadow or a stain.
  const letters = components.filter((c) => {
    const h = heightOf(c);
    return h >= 0.45 * H && h <= 3.2 * H && widthOf(c) <= 8 * H;
  });
  const letterSet = new Set(letters);
  // Marks that sit between letters: "*", "-", "+".
  const marks = components.filter((c) => {
    const h = heightOf(c);
    return h < 0.45 * H && h >= 2 && widthOf(c) >= 2 && widthOf(c) <= 1.2 * H && c.area >= 8;
  });

  const parent = letters.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root] as number;
    while (parent[index] !== root) {
      const next = parent[index] as number;
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };

  // Letters chain to the next letter on the same line.
  const order = letters.map((_, index) => index).sort((a, b) => lt(letters, a) - lt(letters, b));
  for (let i = 0; i < order.length; i++) {
    const a = letters[order[i] as number] as Component;
    const ha = heightOf(a);
    for (let j = i + 1; j < order.length; j++) {
      const b = letters[order[j] as number] as Component;
      const hb = heightOf(b);
      const gap = b.left - a.right;
      if (gap > 1.5 * 3.2 * H) break;
      if (gap > 1.5 * Math.max(ha, hb)) continue;
      // Same line: they overlap vertically by at least half of the smaller one,
      // and are of similar size (the double-height total is a line of its own).
      const overlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (overlap < 0.5 * Math.min(ha, hb)) continue;
      if (Math.max(ha, hb) > 2.2 * Math.min(ha, hb)) continue;
      union(order[i] as number, order[j] as number);
    }
  }

  // A mark joins the letters on both sides if it sits at their mid-height;
  // that connects "3", "*" and "1,00".
  for (const mark of marks) {
    const my = (mark.top + mark.bottom) / 2;
    let leftNeighbour = -1;
    let rightNeighbour = -1;
    let leftGap = Number.POSITIVE_INFINITY;
    let rightGap = Number.POSITIVE_INFINITY;
    for (let i = 0; i < letters.length; i++) {
      const letter = letters[i] as Component;
      const h = heightOf(letter);
      if (my < letter.top + 0.1 * h || my > letter.bottom - 0.1 * h) continue;
      const gapToLeft = mark.left - letter.right;
      const gapToRight = letter.left - mark.right;
      if (gapToLeft >= -2 && gapToLeft <= h && gapToLeft < leftGap) {
        leftGap = gapToLeft;
        leftNeighbour = i;
      }
      if (gapToRight >= -2 && gapToRight <= h && gapToRight < rightGap) {
        rightGap = gapToRight;
        rightNeighbour = i;
      }
    }
    if (leftNeighbour !== -1 && rightNeighbour !== -1) union(leftNeighbour, rightNeighbour);
  }

  const groups = new Map<number, Component[]>();
  for (let i = 0; i < letters.length; i++) {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(letters[i] as Component);
    else groups.set(root, [letters[i] as Component]);
  }

  let drafts: Draft[] = [];
  for (const group of groups.values()) {
    // A single blob is far more often a speck or a crease than text.
    if (group.length < 2) continue;
    // A blob much taller than its neighbours is a letter fused with the shadow
    // of a crease. It stays visible to the reader but does not define the line.
    const typical = median(group.map(heightOf));
    for (let i = group.length - 1; i >= 0 && group.length > 2; i--) {
      if (heightOf(group[i] as Component) > 1.7 * typical) group.splice(i, 1);
    }
    drafts.push(buildFragment(group));
  }

  // Everything small that is not a letter of some fragment: commas, dots,
  // umlaut dots, "*", a leading minus, pieces of faint letters, and lone
  // letters such as a tax code that stands a little apart.
  const isLoose = (c: Component, used: Set<Component>) =>
    !used.has(c) &&
    heightOf(c) <= 3.2 * H &&
    widthOf(c) <= 8 * H &&
    (c.area >= 8 || letterSet.has(c));

  /** Gives every fragment its tilt and the marks that lie in its band. */
  const finish = (list: Draft[]): number => {
    const slope = prevailingSlope(list, H);
    const used = new Set<Component>();
    for (const draft of list) {
      if (!draft.ownSlope) draft.fragment.slope = slope;
      for (const letter of draft.fragment.letters) used.add(letter);
    }
    const loose = components.filter((c) => isLoose(c, used));
    for (const { fragment } of list) {
      const reach = 0.3 * fragment.letterHeight;
      const sideReach = 1.5 * fragment.letterHeight;
      let bandTop = Number.POSITIVE_INFINITY;
      let bandBottom = Number.NEGATIVE_INFINITY;
      for (const letter of fragment.letters) {
        const shift = fragment.slope * ((letter.left + letter.right) / 2 - fragment.cx);
        bandTop = Math.min(bandTop, letter.top - shift);
        bandBottom = Math.max(bandBottom, letter.bottom - shift);
      }
      fragment.marks = loose.filter((c) => {
        const x = (c.left + c.right) / 2;
        const y = (c.top + c.bottom) / 2 - fragment.slope * (x - fragment.cx);
        if (x < fragment.left - sideReach || x > fragment.right + sideReach) return false;
        if (y < bandTop - reach || y > bandBottom + reach) return false;
        // Not taller than the band itself: a crease crossing the line is no mark.
        return heightOf(c) <= 1.2 * (bandBottom - bandTop);
      });
      if (fragment.marks.length > 0) {
        fragment.left = Math.min(fragment.left, ...fragment.marks.map((c) => c.left));
        fragment.right = Math.max(fragment.right, ...fragment.marks.map((c) => c.right));
      }
    }
    return slope;
  };

  // Where print is faint a word falls apart into two groups. Groups that
  // continue each other on the same line, closer than about two letters, are
  // one fragment: it is read in one piece and nothing is read twice. The
  // second round measures the gap including the marks, i.e. the faint letters
  // that did not make it into a group.
  drafts = mergeNeighbours(drafts, 1.2);
  let slope = finish(drafts);
  const again = mergeNeighbours(drafts, 1.5);
  if (again.length !== drafts.length) {
    drafts = again;
    slope = finish(drafts);
  }

  const fragments = drafts.map((draft) => draft.fragment).sort((a, b) => a.cy - b.cy);
  return { fragments, letterHeight: H, slope };
}

/**
 * Joins fragments that continue each other on the same line with a gap of at
 * most `maxGap` letter heights.
 */
function mergeNeighbours(drafts: readonly Draft[], maxGap: number): Draft[] {
  const list = [...drafts].sort((a, b) => a.fragment.left - b.fragment.left);
  for (let merged = true; merged; ) {
    merged = false;
    search: for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = (list[i] as Draft).fragment;
        const b = (list[j] as Draft).fragment;
        const size = Math.max(a.letterHeight, b.letterHeight);
        const gap = b.left - a.right;
        // A negative gap is fine: both may have claimed the marks between them.
        if (gap > maxGap * size) continue;
        if (size > 1.5 * Math.min(a.letterHeight, b.letterHeight)) continue;
        const longer = a.letters.length >= b.letters.length ? a : b;
        const shorter = longer === a ? b : a;
        const expected = longer.cy + longer.slope * (shorter.cx - longer.cx);
        if (Math.abs(expected - shorter.cy) > 0.35 * size) continue;
        list[i] = buildFragment([...a.letters, ...b.letters]);
        list.splice(j, 1);
        merged = true;
        break search;
      }
    }
  }
  return list;
}

interface Draft {
  fragment: Fragment;
  /** True if the fragment is long enough to tell its own tilt. */
  ownSlope: boolean;
}

/** Geometry of a fragment from its letters. */
function buildFragment(letters: Component[]): Draft {
  const heightOf = (c: Component) => c.bottom - c.top;
  const group = [...letters].sort((a, b) => a.left - b.left);
  const left = Math.min(...group.map((c) => c.left));
  const right = Math.max(...group.map((c) => c.right));
  const top = Math.min(...group.map((c) => c.top));
  const bottom = Math.max(...group.map((c) => c.bottom));
  const letterHeight = median(group.map(heightOf));
  const cx = (left + right) / 2;

  // Tilt from the letters' bottom edges; the median of all pairwise slopes
  // shrugs off descenders and commas.
  const span = right - left;
  const ownSlope = group.length >= 5 && span >= 3 * letterHeight;
  let slope = 0;
  if (ownSlope) {
    const slopes: number[] = [];
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i] as Component;
        const b = group[j] as Component;
        const dx = (b.left + b.right) / 2 - (a.left + a.right) / 2;
        if (dx >= letterHeight) slopes.push((b.bottom - a.bottom) / dx);
      }
    }
    slope = slopes.length > 0 ? clamp(median(slopes), -0.25, 0.25) : 0;
  }

  // Centre line of the letters at the fragment's centre.
  const centres = group.map((c) => {
    const x = (c.left + c.right) / 2;
    return (c.top + c.bottom) / 2 - slope * (x - cx);
  });
  return {
    fragment: {
      left,
      top,
      right,
      bottom,
      cx,
      cy: median(centres),
      slope,
      letterHeight,
      letters: group,
      marks: [],
    },
    ownSlope,
  };
}

/**
 * The tilt most text agrees on. Votes come from long fragments (their own tilt)
 * and from pairs of fragments that are far apart horizontally and nearly level
 * (name and price of the same line). Pairs from neighbouring lines vote for
 * wildly different tilts and stay a minority.
 */
function prevailingSlope(drafts: readonly Draft[], letterHeight: number): number {
  const votes: { slope: number; weight: number }[] = [];
  for (const { fragment, ownSlope } of drafts) {
    if (ownSlope) votes.push({ slope: fragment.slope, weight: 2 });
  }
  for (let i = 0; i < drafts.length; i++) {
    for (let j = i + 1; j < drafts.length; j++) {
      const a = (drafts[i] as Draft).fragment;
      const b = (drafts[j] as Draft).fragment;
      const dx = b.cx - a.cx;
      const dy = b.cy - a.cy;
      if (Math.abs(dx) < 5 * letterHeight || Math.abs(dy) > 1.2 * letterHeight) continue;
      votes.push({ slope: dy / dx, weight: 1 });
    }
  }
  if (votes.length === 0) return 0;

  // Histogram over ±0.25 in steps of 0.01; the peak including its two neighbours wins.
  const bins = new Float64Array(51);
  for (const vote of votes) {
    const bin = Math.round(vote.slope / 0.01) + 25;
    if (bin >= 0 && bin < bins.length) bins[bin] = (bins[bin] as number) + vote.weight;
  }
  let best = 25;
  let bestWeight = -1;
  for (let bin = 0; bin < bins.length; bin++) {
    const weight = (bins[bin - 1] ?? 0) + (bins[bin] as number) + (bins[bin + 1] ?? 0);
    if (weight > bestWeight) {
      bestWeight = weight;
      best = bin;
    }
  }
  const centre = (best - 25) * 0.01;
  let sum = 0;
  let total = 0;
  for (const vote of votes) {
    if (Math.abs(vote.slope - centre) <= 0.015) {
      sum += vote.slope * vote.weight;
      total += vote.weight;
    }
  }
  return total > 0 ? sum / total : centre;
}

function lt(letters: readonly Component[], index: number): number {
  return (letters[index] as Component).left;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
