// Routing inside the one React island. Astro serves the same shell for every
// app path; this decides which screen it shows. History API, no library.

import { type MouseEvent, type ReactNode, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    window.addEventListener('popstate', listener);
    return () => {
        listeners.delete(listener);
        window.removeEventListener('popstate', listener);
    };
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
    if (to !== window.location.pathname + window.location.search) {
        if (options.replace) window.history.replaceState(null, '', to);
        else window.history.pushState(null, '', to);
    }
    window.scrollTo(0, 0);
    for (const listener of listeners) listener();
}

export function usePath(): string {
    return useSyncExternalStore(
        subscribe,
        () => window.location.pathname,
        () => '/',
    );
}

/**
 * Matches a path against a pattern like "/g/:token/beleg/:id".
 * Returns the parameters, or null if the path does not fit.
 */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
    const patternParts = pattern.split('/').filter(Boolean);
    const pathParts = path.split('/').filter(Boolean);
    if (patternParts.length !== pathParts.length) return null;
    const params: Record<string, string> = {};
    for (let i = 0; i < patternParts.length; i++) {
        const expected = patternParts[i] as string;
        const actual = pathParts[i] as string;
        if (expected.startsWith(':')) {
            try {
                params[expected.slice(1)] = decodeURIComponent(actual);
            } catch {
                return null;
            }
        } else if (expected !== actual) {
            return null;
        }
    }
    return params;
}

interface LinkProps {
    to: string;
    className?: string;
    children: ReactNode;
    'aria-label'?: string;
}

/** A real link (works with "open in new tab") that navigates without a page load. */
export function Link({ to, children, ...rest }: LinkProps) {
    const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        navigate(to);
    };
    return (
        <a href={to} onClick={onClick} {...rest}>
            {children}
        </a>
    );
}
