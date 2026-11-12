import type { ReactNode } from 'react';

/** Section heading as in the wireframes: small, grey, semibold. */
export function SectionTitle({ children }: { children: ReactNode }) {
    return <h2 className="m-0 text-[13px] font-semibold text-muted">{children}</h2>;
}
