import type { ReactNode } from 'react';

/** An error the user should read. */
export function ErrorNote({ children }: { children: ReactNode }) {
    if (!children) return null;
    return (
        <p
            className="m-0 rounded-lg bg-warn-bg px-3 py-2 text-sm font-semibold text-warn"
            role="alert"
        >
            {children}
        </p>
    );
}
