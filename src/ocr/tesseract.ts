// Step 2 of the text recognition: Tesseract turns the prepared image into words
// with their position. Tesseract runs as a local program in the same container;
// nothing leaves the machine.

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { OcrWord } from './types';

const TIMEOUT_MS = 90_000;

export interface TesseractOptions {
  /** Page segmentation mode. 7 = the image is a single text line. */
  psm?: number;
  language?: string;
  /** Extra "-c key=value" settings. */
  config?: Record<string, string>;
}

export class TesseractError extends Error {}

/**
 * Folder with the language model. The model ships with the repo (tessdata/),
 * because the one packaged by Debian and Ubuntu reads receipts noticeably worse.
 */
export function tessdataDir(): string {
  return path.resolve(process.env.TESSDATA_DIR ?? 'tessdata');
}

/**
 * Recognises the words of several images in one Tesseract run. The images are
 * files on disk (PNG, JPEG or PNM); the result has one list of words per image.
 */
export async function recognizeImages(
  files: readonly string[],
  listFile: string,
  options: TesseractOptions = {},
): Promise<OcrWord[][]> {
  if (files.length === 0) return [];
  const { psm = 7, language = 'deu', config = {} } = options;
  await fs.writeFile(listFile, `${files.join('\n')}\n`);

  const args = [
    listFile,
    'stdout',
    '--tessdata-dir',
    tessdataDir(),
    '-l',
    language,
    '--psm',
    String(psm),
    '--dpi',
    '300',
    // Words with their position as tab-separated values.
    '-c',
    'tessedit_create_tsv=1',
  ];
  for (const [key, value] of Object.entries(config)) args.push('-c', `${key}=${value}`);

  const tsv = await run(process.env.TESSERACT_BIN ?? 'tesseract', args);
  const pages = parseTsv(tsv);
  return files.map((_, index) => pages.get(index + 1) ?? []);
}

/**
 * Tesseract's TSV output: one row per page, block, paragraph, line and word.
 * Returns the words (level 5) per page number, starting at 1.
 */
export function parseTsv(tsv: string): Map<number, OcrWord[]> {
  const pages = new Map<number, OcrWord[]>();
  for (const row of tsv.split('\n')) {
    const cells = row.split('\t');
    if (cells.length < 12 || cells[0] !== '5') continue;
    const text = cells.slice(11).join('\t').trim();
    if (text === '') continue;
    const page = Number(cells[1]);
    const words = pages.get(page) ?? [];
    words.push({
      text,
      left: Number(cells[6]),
      top: Number(cells[7]),
      width: Number(cells[8]),
      height: Number(cells[9]),
      confidence: Number(cells[10]),
    });
    pages.set(page, words);
  }
  return pages;
}

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new TesseractError('Tesseract did not finish in time'));
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new TesseractError(`Tesseract could not be started: ${error.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(Buffer.concat(stdout).toString('utf8'));
      } else {
        const message = Buffer.concat(stderr).toString('utf8').trim();
        reject(new TesseractError(`Tesseract exited with code ${code}: ${message}`));
      }
    });
  });
}
