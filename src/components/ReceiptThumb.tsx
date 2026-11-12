import { ReceiptTextIcon } from 'lucide-react';
import { useState } from 'react';

/**
 * The small picture in front of a receipt in a list: its photo, or a quiet
 * sign for entries without one. Never an empty frame, which would look like
 * a picture that failed to load.
 */
export function ReceiptThumb({ src }: { src: string | null }) {
    const [failed, setFailed] = useState(false);
    if (src && !failed) {
        return (
            <img
                src={src}
                alt=""
                loading="lazy"
                onError={() => setFailed(true)}
                className="box-border h-[42px] w-8 shrink-0 rounded-[3px] border border-line bg-panel object-cover object-top"
            />
        );
    }
    return (
        <span
            aria-hidden="true"
            className="flex h-[42px] w-8 shrink-0 items-center justify-center rounded-[3px] bg-panel text-muted"
        >
            <ReceiptTextIcon size={16} />
        </span>
    );
}
