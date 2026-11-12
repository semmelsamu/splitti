export function Loading({ label = 'Lädt …' }: { label?: string }) {
    return (
        <p className="m-0 p-6 text-center text-sm text-muted" role="status">
            {label}
        </p>
    );
}
