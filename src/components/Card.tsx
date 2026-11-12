import type { ReactNode } from 'react';

/** Bordered list with hairlines between the rows. */
export function Card({ children }: { children: ReactNode }) {
    return (
        <div className="flex flex-col divide-y divide-line-soft rounded-lg border border-line">
            {children}
        </div>
    );
}
