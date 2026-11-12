// "Link teilen": the invitation link of a group through the share sheet of the device.

/** The link that opens the group; whoever has it may do everything in the group. */
export function invitationLink(token: string): string {
    return `${window.location.origin}/g/${encodeURIComponent(token)}`;
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'unavailable';

/**
 * Opens the share sheet. Where the browser has none (desktop), the link is
 * copied to the clipboard instead. 'unavailable' means neither worked and the
 * caller should show the link to copy by hand.
 */
export async function shareInvitation(token: string, groupName: string): Promise<ShareResult> {
    const url = invitationLink(token);
    if (typeof navigator.share === 'function') {
        try {
            await navigator.share({
                title: `Splitti – ${groupName}`,
                text: `Tritt der Gruppe „${groupName}“ bei:`,
                url,
            });
            return 'shared';
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
            // Anything else: fall through to the clipboard.
        }
    }
    try {
        await navigator.clipboard.writeText(url);
        return 'copied';
    } catch {
        return 'unavailable';
    }
}

/** Reads a group token from a pasted invitation link or from the bare code. */
export function tokenFromInput(input: string): string | null {
    const text = input.trim();
    const fromLink = /\/g\/([A-Za-z0-9_-]{16,})/.exec(text);
    if (fromLink) return fromLink[1] as string;
    return /^[A-Za-z0-9_-]{16,}$/.test(text) ? text : null;
}
