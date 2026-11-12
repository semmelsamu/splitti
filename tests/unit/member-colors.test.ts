import { describe, expect, it } from 'vitest';
import {
    ASSIGNMENT_ORDER,
    MEMBER_COLOR_VALUES,
    MEMBER_COLORS,
    memberColorName,
    nextMemberColor,
} from '../../src/shared/member-colors';

describe('member colours', () => {
    it('is a palette of distinct colours with distinct German names', () => {
        expect(MEMBER_COLORS.length).toBeGreaterThanOrEqual(10);
        for (const color of MEMBER_COLORS) expect(color.value).toMatch(/^#[0-9a-f]{6}$/);
        expect(new Set(MEMBER_COLOR_VALUES).size).toBe(MEMBER_COLORS.length);
        expect(new Set(MEMBER_COLORS.map((color) => color.name)).size).toBe(MEMBER_COLORS.length);
    });

    it('keeps the colours valid that were handed out before there was a choice', () => {
        const before = [
            '#1d4ed8',
            '#b45309',
            '#047857',
            '#be185d',
            '#6d28d9',
            '#0e7490',
            '#b91c1c',
            '#4d7c0f',
            '#a21caf',
            '#475569',
        ];
        for (const color of before) expect(MEMBER_COLOR_VALUES).toContain(color);
        // New groups still start with the same colours in the same order.
        expect(ASSIGNMENT_ORDER.slice(0, before.length)).toEqual(before);
    });

    it('hands out every colour of the palette exactly once before repeating', () => {
        expect([...ASSIGNMENT_ORDER].sort()).toEqual([...MEMBER_COLOR_VALUES].sort());
    });

    it('gives a new member the first colour nobody has yet', () => {
        expect(nextMemberColor([])).toBe('#1d4ed8');
        expect(nextMemberColor(['#1d4ed8'])).toBe('#b45309');
        // Someone chose the second colour for themselves: skip it.
        expect(nextMemberColor(['#b45309'])).toBe('#1d4ed8');
        expect(nextMemberColor(['#1d4ed8', '#b45309', '#be185d'])).toBe('#047857');
    });

    it('repeats the colours in turn once all are taken', () => {
        const all = [...ASSIGNMENT_ORDER];
        expect(nextMemberColor(all)).toBe(ASSIGNMENT_ORDER[0]);
        expect(nextMemberColor([...all, ASSIGNMENT_ORDER[0] as string])).toBe(ASSIGNMENT_ORDER[1]);
    });

    it('names a colour for screen readers and the history', () => {
        expect(memberColorName('#b91c1c')).toBe('Rot');
        expect(memberColorName('#1d4ed8')).toBe('Blau');
        expect(memberColorName('#123456')).toBe('Farbe');
    });
});
