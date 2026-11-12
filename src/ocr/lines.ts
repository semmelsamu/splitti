// Step 4 of the text recognition: fragments become text lines, name on the left
// and price on the right. Pure logic, testable without Tesseract.

import type { OcrLine, TextFragment } from './types';

/**
 * Puts fragments that sit on the same printed line into one row.
 *
 * `slope` is the prevailing tilt of the lines (dy/dx). Following that tilt back
 * to x = 0 gives every fragment a "row position"; fragments of one line share
 * it, neighbouring lines differ by a full line pitch.
 *
 * @param letterHeight median letter height in pixels, the unit for "close enough"
 */
export function assembleLines(
  fragments: readonly TextFragment[],
  slope: number,
  letterHeight: number,
): OcrLine[] {
  const tolerance = 0.55 * letterHeight;
  const positioned = fragments
    .map((fragment) => ({ fragment, row: fragment.cy - slope * fragment.cx }))
    .sort((a, b) => a.row - b.row);

  const rows: { fragments: TextFragment[]; sum: number }[] = [];
  for (const { fragment, row } of positioned) {
    // The nearest existing row that has room for this fragment.
    let best: (typeof rows)[number] | undefined;
    let bestDistance = tolerance;
    for (let i = rows.length - 1; i >= 0 && i >= rows.length - 3; i--) {
      const candidate = rows[i] as (typeof rows)[number];
      const distance = Math.abs(row - candidate.sum / candidate.fragments.length);
      if (distance <= bestDistance && !candidate.fragments.some((f) => overlaps(f, fragment))) {
        best = candidate;
        bestDistance = distance;
      }
    }
    if (best) {
      best.fragments.push(fragment);
      best.sum += row;
    } else {
      rows.push({ fragments: [fragment], sum: row });
    }
  }

  return rows.map((row) => {
    const sorted = [...row.fragments].sort((a, b) => a.left - b.left);
    let text = '';
    sorted.forEach((fragment, index) => {
      const previous = sorted[index - 1];
      // A word that was split where the print is faint is glued back together:
      // the gap between two letters is far smaller than a blank.
      const glued = previous !== undefined && fragment.left - previous.right < 0.45 * letterHeight;
      text += index === 0 || glued ? fragment.text : ` ${fragment.text}`;
    });
    return { text, fragments: sorted };
  });
}

/** Two fragments that share horizontal space cannot be on the same line. */
function overlaps(a: TextFragment, b: TextFragment): boolean {
  const shared = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  return shared > 0.2 * Math.min(a.right - a.left, b.right - b.left);
}
