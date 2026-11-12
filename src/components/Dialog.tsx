import { XIcon } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef } from 'react';
import { IconButton } from './IconButton';

interface DialogProps {
    title: string;
    onClose: () => void;
    children: ReactNode;
}

/** A sheet that slides over the screen from the bottom. Escape or a tap outside closes it. */
export function Dialog({ title, onClose, children }: DialogProps) {
    const titleId = useId();
    const panel = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        // Put the keyboard focus into the sheet: first field, else the sheet itself.
        const first = panel.current?.querySelector<HTMLElement>('input, select, textarea');
        (first ?? panel.current)?.focus();
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
            <button
                type="button"
                aria-label="Schließen"
                tabIndex={-1}
                className="absolute inset-0 cursor-default border-0 bg-black/40"
                onClick={onClose}
            />
            <div
                ref={panel}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="relative flex max-h-[90dvh] w-full max-w-[480px] flex-col gap-4 overflow-y-auto rounded-t-2xl bg-white px-4 pt-4 pb-[max(20px,env(safe-area-inset-bottom))] outline-none"
            >
                <div className="flex items-center gap-2">
                    <h2 id={titleId} className="m-0 flex-1 text-[17px] font-semibold">
                        {title}
                    </h2>
                    <IconButton label="Schließen" onClick={onClose} className="-mr-2">
                        <XIcon size={18} />
                    </IconButton>
                </div>
                {children}
            </div>
        </div>
    );
}
