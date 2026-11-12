import type { ReactNode } from 'react';

/** A toggle in pill shape: a member on a position. */
export function Chip({
    pressed,
    onClick,
    children,
    disabled,
}: {
    pressed: boolean;
    onClick: () => void;
    children: ReactNode;
    disabled?: boolean;
}) {
    return (
        <button
            type="button"
            aria-pressed={pressed}
            disabled={disabled}
            onClick={onClick}
            className={`min-h-11 min-w-12 cursor-pointer rounded-full border px-3 text-[13px] ${
                pressed
                    ? 'border-accent bg-accent font-semibold text-white'
                    : 'border-field bg-white text-ink'
            }`}
        >
            {children}
        </button>
    );
}
