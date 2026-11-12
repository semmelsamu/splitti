// Screen 2: create a group (wireframe gruppe-erstellen.html).

import { XIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ErrorNote } from '../../components/ErrorNote';
import { Hint } from '../../components/Hint';
import { IconButton } from '../../components/IconButton';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { api, errorMessage } from '../api';
import { rememberGroup, setIdentity } from '../device';
import { navigate } from '../router';

export function CreateGroup() {
    const [name, setName] = useState('');
    const [ownName, setOwnName] = useState('');
    const [members, setMembers] = useState<string[]>([]);
    const [newMember, setNewMember] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const addMember = () => {
        const candidate = newMember.trim();
        if (candidate === '') return;
        const taken = [ownName, ...members].some(
            (existing) =>
                existing.trim().toLocaleLowerCase('de') === candidate.toLocaleLowerCase('de'),
        );
        if (taken) {
            setError(`„${candidate}“ steht schon auf der Liste.`);
            return;
        }
        setMembers([...members, candidate]);
        setNewMember('');
        setError('');
    };

    const submit = async () => {
        setBusy(true);
        setError('');
        try {
            // A name still sitting in the "add" field is meant to be a member too.
            const pending = newMember.trim();
            const all = pending === '' ? members : [...members, pending];
            const { token, memberId } = await api.createGroup({ name, ownName, members: all });
            rememberGroup(token, name.trim());
            setIdentity(token, memberId);
            navigate(`/g/${token}`, { replace: true });
        } catch (failure) {
            setError(errorMessage(failure));
            setBusy(false);
        }
    };

    return (
        <Screen
            title="Gruppe erstellen"
            back="/"
            footer={
                <>
                    <Hint>
                        Danach öffnet sich die Gruppe; den Einladungslink teilst du dort über „Link
                        teilen“.
                    </Hint>
                    <Button
                        type="submit"
                        form="create-group"
                        disabled={busy || name.trim() === '' || ownName.trim() === ''}
                    >
                        Gruppe erstellen
                    </Button>
                </>
            }
        >
            <form
                id="create-group"
                className="flex flex-col gap-4 p-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                }}
            >
                <TextField label="Name der Gruppe" value={name} onChange={setName} maxLength={40} />
                <TextField
                    label="Dein Name"
                    value={ownName}
                    onChange={setOwnName}
                    maxLength={40}
                    autoComplete="given-name"
                    hint="Dieses Gerät wird dir zugeordnet."
                />
                <div className="flex flex-col gap-1.5">
                    <div className="text-[13px] font-semibold text-muted">Weitere Mitglieder</div>
                    {members.length > 0 && (
                        <Card>
                            {members.map((member) => (
                                <div key={member} className="flex items-center pr-1 pl-3.5">
                                    <span className="min-w-0 flex-1 truncate">{member}</span>
                                    <IconButton
                                        label={`${member} entfernen`}
                                        className="text-muted"
                                        onClick={() =>
                                            setMembers(members.filter((other) => other !== member))
                                        }
                                    >
                                        <XIcon size={18} />
                                    </IconButton>
                                </div>
                            ))}
                        </Card>
                    )}
                    <div className="flex gap-2">
                        <TextField
                            label="Name des neuen Mitglieds"
                            hideLabel
                            placeholder="Name"
                            value={newMember}
                            onChange={setNewMember}
                            maxLength={40}
                            className="flex-1"
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    addMember();
                                }
                            }}
                        />
                        <Button variant="secondary" onClick={addMember}>
                            Hinzufügen
                        </Button>
                    </div>
                    <Hint>
                        Mitglieder kannst du auch später ergänzen. Wer den Link öffnet, wählt seinen
                        Namen aus dieser Liste.
                    </Hint>
                </div>
                <ErrorNote>{error}</ErrorNote>
            </form>
        </Screen>
    );
}
