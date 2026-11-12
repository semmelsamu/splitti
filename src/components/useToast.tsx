import { type ReactNode, useEffect, useState } from 'react';

/** Shows a short confirmation at the bottom for a few seconds. */
export function useToast(): [ReactNode, (message: string) => void] {
    const [message, setMessage] = useState<string | null>(null);
    useEffect(() => {
        if (message === null) return;
        const timer = window.setTimeout(() => setMessage(null), 3000);
        return () => window.clearTimeout(timer);
    }, [message]);
    const node = message ? (
        <div
            role="status"
            className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4"
        >
            <div className="rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lg">
                {message}
            </div>
        </div>
    ) : null;
    return [node, setMessage];
}
