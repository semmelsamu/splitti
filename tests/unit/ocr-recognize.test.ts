import { describe, expect, it } from 'vitest';
import { pickReading } from '../../src/ocr/recognize';
import { parseTsv } from '../../src/ocr/tesseract';

describe('pickReading', () => {
    it('has no answer without readings', () => {
        expect(pickReading([])).toBeNull();
        expect(pickReading([{ text: '   ', confidence: 90 }])).toBeNull();
    });

    it('takes the reading most variants agree on', () => {
        const best = pickReading([
            { text: 'Hauchgenuss vegan', confidence: 70 },
            { text: 'Hauchcenuss vegan', confidence: 80 },
            { text: 'Hauchgenuss vegan', confidence: 65 },
        ]);
        expect(best).toEqual({ text: 'Hauchgenuss vegan', confidence: 70 });
    });

    it('takes the most confident reading when all differ', () => {
        const best = pickReading([
            { text: 'KLÜ.Ncugat Pockets', confidence: 40 },
            { text: 'KLC.Nougat Pockets', confidence: 85 },
            { text: 'KL Nougat Pockets', confidence: 60 },
        ]);
        expect(best?.text).toBe('KLC.Nougat Pockets');
    });

    it('prefers a reading shaped like a price over a slightly more confident garbled one', () => {
        const best = pickReading([
            { text: '2,79 B', confidence: 60 },
            { text: '2,7/9 8', confidence: 75 },
        ]);
        expect(best?.text).toBe('2,79 B');
    });

    it('knows the shape of quantity and weight lines too', () => {
        expect(
            pickReading([
                { text: '3 * 1,00', confidence: 50 },
                { text: '3 # 100', confidence: 70 },
            ])?.text,
        ).toBe('3 * 1,00');
        expect(
            pickReading([
                { text: '0,440 kg', confidence: 50 },
                { text: '0,440 kg.', confidence: 70 },
            ])?.text,
        ).toBe('0,440 kg');
    });

    it('does not let the shape bonus beat two agreeing readings', () => {
        const best = pickReading([
            { text: '1,79 B', confidence: 30 },
            { text: '1,19 B', confidence: 90 },
            { text: '1,19 B', confidence: 85 },
        ]);
        expect(best?.text).toBe('1,19 B');
    });

    it('treats readings that differ only in spacing as the same', () => {
        const best = pickReading([
            { text: 'Salami  vegan', confidence: 50 },
            { text: 'Salami vegan ', confidence: 50 },
            { text: 'Salam1 vegan', confidence: 90 },
        ]);
        expect(best?.text).toBe('Salami vegan');
    });
});

describe('parseTsv', () => {
    const header =
        'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext';

    it('returns the words per page and skips the structural rows', () => {
        const tsv = [
            header,
            '1\t1\t0\t0\t0\t0\t0\t0\t300\t64\t-1\t',
            '4\t1\t1\t1\t1\t0\t12\t12\t270\t40\t-1\t',
            '5\t1\t1\t1\t1\t1\t12\t12\t80\t40\t96.5\t2,79',
            '5\t1\t1\t1\t1\t2\t110\t12\t20\t40\t91.0\tB',
            '1\t2\t0\t0\t0\t0\t0\t0\t400\t64\t-1\t',
            '5\t2\t1\t1\t1\t1\t12\t14\t300\t38\t88.2\tSalami',
            '',
        ].join('\n');
        const pages = parseTsv(tsv);
        expect([...pages.keys()]).toEqual([1, 2]);
        expect(pages.get(1)).toEqual([
            { text: '2,79', left: 12, top: 12, width: 80, height: 40, confidence: 96.5 },
            { text: 'B', left: 110, top: 12, width: 20, height: 40, confidence: 91 },
        ]);
        expect(pages.get(2)?.[0]?.text).toBe('Salami');
    });

    it('skips empty words', () => {
        const tsv = [header, '5\t1\t1\t1\t1\t1\t12\t12\t80\t40\t95\t ', ''].join('\n');
        expect(parseTsv(tsv).size).toBe(0);
    });
});
