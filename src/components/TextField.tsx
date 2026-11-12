import { type InputHTMLAttributes, type ReactNode, useId } from 'react';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
    label: string;
    value: string;
    onChange: (value: string) => void;
    hint?: ReactNode;
    /** Keep the label for screen readers only. */
    hideLabel?: boolean;
}

export const INPUT_STYLE =
    'min-h-12 w-full min-w-0 rounded-lg border border-field bg-white px-3 text-base text-ink';

export function TextField({
    label,
    value,
    onChange,
    hint,
    hideLabel = false,
    className = '',
    ...rest
}: TextFieldProps) {
    const id = useId();
    return (
        <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
            <label
                htmlFor={id}
                className={hideLabel ? 'sr-only' : 'text-[13px] font-semibold text-muted'}
            >
                {label}
            </label>
            <input
                id={id}
                type="text"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className={INPUT_STYLE}
                {...rest}
            />
            {hint && <div className="text-[13px] text-muted">{hint}</div>}
        </div>
    );
}
