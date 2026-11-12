// Runs the text recognition on the three test photos and writes docs/OCR-BERICHT.md.
//
//   npm run ocr:report
//
// The result depends on the Tesseract version, so the report states it. The
// committed report was produced inside the container image (see the Dockerfile).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { formatCents } from '../src/core/money';
import { type ParsedItem, type ParsedReceipt, recognizeReceipt } from '../src/ocr';

const fixtures = path.resolve('tests/fixtures/receipts');
const output = path.resolve('docs/OCR-BERICHT.md');

interface Fixture {
    name: string;
    title: string;
    /** What the photo looks like, for the reader of the report. */
    condition: string;
    /** Hand-written notes per expected label: marker on the photo, template differs from the photo. */
    notes: Record<string, string>;
}

const MARKER = 'Preis auf dem Foto mit Textmarker übermalt';
const BOXED = 'Preis auf dem Foto von Hand eingerahmt';

const FIXTURES: Fixture[] = [
    {
        name: 'a',
        title: 'Zettel A',
        condition: 'unmarkiert, stark zerknittert, Schlagschatten an den Falten',
        notes: {},
    },
    {
        name: 'b',
        title: 'Zettel B',
        condition: 'sieben Preise mit orangem Textmarker übermalt, zerknittert, leicht schräg',
        notes: {
            'Paul. Spezi Zero': MARKER,
            'Pfandartikel|25': MARKER,
            'Iglo Brokkoli': MARKER,
            'Rotbusch Sahne-Ka.': MARKER,
            'Maultaschen vegan': MARKER,
            'Kartoffeln 2,5kg': `${MARKER}. Vorlage weicht vom Foto ab: Das Foto zeigt „2,5Kg“`,
            'Kveg. Tofu Natur': MARKER,
            'Gelbstecker 10 st.': 'Vorlage weicht vom Foto ab: Das Foto zeigt „10 St.“',
        },
    },
    {
        name: 'c',
        title: 'Zettel C',
        condition: 'fünf Preise mit grünem Stift eingerahmt, Handschrift am Kopf, zerknittert',
        notes: {
            'Teek.Türk.Apfel': `Vorlage weicht vom Foto ab: Das Foto zeigt 2,49. ${BOXED}`,
            'Teek.Strawb.Chees.': BOXED,
            'K.Sandwichtoast VK': 'Vorlage weicht vom Foto ab: Das Foto zeigt 1,19',
            'Barilla Pesto Ros.': BOXED,
            'Ba.Pesto getr.Tom.': BOXED,
            'Äpfel Pink Lady kg': BOXED,
        },
    },
];

function tesseractVersion(): string {
    try {
        const text = execFileSync(process.env.TESSERACT_BIN ?? 'tesseract', ['--version'], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return text.split('\n')[0]?.trim() ?? 'unbekannt';
    } catch {
        return 'nicht gefunden';
    }
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

interface Row {
    expected: ParsedItem;
    got: ParsedItem | undefined;
    labelOk: boolean;
    amountOk: boolean;
    note: string;
}

/**
 * Pairs every expected position with the recognised position whose name is
 * most similar; each recognised position is used once. Independent of order,
 * because one template lists three lines in a different order than the photo.
 */
function align(expected: ParsedItem[], got: ParsedItem[], notes: Record<string, string>): Row[] {
    const free = new Set(got.map((_, index) => index));
    const pairs: { e: number; g: number; cost: number }[] = [];
    expected.forEach((item, e) => {
        got.forEach((candidate, g) => {
            const length = Math.max(item.label.length, candidate.label.length, 1);
            const cost =
                distance(item.label.toLowerCase(), candidate.label.toLowerCase()) / length +
                (item.amountCents === candidate.amountCents ? 0 : 0.01);
            pairs.push({ e, g, cost });
        });
    });
    pairs.sort((a, b) => a.cost - b.cost);

    const match = new Map<number, number>();
    for (const pair of pairs) {
        if (pair.cost > 0.6) break;
        if (match.has(pair.e) || !free.has(pair.g)) continue;
        match.set(pair.e, pair.g);
        free.delete(pair.g);
    }

    return expected.map((item, e) => {
        const g = match.get(e);
        const found = g === undefined ? undefined : got[g];
        return {
            expected: item,
            got: found,
            labelOk: found?.label === item.label,
            amountOk: found?.amountCents === item.amountCents,
            note: notes[item.label] ?? notes[`${item.label}|${item.amountCents}`] ?? '',
        };
    });
}

function verdict(row: Row): string {
    if (!row.got) return 'nicht erkannt';
    if (row.labelOk && row.amountOk) return 'stimmt';
    if (row.amountOk) return 'Betrag stimmt, Bezeichnung weicht ab';
    if (row.labelOk) return 'Betrag weicht ab';
    return 'Betrag und Bezeichnung weichen ab';
}

function cell(text: string): string {
    return text.replace(/\|/g, '\\|');
}

function yesNo(value: boolean | null): string {
    return value === null ? 'nicht prüfbar' : value ? 'ja' : 'nein';
}

const summary: string[] = [];
const details: string[] = [];

for (const fixture of FIXTURES) {
    const image = fs.readFileSync(path.join(fixtures, `kaufland-${fixture.name}.png`));
    const expected: ParsedReceipt = JSON.parse(
        fs.readFileSync(path.join(fixtures, `kaufland-${fixture.name}.expected.json`), 'utf8'),
    );
    const started = Date.now();
    const { receipt, checks, lines } = await recognizeReceipt(image);
    const seconds = (Date.now() - started) / 1000;
    const rows = align(expected.items, receipt.items, fixture.notes);

    const amountsOk = rows.filter((row) => row.amountOk).length;
    const labelsOk = rows.filter((row) => row.labelOk).length;
    const total = expected.items.length;
    const extra = receipt.items.length - rows.filter((row) => row.got).length;

    console.log(
        `${fixture.title}: ${amountsOk}/${total} Beträge, ${labelsOk}/${total} Bezeichnungen, ${seconds.toFixed(1)} s`,
    );

    summary.push(
        `| ${fixture.title} | ${receipt.items.length} von ${total} | ${amountsOk} von ${total} | ${labelsOk} von ${total} | ${
            receipt.detectedTotalCents === null
                ? 'nicht erkannt'
                : formatCents(receipt.detectedTotalCents)
        } (erwartet ${formatCents(expected.detectedTotalCents ?? 0)}) | ${yesNo(checks.totalMatches)} | ${
            receipt.date ?? 'kein Datum'
        } (erwartet ${expected.date ?? 'kein Datum'}) |`,
    );

    details.push(`## ${fixture.title}`, '');
    details.push(
        `Foto: \`tests/fixtures/receipts/kaufland-${fixture.name}.png\` – ${fixture.condition}.`,
        '',
    );
    details.push('| Erwartet | Betrag | Erkannt | Betrag | Ergebnis | Hinweis |');
    details.push('| --- | ---: | --- | ---: | --- | --- |');
    for (const row of rows) {
        details.push(
            `| ${cell(row.expected.label)} | ${formatCents(row.expected.amountCents)} | ${
                row.got ? cell(row.got.label) : '–'
            } | ${row.got ? formatCents(row.got.amountCents) : '–'} | ${verdict(row)}${
                row.got?.needsReview ? ' (zur Prüfung markiert)' : ''
            } | ${row.note} |`,
        );
    }
    details.push('');
    if (extra > 0) {
        details.push(
            `Zusätzlich erkannte Positionen ohne Gegenstück in der Vorlage: ${extra}.`,
            '',
        );
    }
    const taxCodes = Object.keys(expected.taxGrossCents);
    const taxText = taxCodes
        .map((code) => {
            const got = receipt.taxGrossCents[code];
            const want = expected.taxGrossCents[code] as number;
            return `${code} ${got === undefined ? 'nicht erkannt' : formatCents(got)} (erwartet ${formatCents(want)})`;
        })
        .join(', ');
    details.push(
        `- Summe der erkannten Positionen: ${formatCents(checks.itemsSumCents)}; erkannte Zettelsumme: ${
            receipt.detectedTotalCents === null
                ? 'nicht erkannt'
                : formatCents(receipt.detectedTotalCents)
        }.`,
    );
    details.push(
        `- Steuertabelle (Brutto): ${taxText}; Abgleich mit den Positionen: ${yesNo(checks.taxTableMatches)}.`,
    );
    details.push(
        '',
        '<details><summary>Gelesene Textzeilen</summary>',
        '',
        '```text',
        ...lines,
        '```',
        '',
        '</details>',
        '',
    );
}

const report = [
    '# Ergebnis der Texterkennung an den drei Testfotos',
    '',
    'Dieser Bericht wird von `npm run ocr:report` erzeugt (`scripts/ocr-report.ts`). Er vergleicht, was die Erkennung aus den drei Fotos liest, mit den erwarteten Ergebnissen in `tests/fixtures/receipts/*.expected.json`.',
    '',
    `- Erkennung: ${tesseractVersion()}, Sprachpaket \`deu\``,
    '- Weg: Vorverarbeitung (sharp) → Textfragmente finden → Tesseract liest jedes Fragment → Zeilen bilden → Kaufland-Regelwerk',
    '- Die Spalte „Hinweis“ ist von Hand gepflegt: Sie nennt Stellen, die auf dem Foto markiert sind, und Stellen, an denen die abgetippte Vorlage vom Foto abweicht.',
    '',
    '## Zusammenfassung',
    '',
    '| Zettel | Positionen erkannt | Beträge richtig | Bezeichnungen exakt | Zettelsumme | Positionen ergeben die Zettelsumme | Datum |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...summary,
    '',
    'Lesehilfe: „Beträge richtig“ und „Bezeichnungen exakt“ zählen gegen die Vorlage. Bei Zettel C weicht die Vorlage in zwei Zeilen vom Foto ab (siehe unten), dort kann die Erkennung die Vorlage nicht treffen.',
    '',
    ...details,
].join('\n');

fs.writeFileSync(output, report);
console.log(`geschrieben: ${path.relative(process.cwd(), output)}`);
