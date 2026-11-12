import { describe, expect, it } from 'vitest';
import { formatCents, formatEuro, parseAmount } from '../../src/core/money';

describe('formatCents', () => {
    it('formats cents with a decimal comma', () => {
        expect(formatCents(1163)).toBe('11,63');
        expect(formatCents(5)).toBe('0,05');
        expect(formatCents(0)).toBe('0,00');
        expect(formatCents(100000)).toBe('1000,00');
    });

    it('formats negative amounts', () => {
        expect(formatCents(-50)).toBe('-0,50');
        expect(formatCents(-1234)).toBe('-12,34');
    });

    it('rejects fractions of a cent', () => {
        expect(() => formatCents(1.5)).toThrow();
    });

    it('adds the euro sign', () => {
        expect(formatEuro(802)).toBe('8,02 €');
    });
});

describe('parseAmount', () => {
    it.each([
        ['40', 4000],
        ['40,5', 4050],
        ['40,50', 4050],
        ['40.50', 4050],
        ['0,05', 5],
        [' 12,34 € ', 1234],
        ['-0,25', -25],
        ['1.234,56', 123456],
        ['1,234.56', 123456],
    ])('reads %j as %i cents', (text, cents) => {
        expect(parseAmount(text)).toBe(cents);
    });

    it.each(['', 'abc', '12,345', '1,2,3', '12,', ',50', '--5'])('rejects %j', (text) => {
        expect(parseAmount(text)).toBeNull();
    });

    it('round-trips with formatCents', () => {
        for (const cents of [0, 1, 99, 100, 1163, 99999, -1, -250]) {
            expect(parseAmount(formatCents(cents))).toBe(cents);
        }
    });
});
