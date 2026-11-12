// Screen 1: the groups this device knows (wireframe start.html).

import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Dialog } from '../../components/Dialog';
import { ErrorNote } from '../../components/ErrorNote';
import { Hint } from '../../components/Hint';
import { ChevronRight } from '../../components/icons';
import { Screen } from '../../components/Screen';
import { SectionTitle } from '../../components/SectionTitle';
import { TextField } from '../../components/TextField';
import type { GroupDto } from '../../shared/api-types';
import { ApiRequestError, api } from '../api';
import { forgetGroup, type KnownGroup, useKnownGroups } from '../device';
import { memberCountText, ownBalanceText } from '../format';
import { navigate } from '../router';
import { tokenFromInput } from '../share';

type Summary =
    | { status: 'loading' }
    | { status: 'ready'; text: string }
    | { status: 'gone' }
    | { status: 'offline' };

function summarize(group: KnownGroup, data: GroupDto): string {
    const active = data.members.filter((member) => member.active);
    const count = memberCountText(active.length);
    const me = active.find((member) => member.id === group.memberId);
    if (!me) return count;
    const cents = data.balances.find((balance) => balance.memberId === me.id)?.cents ?? 0;
    return `${count} · ${ownBalanceText(cents)}`;
}

export function Start() {
    const groups = useKnownGroups();
    const [summaries, setSummaries] = useState<Record<string, Summary>>({});
    const [names, setNames] = useState<Record<string, string>>({});
    const [joining, setJoining] = useState(false);

    // Member count and own balance come from the server, per group.
    useEffect(() => {
        let cancelled = false;
        for (const group of groups) {
            api.getGroup(group.token)
                .then((data) => {
                    if (cancelled) return;
                    setSummaries((old) => ({
                        ...old,
                        [group.token]: { status: 'ready', text: summarize(group, data) },
                    }));
                    setNames((old) => ({ ...old, [group.token]: data.group.name }));
                })
                .catch((error) => {
                    if (cancelled) return;
                    const gone = error instanceof ApiRequestError && error.status === 404;
                    setSummaries((old) => ({
                        ...old,
                        [group.token]: { status: gone ? 'gone' : 'offline' },
                    }));
                });
        }
        return () => {
            cancelled = true;
        };
    }, [groups]);

    return (
        <Screen
            title="Splitti"
            footer={
                <Button tall onClick={() => navigate('/neu')}>
                    Gruppe erstellen
                </Button>
            }
        >
            <div className="flex flex-col gap-2 p-4">
                <div className="mb-1">
                    <SectionTitle>Deine Gruppen auf diesem Gerät</SectionTitle>
                </div>
                {groups.length === 0 ? (
                    <p className="m-0 rounded-lg border border-line px-3.5 py-4 text-sm text-muted">
                        Noch keine Gruppe auf diesem Gerät.
                    </p>
                ) : (
                    <Card>
                        {groups.map((group) => {
                            const summary = summaries[group.token] ?? { status: 'loading' };
                            if (summary.status === 'gone') {
                                return (
                                    <div
                                        key={group.token}
                                        className="flex min-h-16 items-center gap-3 px-3.5 py-2"
                                    >
                                        <span className="flex flex-1 flex-col gap-0.5">
                                            <span className="font-semibold">{group.name}</span>
                                            <span className="text-[13px] text-muted">
                                                Diese Gruppe gibt es nicht mehr.
                                            </span>
                                        </span>
                                        <Button
                                            variant="text"
                                            onClick={() => forgetGroup(group.token)}
                                        >
                                            Entfernen
                                        </Button>
                                    </div>
                                );
                            }
                            return (
                                <button
                                    key={group.token}
                                    type="button"
                                    onClick={() => navigate(`/g/${group.token}`)}
                                    className="flex min-h-16 cursor-pointer items-center gap-3 border-0 bg-transparent px-3.5 py-2 text-left text-[15px] text-ink"
                                >
                                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <span className="truncate font-semibold">
                                            {names[group.token] ?? group.name}
                                        </span>
                                        <span className="text-[13px] text-muted">
                                            {summary.status === 'ready' && summary.text}
                                            {summary.status === 'loading' && 'Lädt …'}
                                            {summary.status === 'offline' &&
                                                'Server nicht erreichbar'}
                                        </span>
                                    </span>
                                    <ChevronRight />
                                </button>
                            );
                        })}
                    </Card>
                )}
                <div className="mt-2">
                    <Hint>
                        Einladungslink bekommen? Öffne ihn auf diesem Gerät, dann erscheint die
                        Gruppe hier.
                    </Hint>
                </div>
                <Button variant="text" className="self-start" onClick={() => setJoining(true)}>
                    Einladungslink einfügen
                </Button>
            </div>
            {joining && <JoinDialog onClose={() => setJoining(false)} />}
        </Screen>
    );
}

/** For the installed app, where a link from a chat opens in the browser instead. */
function JoinDialog({ onClose }: { onClose: () => void }) {
    const [link, setLink] = useState('');
    const [error, setError] = useState('');

    const join = () => {
        const token = tokenFromInput(link);
        if (!token) {
            setError('Das ist kein Einladungslink von Splitti.');
            return;
        }
        navigate(`/g/${token}`);
    };

    return (
        <Dialog title="Einladungslink einfügen" onClose={onClose}>
            <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    join();
                }}
            >
                <TextField
                    label="Einladungslink"
                    value={link}
                    onChange={(value) => {
                        setLink(value);
                        setError('');
                    }}
                    inputMode="url"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                />
                <ErrorNote>{error}</ErrorNote>
                <Button type="submit" disabled={link.trim() === ''}>
                    Gruppe öffnen
                </Button>
            </form>
        </Dialog>
    );
}
