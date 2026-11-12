// Icons from the wireframes.

import type { ReactNode } from 'react';

function Svg({ size, children }: { size: number; children: ReactNode }) {
    return (
        <svg
            aria-hidden="true"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            {children}
        </svg>
    );
}

export const ChevronLeft = () => (
    <Svg size={22}>
        <path d="M15 5l-7 7 7 7" />
    </Svg>
);

export const ChevronRight = () => (
    <Svg size={18}>
        <path d="M9 5l7 7-7 7" />
    </Svg>
);

export const MenuIcon = () => (
    <Svg size={22}>
        <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
);

export const CloseIcon = () => (
    <Svg size={18}>
        <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
);

export const PencilIcon = () => (
    <Svg size={18}>
        <path d="M4 20h4L19 9l-4-4L4 16z" />
    </Svg>
);
