import { useGroup } from '../app/group';
import type { MemberDto } from '../shared/api-types';
import { Button } from './Button';
import { Chip } from './Chip';

interface MemberChipsProps {
    members: readonly MemberDto[];
    selected: readonly number[];
    onChange: (memberIds: number[]) => void;
    /** Accessible name of the group of chips, e.g. the position's label. */
    label: string;
}

/** One chip per member plus "alle": who shares this position. */
export function MemberChips({ members, selected, onChange, label }: MemberChipsProps) {
    const group = useGroup();
    const chosen = new Set(selected);
    const toggle = (id: number) => {
        onChange(chosen.has(id) ? selected.filter((other) => other !== id) : [...selected, id]);
    };
    return (
        // biome-ignore lint/a11y/useSemanticElements: a fieldset would bring its own border and legend layout
        <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1.5">
            {members.map((member) => (
                <Chip
                    key={member.id}
                    pressed={chosen.has(member.id)}
                    onClick={() => toggle(member.id)}
                >
                    {group.label(member.id)}
                </Chip>
            ))}
            <div className="flex-1" />
            <Button
                variant="text"
                className="px-2.5 text-[13px]"
                onClick={() => onChange(members.map((member) => member.id))}
            >
                alle
            </Button>
        </div>
    );
}
