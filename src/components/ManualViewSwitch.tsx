/** The two ways to enter costs by hand. */
export type ManualView = 'amount' | 'positions';

const VIEWS: { view: ManualView; label: string }[] = [
    { view: 'amount', label: 'Ein Betrag' },
    { view: 'positions', label: 'Beleg mit Positionen' },
];

/**
 * Switches between the two views of the manual entry. Both views show it at
 * the same place, so one can always go back to the other.
 */
export function ManualViewSwitch({ view, onSwitch }: { view: ManualView; onSwitch: () => void }) {
    return (
        <div className="flex overflow-hidden rounded-lg border border-field">
            {VIEWS.map((option) => {
                const selected = option.view === view;
                return (
                    <button
                        key={option.view}
                        type="button"
                        aria-pressed={selected}
                        onClick={selected ? undefined : onSwitch}
                        className={`min-h-11 flex-1 border-0 text-sm ${
                            selected
                                ? 'bg-accent font-semibold text-white'
                                : 'cursor-pointer bg-white text-ink'
                        }`}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
