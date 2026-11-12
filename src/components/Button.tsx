import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'text' | 'dashed';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    /** 52 px for the main action of a screen, otherwise 48 px (44 px for text buttons). */
    tall?: boolean;
}

const BUTTON_STYLES: Record<Variant, string> = {
    primary:
        'rounded-lg border-0 bg-accent px-4 text-base font-semibold text-white disabled:bg-[#c9c9c9] disabled:text-[#3d3d3d]',
    secondary:
        'rounded-lg border border-field bg-white px-4 text-[15px] font-semibold text-ink disabled:opacity-50',
    text: 'border-0 bg-transparent px-1 text-sm font-semibold text-accent disabled:opacity-50',
    dashed: 'rounded-lg border border-dashed border-field bg-white px-4 text-left text-[15px] text-ink disabled:opacity-50',
};

export function Button({
    variant = 'primary',
    tall = false,
    className = '',
    type = 'button',
    ...rest
}: ButtonProps) {
    const height = variant === 'text' ? 'min-h-11 min-w-11' : tall ? 'min-h-[52px]' : 'min-h-12';
    return (
        <button
            type={type}
            className={`${height} cursor-pointer disabled:cursor-default ${BUTTON_STYLES[variant]} ${className}`}
            {...rest}
        />
    );
}
