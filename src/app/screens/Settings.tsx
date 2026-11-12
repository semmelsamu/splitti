// Group settings, a sub-page of the overview: name, members, invitation link,
// and which member this device is.

import { CheckIcon, PencilIcon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Dialog } from '../../components/Dialog';
import { ErrorNote } from '../../components/ErrorNote';
import { Hint } from '../../components/Hint';
import { IconButton } from '../../components/IconButton';
import { MemberDot } from '../../components/MemberDot';
import { Screen } from '../../components/Screen';
import { SectionTitle } from '../../components/SectionTitle';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/useToast';
import type { MemberDto } from '../../shared/api-types';
import { MEMBER_COLORS } from '../../shared/member-colors';
import { api, errorMessage } from '../api';
import { forgetGroup, setIdentity } from '../device';
import { useGroup } from '../group';
import { navigate } from '../router';
import { invitationLink, shareInvitation } from '../share';
import { WhoAreYou } from './WhoAreYou';

export function Settings() {
    const group = useGroup();
    const [toast, showToast] = useToast();
    const [name, setName] = useState(group.name);
    const [newMember, setNewMember] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [renaming, setRenaming] = useState<MemberDto | null>(null);
    const [coloring, setColoring] = useState<MemberDto | null>(null);
    const [removing, setRemoving] = useState<MemberDto | null>(null);
    const [choosingIdentity, setChoosingIdentity] = useState(false);
    const [forgetting, setForgetting] = useState(false);

    /** Runs a change, shows what went wrong, and refreshes the group afterwards. */
    const run = async (action: () => Promise<unknown>, done?: string): Promise<boolean> => {
        setBusy(true);
        setError('');
        try {
            await action();
            await group.reload();
            if (done) showToast(done);
            return true;
        } catch (failure) {
            setError(errorMessage(failure));
            return false;
        } finally {
            setBusy(false);
        }
    };

    const share = async () => {
        const result = await shareInvitation(group.token, group.name);
        if (result === 'copied') showToast('Link kopiert');
        if (result === 'unavailable') showToast('Bitte den Link von Hand kopieren');
    };

    if (choosingIdentity) {
        return (
            <WhoAreYou
                token={group.token}
                group={{
                    group: { name: group.name, createdAt: '' },
                    members: group.members,
                    balances: [],
                }}
                back={`/g/${group.token}/einstellungen`}
                onChosen={async () => {
                    await group.reload();
                    setChoosingIdentity(false);
                }}
            />
        );
    }

    const removed = group.members.filter((member) => !member.active);

    return (
        <Screen title="Gruppeneinstellungen" back={`/g/${group.token}`}>
            <div className="flex flex-col gap-6 p-4">
                <ErrorNote>{error}</ErrorNote>

                <form
                    className="flex flex-col gap-2"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void run(() => api.renameGroup(group.token, name), 'Name gespeichert');
                    }}
                >
                    <div className="flex items-end gap-2">
                        <TextField
                            label="Name der Gruppe"
                            value={name}
                            onChange={setName}
                            maxLength={40}
                            className="flex-1"
                        />
                        <Button
                            type="submit"
                            variant="secondary"
                            disabled={busy || name.trim() === '' || name.trim() === group.name}
                        >
                            Speichern
                        </Button>
                    </div>
                </form>

                <section className="flex flex-col gap-2">
                    <SectionTitle>Mitglieder</SectionTitle>
                    <Card>
                        {group.activeMembers.map((member) => (
                            <div key={member.id} className="flex items-center pr-1 pl-0.5">
                                <IconButton
                                    label={`Farbe von ${member.name} wählen`}
                                    onClick={() => setColoring(member)}
                                >
                                    <MemberDot color={member.color} size={20} />
                                </IconButton>
                                <span className="min-w-0 flex-1 truncate">
                                    {member.name}
                                    {member.id === group.me.id && (
                                        <span className="text-muted"> (du)</span>
                                    )}
                                </span>
                                <IconButton
                                    label={`${member.name} umbenennen`}
                                    className="text-muted"
                                    onClick={() => setRenaming(member)}
                                >
                                    <PencilIcon size={18} />
                                </IconButton>
                                {/* Nobody removes themselves by accident: change the identity first. */}
                                {member.id === group.me.id ? (
                                    <span className="w-11" />
                                ) : (
                                    <IconButton
                                        label={`${member.name} entfernen`}
                                        className="text-muted"
                                        onClick={() => setRemoving(member)}
                                    >
                                        <XIcon size={18} />
                                    </IconButton>
                                )}
                            </div>
                        ))}
                    </Card>
                    <form
                        className="flex gap-2"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void run(() => api.addMember(group.token, newMember)).then((ok) => {
                                if (ok) setNewMember('');
                            });
                        }}
                    >
                        <TextField
                            label="Name des neuen Mitglieds"
                            hideLabel
                            placeholder="Name"
                            value={newMember}
                            onChange={setNewMember}
                            maxLength={40}
                            className="flex-1"
                        />
                        <Button
                            type="submit"
                            variant="secondary"
                            disabled={busy || newMember.trim() === ''}
                        >
                            Hinzufügen
                        </Button>
                    </form>
                    <Hint>
                        Wer schon in Belegen oder Zahlungen vorkommt, wird beim Entfernen nur
                        ausgeblendet; alte Belege und Salden bleiben, wie sie sind.
                    </Hint>
                </section>

                {removed.length > 0 && (
                    <section className="flex flex-col gap-2">
                        <SectionTitle>Entfernte Mitglieder</SectionTitle>
                        <Card>
                            {removed.map((member) => (
                                <div key={member.id} className="flex items-center pr-2 pl-3.5">
                                    <span className="min-w-0 flex-1 truncate text-muted">
                                        {member.name}
                                    </span>
                                    <Button
                                        variant="text"
                                        disabled={busy}
                                        onClick={() =>
                                            void run(() =>
                                                api.updateMember(group.token, member.id, {
                                                    active: true,
                                                }),
                                            )
                                        }
                                    >
                                        Wieder aufnehmen
                                    </Button>
                                </div>
                            ))}
                        </Card>
                    </section>
                )}

                <section className="flex flex-col gap-2">
                    <SectionTitle>Dieses Gerät</SectionTitle>
                    <div className="flex items-center gap-3 rounded-lg border border-line py-1 pr-2 pl-3.5">
                        <span className="min-w-0 flex-1 truncate">
                            Du bist <strong>{group.me.name}</strong>
                        </span>
                        <Button variant="text" onClick={() => setChoosingIdentity(true)}>
                            Ändern
                        </Button>
                    </div>
                </section>

                <section className="flex flex-col gap-2">
                    <SectionTitle>Einladungslink</SectionTitle>
                    <p
                        className="m-0 select-all break-all rounded-lg border border-line bg-panel p-3 text-sm"
                        data-testid="invitation-link"
                    >
                        {invitationLink(group.token)}
                    </p>
                    <Button variant="secondary" onClick={() => void share()}>
                        Link teilen
                    </Button>
                    <Hint>
                        Wer den Link hat, darf in der Gruppe alles: Belege ändern, Mitglieder
                        entfernen. Gib ihn nur an Mitglieder weiter.
                    </Hint>
                </section>

                <section className="flex flex-col gap-2">
                    <Button
                        variant="text"
                        className="self-start"
                        onClick={() => setForgetting(true)}
                    >
                        Gruppe von diesem Gerät entfernen
                    </Button>
                </section>
            </div>

            {renaming && (
                <RenameDialog
                    member={renaming}
                    onClose={() => setRenaming(null)}
                    onSave={async (newName) => {
                        const ok = await run(() =>
                            api.updateMember(group.token, renaming.id, { name: newName }),
                        );
                        if (ok) setRenaming(null);
                    }}
                    busy={busy}
                    error={error}
                />
            )}

            {coloring && (
                <ColorDialog
                    member={coloring}
                    onClose={() => setColoring(null)}
                    onSelect={async (color) => {
                        const ok = await run(() =>
                            api.updateMember(group.token, coloring.id, { color }),
                        );
                        if (ok) setColoring(null);
                    }}
                    busy={busy}
                    error={error}
                />
            )}

            {removing && (
                <Dialog title={`${removing.name} entfernen?`} onClose={() => setRemoving(null)}>
                    <p className="m-0 text-sm text-muted">
                        {removing.name} kann danach für neue Belege nicht mehr ausgewählt werden.
                        Bestehende Belege, Zahlungen und der Saldo bleiben erhalten.
                    </p>
                    <Button
                        disabled={busy}
                        onClick={() =>
                            void run(() =>
                                api.updateMember(group.token, removing.id, { active: false }),
                            ).then(() => setRemoving(null))
                        }
                    >
                        Entfernen
                    </Button>
                    <Button variant="secondary" onClick={() => setRemoving(null)}>
                        Abbrechen
                    </Button>
                </Dialog>
            )}

            {forgetting && (
                <Dialog
                    title="Gruppe von diesem Gerät entfernen?"
                    onClose={() => setForgetting(false)}
                >
                    <p className="m-0 text-sm text-muted">
                        Die Gruppe bleibt bestehen, sie verschwindet nur von der Startseite dieses
                        Geräts. Mit dem Einladungslink kommst du wieder hinein; heb ihn auf, bevor
                        du die Gruppe entfernst.
                    </p>
                    <Button
                        onClick={() => {
                            setIdentity(group.token, null);
                            forgetGroup(group.token);
                            navigate('/', { replace: true });
                        }}
                    >
                        Von diesem Gerät entfernen
                    </Button>
                    <Button variant="secondary" onClick={() => setForgetting(false)}>
                        Abbrechen
                    </Button>
                </Dialog>
            )}
            {toast}
        </Screen>
    );
}

/** The fixed palette to choose from; a tap saves. */
function ColorDialog({
    member,
    onClose,
    onSelect,
    busy,
    error,
}: {
    member: MemberDto;
    onClose: () => void;
    onSelect: (color: string) => void | Promise<void>;
    busy: boolean;
    error: string;
}) {
    return (
        <Dialog title={`Farbe von ${member.name}`} onClose={onClose}>
            <div className="grid grid-cols-6 justify-items-center gap-y-2">
                {MEMBER_COLORS.map((color) => {
                    const current = color.value === member.color;
                    return (
                        <button
                            key={color.value}
                            type="button"
                            aria-label={color.name}
                            aria-pressed={current}
                            disabled={busy}
                            onClick={() => (current ? onClose() : void onSelect(color.value))}
                            className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0"
                        >
                            <span
                                className={`flex h-9 w-9 items-center justify-center rounded-full text-white ${
                                    current ? 'outline-2 outline-offset-2 outline-ink' : ''
                                }`}
                                style={{ backgroundColor: color.value }}
                            >
                                {current && <CheckIcon size={18} strokeWidth={3} />}
                            </span>
                        </button>
                    );
                })}
            </div>
            <ErrorNote>{error}</ErrorNote>
        </Dialog>
    );
}

function RenameDialog({
    member,
    onClose,
    onSave,
    busy,
    error,
}: {
    member: MemberDto;
    onClose: () => void;
    onSave: (name: string) => void | Promise<void>;
    busy: boolean;
    error: string;
}) {
    const [name, setName] = useState(member.name);
    return (
        <Dialog title={`${member.name} umbenennen`} onClose={onClose}>
            <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    void onSave(name);
                }}
            >
                <TextField label="Name" value={name} onChange={setName} maxLength={40} />
                <ErrorNote>{error}</ErrorNote>
                <Button
                    type="submit"
                    disabled={busy || name.trim() === '' || name.trim() === member.name}
                >
                    Speichern
                </Button>
            </form>
        </Dialog>
    );
}
