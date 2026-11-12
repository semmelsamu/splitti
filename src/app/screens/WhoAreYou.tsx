// Screen 3: tell the device which member it is (wireframe wer-bist-du.html).
// Shown on the first visit of a group on this device, and from the settings.

import { useState } from 'react';
import type { GroupDto } from '../../shared/api-types';
import { api, errorMessage } from '../api';
import { setIdentity } from '../device';
import { Button, Dialog, ErrorNote, Screen, TextField } from '../ui';

interface Props {
    token: string;
    group: GroupDto;
    /** Called after the choice is stored; reloads the group. */
    onChosen: () => void | Promise<void>;
    /** Path for a back button; only when opened from the settings. */
    back?: string;
}

export function WhoAreYou({ token, group, onChosen, back }: Props) {
    const [joining, setJoining] = useState(false);
    const members = group.members.filter((member) => member.active);

    const choose = (memberId: number) => {
        setIdentity(token, memberId);
        void onChosen();
    };

    return (
        <Screen
            title={group.group.name}
            titleAs="div"
            back={back}
            footer={
                <div className="text-[13px] text-muted">
                    Später änderbar in den Gruppeneinstellungen.
                </div>
            }
        >
            <div className="flex flex-col gap-3 px-4 py-6">
                <h1 className="m-0 text-2xl font-semibold">Wer bist du?</h1>
                <p className="m-0 mb-2 text-sm text-muted">
                    Dieses Gerät merkt sich deine Wahl. Sie belegt „Bezahlt von“ vor und steht im
                    Änderungsverlauf.
                </p>
                {members.map((member) => (
                    <button
                        key={member.id}
                        type="button"
                        onClick={() => choose(member.id)}
                        className="min-h-14 cursor-pointer rounded-lg border border-field bg-white px-4 text-left text-base font-medium text-ink"
                    >
                        {member.name}
                    </button>
                ))}
                <Button variant="dashed" className="min-h-14" onClick={() => setJoining(true)}>
                    + Ich bin neu in der Gruppe
                </Button>
            </div>
            {joining && (
                <NewMemberDialog
                    token={token}
                    onClose={() => setJoining(false)}
                    onCreated={choose}
                />
            )}
        </Screen>
    );
}

function NewMemberDialog({
    token,
    onClose,
    onCreated,
}: {
    token: string;
    onClose: () => void;
    onCreated: (memberId: number) => void;
}) {
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async () => {
        setBusy(true);
        setError('');
        try {
            const { member } = await api.addMember(token, name);
            onCreated(member.id);
        } catch (failure) {
            setError(errorMessage(failure));
            setBusy(false);
        }
    };

    return (
        <Dialog title="Ich bin neu in der Gruppe" onClose={onClose}>
            <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                }}
            >
                <TextField label="Dein Name" value={name} onChange={setName} maxLength={40} />
                <ErrorNote>{error}</ErrorNote>
                <Button type="submit" disabled={busy || name.trim() === ''}>
                    Beitreten
                </Button>
            </form>
        </Dialog>
    );
}
