// The frame of every screen, after the wireframes in docs/wireframes: one
// column in phone format, title bar on top, the main action in a grey bar at
// the bottom.

import { ChevronLeftIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { navigate } from '../app/router';
import { IconButton } from './IconButton';

interface ScreenProps {
    title: ReactNode;
    /** Path the back button leads to; without it there is no back button. */
    back?: string;
    /** Called instead of going to `back`, e.g. to ask before unsaved work is lost. */
    onBack?: () => void;
    /** Buttons at the right end of the title bar. */
    actions?: ReactNode;
    /** Grey bar below the title, e.g. the receipt summary. */
    banner?: ReactNode;
    /** Grey bar at the bottom with the main action. */
    footer?: ReactNode;
    /** The title is the page heading (h1) unless the body brings its own. */
    titleAs?: 'h1' | 'div';
    children: ReactNode;
}

export function Screen({
    title,
    back,
    onBack,
    actions,
    banner,
    footer,
    titleAs = 'h1',
    children,
}: ScreenProps) {
    const Title = titleAs;
    return (
        <div className="mx-auto flex h-dvh w-full max-w-[480px] flex-col bg-white text-ink shadow-sm">
            <header
                className={`flex min-h-[60px] shrink-0 items-center gap-2 border-b border-line py-2 pr-2 ${
                    back ? 'pl-2' : 'pl-4'
                }`}
            >
                {back && (
                    <IconButton label="Zurück" onClick={() => (onBack ? onBack() : navigate(back))}>
                        <ChevronLeftIcon size={22} />
                    </IconButton>
                )}
                <Title className="m-0 min-w-0 flex-1 truncate text-[17px] font-semibold">
                    {title}
                </Title>
                {actions}
            </header>
            {banner}
            <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
            {footer && (
                <footer className="flex shrink-0 flex-col gap-2.5 border-t border-line bg-panel px-4 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
                    {footer}
                </footer>
            )}
        </div>
    );
}
