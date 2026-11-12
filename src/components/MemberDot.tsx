/** The colour of a member as a dot. Decoration only: the name stands next to it. */
export function MemberDot({ color, size = 12 }: { color: string; size?: number }) {
    return (
        <span
            aria-hidden="true"
            data-member-dot=""
            className="inline-block shrink-0 rounded-full"
            style={{ backgroundColor: color, width: size, height: size }}
        />
    );
}
