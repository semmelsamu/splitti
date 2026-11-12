import { useGroup } from '../app/group';
import { selectableMembers } from '../app/members';
import { Dialog } from './Dialog';

/** Sheet to choose who paid. */
export function PayerDialog({
    selected,
    onSelect,
    onClose,
}: {
    selected: number;
    onSelect: (memberId: number) => void;
    onClose: () => void;
}) {
    const group = useGroup();
    const members = selectableMembers(group, [selected]);
    return (
        <Dialog title="Bezahlt von" onClose={onClose}>
            <div className="flex flex-col gap-2">
                {members.map((member) => (
                    <button
                        key={member.id}
                        type="button"
                        aria-pressed={member.id === selected}
                        onClick={() => {
                            onSelect(member.id);
                            onClose();
                        }}
                        className={`min-h-12 cursor-pointer rounded-lg border px-4 text-left text-base ${
                            member.id === selected
                                ? 'border-accent bg-accent font-semibold text-white'
                                : 'border-field bg-white text-ink'
                        }`}
                    >
                        {group.label(member.id)}
                    </button>
                ))}
            </div>
        </Dialog>
    );
}
