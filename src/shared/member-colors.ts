// The colours a member can have. One fixed palette for server and UI: the
// server accepts only these values, the group settings offer them to choose.

/** In the order of the picker, by hue. The names are for screen readers and the history. */
export const MEMBER_COLORS = [
    { value: '#b91c1c', name: 'Rot' },
    { value: '#b45309', name: 'Orange' },
    { value: '#ca8a04', name: 'Gelb' },
    { value: '#4d7c0f', name: 'Olivgrün' },
    { value: '#047857', name: 'Grün' },
    { value: '#0e7490', name: 'Türkis' },
    { value: '#1d4ed8', name: 'Blau' },
    { value: '#6d28d9', name: 'Violett' },
    { value: '#a21caf', name: 'Magenta' },
    { value: '#be185d', name: 'Pink' },
    { value: '#78350f', name: 'Braun' },
    { value: '#475569', name: 'Grau' },
] as const;

export type MemberColor = (typeof MEMBER_COLORS)[number]['value'];

export const MEMBER_COLOR_VALUES = MEMBER_COLORS.map((color) => color.value) as [
    MemberColor,
    ...MemberColor[],
];

/** Order in which new members get a colour: neighbours in the list differ clearly. */
export const ASSIGNMENT_ORDER: readonly MemberColor[] = [
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
    '#ca8a04',
    '#78350f',
];

/**
 * The colour for a new member: the first one nobody in the group has yet.
 * In a group with more members than colours they repeat in turn.
 */
export function nextMemberColor(taken: readonly string[]): MemberColor {
    const free = ASSIGNMENT_ORDER.find((color) => !taken.includes(color));
    return free ?? (ASSIGNMENT_ORDER[taken.length % ASSIGNMENT_ORDER.length] as MemberColor);
}

/** "Rot" for "#b91c1c". */
export function memberColorName(value: string): string {
    return MEMBER_COLORS.find((color) => color.value === value)?.name ?? 'Farbe';
}
