import { useState } from 'react';
import { Button } from './Button';

/** The small "Zettel" tile; tapping it shows the photo in full. */
export function ReceiptImageButton({ src }: { src: string }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button
                type="button"
                aria-label="Zettelbild ansehen"
                onClick={() => setOpen(true)}
                className="h-16 w-12 shrink-0 cursor-pointer overflow-hidden rounded border border-dashed border-field bg-white p-0 text-[11px] text-muted"
            >
                <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
            {open && (
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-label="Zettelbild"
                    className="fixed inset-0 z-50 flex flex-col bg-black"
                >
                    <div className="flex shrink-0 justify-end p-2">
                        <Button variant="secondary" onClick={() => setOpen(false)}>
                            Schließen
                        </Button>
                    </div>
                    {/* The photo scrolls and can be pinched larger. */}
                    <div className="min-h-0 flex-1 overflow-auto">
                        <img
                            src={src}
                            alt="Foto des Kassenzettels"
                            className="mx-auto block w-full max-w-[900px]"
                        />
                    </div>
                </div>
            )}
        </>
    );
}
