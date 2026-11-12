// Screen 7: costs without a receipt (wireframe manueller-eintrag.html).
// Either one amount shared by some people, or a receipt whose positions are
// typed in on the split screen. The two are views of one entry: the switch at
// the top is on both, and what is filled in survives switching.

import { ChevronDownIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { ErrorNote } from '../../components/ErrorNote';
import { ManualViewSwitch } from '../../components/ManualViewSwitch';
import { MemberChips } from '../../components/MemberChips';
import { PayerDialog } from '../../components/PayerDialog';
import { Screen } from '../../components/Screen';
import { TextField } from '../../components/TextField';
import { splitReceipt } from '../../core/split';
import { api, errorMessage } from '../api';
import {
    clearManualEntry,
    DEFAULT_MERCHANT,
    emptyDraft,
    isNewManualDraft,
    loadDraft,
    loadManualForm,
    storeDraft,
    storeManualForm,
} from '../draft';
import { formatEuro, parseAmount, todayIso } from '../format';
import { useGroup } from '../group';
import { selectableMembers } from '../members';
import { navigate } from '../router';
import { DateField } from './SplitReceipt';

export function ManualEntry() {
    const group = useGroup();
    // What was filled in before switching to the positions and back, if anything.
    const [stored] = useState(() => loadManualForm(group.token));
    const known = (id: number) => group.members.some((member) => member.id === id);
    const [label, setLabel] = useState(stored?.label ?? '');
    const [amount, setAmount] = useState(stored?.amount ?? '');
    const [date, setDate] = useState(stored?.date ?? todayIso());
    const [paidBy, setPaidBy] = useState(
        stored && known(stored.paidBy) ? stored.paidBy : group.me.id,
    );
    const [memberIds, setMemberIds] = useState<number[]>(stored?.memberIds.filter(known) ?? []);
    const [choosingPayer, setChoosingPayer] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        storeManualForm(group.token, { label, amount, date, paidBy, memberIds });
    }, [group.token, label, amount, date, paidBy, memberIds]);

    const members = selectableMembers(group, [paidBy]);
    const cents = parseAmount(amount);
    const amountOk = cents !== null && cents > 0;
    const canSave = label.trim() !== '' && amountOk && date !== '' && memberIds.length > 0;

    // "4 Personen · je 10,00 €", or "je etwa" when it does not divide evenly.
    let perPerson = 'Wähle aus, wer sich den Betrag teilt.';
    if (memberIds.length > 0) {
        const people = memberIds.length === 1 ? '1 Person' : `${memberIds.length} Personen`;
        if (amountOk) {
            const shares = [...splitReceipt([{ amountCents: cents, memberIds }]).values()];
            const even = shares.every((share) => share === shares[0]);
            perPerson = `${people} · je ${even ? '' : 'etwa '}${formatEuro(Math.min(...shares))}`;
        } else {
            perPerson = people;
        }
    }

    const save = async () => {
        if (!canSave || cents === null) return;
        setBusy(true);
        setError('');
        try {
            // A manual entry is a receipt with a single position.
            await api.createReceipt(group.token, {
                paidBy,
                date,
                merchant: label.trim(),
                source: 'manual',
                detectedTotalCents: null,
                items: [{ label: label.trim(), amountCents: cents, kind: 'item', memberIds }],
            });
            clearManualEntry(group.token);
            await group.reload();
            navigate(`/g/${group.token}`, { replace: true });
        } catch (failure) {
            setError(errorMessage(failure));
            setBusy(false);
        }
    };

    /** The receipt with positions of this entry, if the other view has started one. */
    const positionsDraft = () => {
        const draft = loadDraft(group.token);
        return draft && isNewManualDraft(draft) ? draft : null;
    };

    /**
     * Switches to the receipt with positions on the split screen. Positions
     * entered there before are still there; name, date and payer go along.
     */
    const withPositions = () => {
        const merchant = label.trim() || DEFAULT_MERCHANT;
        const day = date || todayIso();
        const draft = positionsDraft() ?? emptyDraft(paidBy, merchant, day);
        storeDraft(group.token, { ...draft, paidBy, merchant, date: day });
        navigate(`/g/${group.token}/beleg/neu`, { replace: true });
    };

    const leave = () => {
        clearManualEntry(group.token);
        navigate(`/g/${group.token}`, { replace: true });
    };

    /** Positions typed in on the other view would be lost without a word. */
    const goBack = () => {
        if ((positionsDraft()?.items.length ?? 0) > 0) setLeaving(true);
        else leave();
    };

    return (
        <Screen
            title="Manueller Eintrag"
            back={`/g/${group.token}`}
            onBack={goBack}
            footer={
                <>
                    <div className="text-[13px] text-muted" data-testid="per-person">
                        {perPerson}
                    </div>
                    <Button disabled={busy || !canSave} onClick={() => void save()}>
                        Speichern
                    </Button>
                </>
            }
        >
            <form
                className="flex flex-col gap-4 p-4"
                onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                }}
            >
                <ManualViewSwitch view="amount" onSwitch={withPositions} />

                <TextField label="Bezeichnung" value={label} onChange={setLabel} maxLength={60} />
                <div className="flex gap-3">
                    <TextField
                        label="Betrag in €"
                        value={amount}
                        onChange={setAmount}
                        inputMode="decimal"
                        autoComplete="off"
                        className="flex-1"
                    />
                    <DateField label="Datum" value={date} onChange={setDate} />
                </div>
                {amount.trim() !== '' && !amountOk && (
                    <ErrorNote>Der Betrag ist kein Betrag über null, zum Beispiel 40,00.</ErrorNote>
                )}

                <div className="flex flex-col gap-1.5">
                    <div className="text-[13px] font-semibold text-muted">Bezahlt von</div>
                    <button
                        type="button"
                        onClick={() => setChoosingPayer(true)}
                        aria-label={`Bezahlt von ${group.label(paidBy)}, ändern`}
                        className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-field bg-white px-3 text-left text-base text-ink"
                    >
                        <span className="min-w-0 flex-1 truncate">{group.label(paidBy)}</span>
                        {/* Tells that a choice opens. */}
                        <ChevronDownIcon size={18} className="shrink-0 text-muted" />
                    </button>
                </div>

                <div className="flex flex-col gap-1.5">
                    <div className="text-[13px] font-semibold text-muted">Aufteilen auf</div>
                    <MemberChips
                        label="Aufteilen auf"
                        members={members}
                        selected={memberIds}
                        onChange={setMemberIds}
                    />
                </div>

                <p className="m-0 text-[13px] text-muted">
                    „Beleg mit Positionen“ öffnet einen leeren Beleg im Aufteilungs-Screen, in dem
                    du die Positionen selbst einträgst.
                </p>
                <ErrorNote>{error}</ErrorNote>
                {/* Lets the Enter key submit the form. */}
                <button type="submit" className="hidden" tabIndex={-1} aria-hidden="true" />
            </form>

            {choosingPayer && (
                <PayerDialog
                    selected={paidBy}
                    onSelect={setPaidBy}
                    onClose={() => setChoosingPayer(false)}
                />
            )}

            {leaving && (
                <Dialog title="Beleg verwerfen?" onClose={() => setLeaving(false)}>
                    <p className="m-0 text-sm text-muted">
                        Unter „Beleg mit Positionen“ sind Positionen eingetragen, die noch nicht
                        gespeichert sind. Sie gehen verloren.
                    </p>
                    <Button onClick={leave}>Verwerfen</Button>
                    <Button variant="secondary" onClick={() => setLeaving(false)}>
                        Weiter bearbeiten
                    </Button>
                </Dialog>
            )}
        </Screen>
    );
}
