// Draws the app icon and writes it in the sizes the web app manifest, iOS and
// the browser tab need. Run with `npm run icons` after changing the drawing;
// the generated files in public/ are committed.

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const BLUE = '#1d4ed8';

/**
 * A receipt with three lines (name left, price right) and two member chips,
 * one selected: scan, tap, split.
 * @param {boolean} rounded Rounded corners for ordinary icons; maskable icons fill the square.
 */
function icon(rounded) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="${BLUE}"/>
  <path fill="#fff" d="M152 96h208a16 16 0 0 1 16 16v304l-40-28-40 28-40-28-40 28-40-28-40 28V112a16 16 0 0 1 16-16z"/>
  <g fill="${BLUE}">
    <rect x="172" y="136" width="104" height="20" rx="10"/>
    <rect x="300" y="136" width="40" height="20" rx="10"/>
    <rect x="172" y="180" width="76" height="20" rx="10"/>
    <rect x="300" y="180" width="40" height="20" rx="10"/>
    <rect x="172" y="224" width="92" height="20" rx="10"/>
    <rect x="300" y="224" width="40" height="20" rx="10"/>
    <circle cx="214" cy="310" r="34"/>
  </g>
  <circle cx="298" cy="310" r="28" fill="none" stroke="${BLUE}" stroke-width="12"/>
</svg>
`;
}

const out = path.resolve('public');
await fs.mkdir(path.join(out, 'icons'), { recursive: true });
await fs.writeFile(path.join(out, 'favicon.svg'), icon(true));

const png = (svg, size, file) =>
  sharp(Buffer.from(svg))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(path.join(out, file));

await Promise.all([
  png(icon(true), 192, 'icons/icon-192.png'),
  png(icon(true), 512, 'icons/icon-512.png'),
  // Maskable: the system cuts its own shape out of the full square.
  png(icon(false), 512, 'icons/icon-maskable-512.png'),
  // iOS rounds the corners itself and shows transparency as black.
  png(icon(false), 180, 'icons/apple-touch-icon.png'),
]);
console.log('Icons written to public/ and public/icons/');
