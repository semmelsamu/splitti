// A square button with only an icon; touch target 44 px.

import type { ButtonHTMLAttributes } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    /** What the button does, for screen readers. */
    label: string;
}

export function IconButton({ label, className = '', children, ...rest }: IconButtonProps) {
    return (
        <button
            type="button"
            aria-label={label}
            className={`flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent text-ink ${className}`}
            {...rest}
        >
            {children}
        </button>
    );
}
