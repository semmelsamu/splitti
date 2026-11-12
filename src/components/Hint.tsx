import type { ReactNode } from 'react';

export function Hint({ children }: { children: ReactNode }) {
    return <p className="m-0 text-[13px] text-muted">{children}</p>;
}
