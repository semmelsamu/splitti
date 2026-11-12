// Screen 6, the heart of the app: assign the positions of a receipt to people
// (wireframe beleg-aufteilen.html). Used for a fresh scan, for a manual
// receipt with positions, and for changing a saved receipt.

import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api';
import {
  clearDraft,
  type DraftItem,
  draftFromReceipt,
  draftStatus,
  kindFor,
  loadDraft,
  newKey,
  type ReceiptDraft,
  storeDraft,
  toReceiptInput,
} from '../draft';
import { formatCents, formatDate, formatEuro, parseAmount } from '../format';
import { useGroup } from '../group';
import { MemberChips, PayerDialog, ReceiptImageButton, selectableMembers } from '../parts';
import { navigate } from '../router';
import {
  Button,
  Chip,
  Dialog,
  ErrorNote,
  IconButton,
  INPUT_STYLE,
  Loading,
  PencilIcon,
  Screen,
  TextField,
} from '../ui';

interface Props {
  /** Id of the saved receipt to change; without it the new receipt in progress is shown. */
  receiptId?: number;
}

export function SplitReceipt({ receiptId }: Props) {
  const group = useGroup();
  const editing = receiptId !== undefined;
  const [draft, setDraftState] = useState<ReceiptDraft | null>(() =>
    editing ? null : loadDraft(group.token),
  );
  const [original, setOriginal] = useState('');
  const [loadError, setLoadError] = useState('');

  // Changing a saved receipt starts from what the server has.
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    api
      .getReceipt(group.token, receiptId)
      .then((receipt) => {
        if (cancelled) return;
        const loaded = draftFromReceipt(receipt);
        setDraftState(loaded);
        setOriginal(JSON.stringify(toReceiptInput(loaded)));
      })
      .catch((failure) => {
        if (!cancelled) setLoadError(errorMessage(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [editing, receiptId, group.token]);

  // Without a receipt in progress there is nothing to split.
  useEffect(() => {
    if (!editing && !draft) navigate(`/g/${group.token}`, { replace: true });
  }, [editing, draft, group.token]);

  const backPath = editing ? `/g/${group.token}/beleg/${receiptId}` : `/g/${group.token}`;

  if (loadError) {
    return (
      <Screen title="Beleg aufteilen" back={backPath}>
        <div className="p-4">
          <ErrorNote>{loadError}</ErrorNote>
        </div>
      </Screen>
    );
  }
  if (!draft) {
    return (
      <Screen title="Beleg aufteilen" back={backPath}>
        <Loading />
      </Screen>
    );
  }

  const setDraft = (next: ReceiptDraft) => {
    setDraftState(next);
    if (!editing) storeDraft(group.token, next);
  };

  return (
    <Editor
      draft={draft}
      setDraft={setDraft}
      backPath={backPath}
      changed={editing ? JSON.stringify(toReceiptInput(draft)) !== original : true}
    />
  );
}

interface EditorProps {
  draft: ReceiptDraft;
  setDraft: (draft: ReceiptDraft) => void;
  backPath: string;
  /** Whether leaving would lose something. */
  changed: boolean;
}

function Editor({ draft, setDraft, backPath, changed }: EditorProps) {
  const group = useGroup();
  const editing = draft.receiptId !== null;
  const status = draftStatus(draft);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingItem, setEditingItem] = useState<DraftItem | 'new' | null>(null);
  const [choosingPayer, setChoosingPayer] = useState(false);
  const [editingHead, setEditingHead] = useState(false);
  const [leaving, setLeaving] = useState(false);
  /** Keys of the marked positions while several are assigned at once; null = mode off. */
  const [marked, setMarked] = useState<Set<string> | null>(null);

  const allSelected = useMemo(
    () => draft.items.flatMap((item) => item.memberIds).concat(draft.paidBy),
    [draft.items, draft.paidBy],
  );
  const members = selectableMembers(group, allSelected);

  const updateItem = (key: string, change: Partial<DraftItem>) => {
    setDraft({
      ...draft,
      items: draft.items.map((item) => (item.key === key ? { ...item, ...change } : item)),
    });
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const input = toReceiptInput(draft);
      if (draft.receiptId === null) {
        await api.createReceipt(group.token, input);
        clearDraft(group.token);
      } else {
        await api.updateReceipt(group.token, draft.receiptId, input);
      }
      await group.reload();
      navigate(backPath, { replace: true });
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  const leave = () => {
    if (!editing) clearDraft(group.token);
    navigate(backPath, { replace: true });
  };

  const imageSrc =
    draft.receiptId !== null && draft.source === 'scan'
      ? api.receiptImageUrl(group.token, draft.receiptId)
      : draft.imageId
        ? api.draftImageUrl(group.token, draft.imageId)
        : null;

  const countText =
    draft.recognized !== null
      ? draft.recognized === 0
        ? 'Nichts erkannt – trag die Positionen von Hand ein'
        : `${draft.recognized} ${draft.recognized === 1 ? 'Position' : 'Positionen'} erkannt`
      : `${draft.items.length} ${draft.items.length === 1 ? 'Position' : 'Positionen'}`;

  // --- several positions at once ---------------------------------------------
  const markedItems = marked ? draft.items.filter((item) => marked.has(item.key)) : [];
  const toggleMarked = (key: string) => {
    if (!marked) return;
    const next = new Set(marked);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setMarked(next);
  };
  /** A member is "on" for the marked positions if all of them have it. */
  const onForAllMarked = (memberId: number) =>
    markedItems.length > 0 && markedItems.every((item) => item.memberIds.includes(memberId));
  const assignToMarked = (memberIds: number[], add: boolean) => {
    if (!marked) return;
    setDraft({
      ...draft,
      items: draft.items.map((item) => {
        if (!marked.has(item.key)) return item;
        const kept = item.memberIds.filter((id) => !memberIds.includes(id));
        return { ...item, memberIds: add ? [...kept, ...memberIds] : kept };
      }),
    });
  };

  return (
    <Screen
      title="Beleg aufteilen"
      back={backPath}
      onBack={() => (changed ? setLeaving(true) : leave())}
      actions={
        draft.items.length > 1 && (
          <Button
            variant="text"
            className="px-3"
            aria-pressed={marked !== null}
            onClick={() => setMarked(marked ? null : new Set())}
          >
            {marked ? 'Fertig' : 'Mehrere'}
          </Button>
        )
      }
      banner={
        <div className="flex shrink-0 items-center gap-3 border-b border-line bg-panel px-4 py-3">
          {imageSrc && <ReceiptImageButton src={imageSrc} />}
          <button
            type="button"
            onClick={() => setEditingHead(true)}
            aria-label={`Bezeichnung und Datum ändern: ${draft.merchant}, ${formatDate(draft.date)}`}
            className="flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col justify-center gap-1 border-0 bg-transparent p-0 text-left text-ink"
          >
            <span className="truncate font-semibold">
              {draft.merchant || 'Ohne Bezeichnung'} · {formatDate(draft.date)}
            </span>
            <span className="text-[13px] text-muted">{countText}</span>
          </button>
          <button
            type="button"
            onClick={() => setChoosingPayer(true)}
            className="min-h-11 shrink-0 cursor-pointer rounded-lg border border-field bg-white px-3 text-left text-[13px] text-ink"
          >
            Bezahlt von
            <br />
            <strong>{group.label(draft.paidBy)}</strong>
          </button>
        </div>
      }
      footer={
        <>
          {marked && (
            <fieldset className="m-0 flex flex-col gap-2 rounded-lg border border-line bg-white p-2.5">
              <legend className="sr-only">Markierte Positionen zuordnen</legend>
              <div className="flex items-center text-[13px]">
                <span className="flex-1 font-semibold">
                  {markedItems.length === 0
                    ? 'Positionen antippen, um sie zu markieren'
                    : `${markedItems.length} markiert – zuordnen zu:`}
                </span>
                <Button
                  variant="text"
                  className="px-2 text-[13px]"
                  onClick={() =>
                    setMarked(
                      markedItems.length === draft.items.length
                        ? new Set()
                        : new Set(draft.items.map((item) => item.key)),
                    )
                  }
                >
                  {markedItems.length === draft.items.length ? 'Keine markieren' : 'Alle markieren'}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {members.map((member) => (
                  <Chip
                    key={member.id}
                    pressed={onForAllMarked(member.id)}
                    disabled={markedItems.length === 0}
                    onClick={() => assignToMarked([member.id], !onForAllMarked(member.id))}
                  >
                    {group.label(member.id)}
                  </Chip>
                ))}
                <div className="flex-1" />
                <Button
                  variant="text"
                  className="px-2.5 text-[13px]"
                  disabled={markedItems.length === 0}
                  onClick={() =>
                    assignToMarked(
                      members.map((member) => member.id),
                      true,
                    )
                  }
                >
                  alle
                </Button>
              </div>
            </fieldset>
          )}
          <div className="flex justify-between gap-3 text-[13px] text-muted">
            <span>Summe Positionen {formatEuro(status.itemsSumCents)}</span>
            {draft.detectedTotalCents !== null && (
              <span
                className={status.deviationCents === 0 ? '' : 'font-semibold text-warn'}
                data-testid="total-check"
              >
                Zettelsumme {formatEuro(draft.detectedTotalCents)} ·{' '}
                {status.deviationCents === 0
                  ? 'stimmt'
                  : `weicht um ${formatEuro(Math.abs(status.deviationCents ?? 0))} ab`}
              </span>
            )}
          </div>
          {status.unpriced > 0 && (
            <div className="text-[13px] font-semibold text-warn">
              {status.unpriced === 1
                ? '1 Position hat noch keinen Preis'
                : `${status.unpriced} Positionen haben noch keinen Preis`}
            </div>
          )}
          {status.unassigned > 0 && (
            <div className="text-[13px] font-semibold text-warn">
              {status.unassigned === 1
                ? '1 Position ist noch niemandem zugeordnet'
                : `${status.unassigned} Positionen sind noch niemandem zugeordnet`}
            </div>
          )}
          {draft.items.length === 0 && (
            <div className="text-[13px] font-semibold text-warn">
              Der Beleg hat noch keine Positionen
            </div>
          )}
          <ErrorNote>{error}</ErrorNote>
          <Button disabled={busy || !status.canSave} onClick={() => void save()}>
            Speichern
          </Button>
        </>
      }
    >
      <ul className="m-0 flex list-none flex-col px-4 py-0">
        {draft.items.map((item) => {
          const open = item.memberIds.length === 0;
          const isMarked = marked?.has(item.key) ?? false;
          return (
            <li
              key={item.key}
              aria-label={item.label}
              className="flex flex-col gap-1.5 border-b border-line-soft py-2.5"
            >
              <div className="flex items-center gap-2">
                {marked && (
                  <input
                    type="checkbox"
                    checked={isMarked}
                    onChange={() => toggleMarked(item.key)}
                    aria-label={`${item.label} markieren`}
                    className="h-6 w-6 shrink-0 accent-accent"
                  />
                )}
                <div className="min-w-0 flex-1 font-medium">
                  {item.label}{' '}
                  {item.amountCents === 0 ? (
                    <Badge>Preis fehlt</Badge>
                  ) : item.needsReview ? (
                    <Badge>bitte prüfen</Badge>
                  ) : null}{' '}
                  {open && <Badge>noch offen</Badge>}
                </div>
                <div className="font-semibold">{formatEuro(item.amountCents)}</div>
                <IconButton
                  label={`Position ${item.label} bearbeiten`}
                  className="text-muted"
                  onClick={() => setEditingItem(item)}
                >
                  <PencilIcon />
                </IconButton>
              </div>
              <MemberChips
                label={`Wer teilt sich ${item.label}?`}
                members={members}
                selected={item.memberIds}
                onChange={(memberIds) => updateItem(item.key, { memberIds })}
              />
            </li>
          );
        })}
      </ul>
      <div className="px-4 pt-2 pb-4">
        <Button
          variant="dashed"
          className="w-full text-center text-sm"
          onClick={() => setEditingItem('new')}
        >
          + Position hinzufügen
        </Button>
      </div>

      {editingItem && (
        <ItemDialog
          item={editingItem === 'new' ? null : editingItem}
          onClose={() => setEditingItem(null)}
          onSave={(label, amountCents) => {
            if (editingItem === 'new') {
              const item: DraftItem = {
                key: newKey(),
                label,
                amountCents,
                kind: kindFor(label, amountCents),
                memberIds: [],
                needsReview: false,
              };
              setDraft({ ...draft, items: [...draft.items, item] });
            } else {
              updateItem(editingItem.key, {
                label,
                amountCents,
                kind: kindFor(label, amountCents),
                // Whoever corrected the line has checked it.
                needsReview: false,
              });
            }
            setEditingItem(null);
          }}
          onDelete={() => {
            if (editingItem !== 'new') {
              setDraft({
                ...draft,
                items: draft.items.filter((item) => item.key !== editingItem.key),
              });
            }
            setEditingItem(null);
          }}
        />
      )}

      {choosingPayer && (
        <PayerDialog
          selected={draft.paidBy}
          onSelect={(paidBy) => setDraft({ ...draft, paidBy })}
          onClose={() => setChoosingPayer(false)}
        />
      )}

      {editingHead && (
        <HeadDialog
          merchant={draft.merchant}
          date={draft.date}
          onClose={() => setEditingHead(false)}
          onSave={(merchant, date) => {
            setDraft({ ...draft, merchant, date });
            setEditingHead(false);
          }}
        />
      )}

      {leaving && (
        <Dialog
          title={editing ? 'Änderungen verwerfen?' : 'Beleg verwerfen?'}
          onClose={() => setLeaving(false)}
        >
          <p className="m-0 text-sm text-muted">
            {editing
              ? 'Deine Änderungen an diesem Beleg gehen verloren.'
              : 'Der Beleg ist noch nicht gespeichert. Positionen und Zuordnungen gehen verloren.'}
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

function Badge({ children }: { children: string }) {
  return (
    <span className="whitespace-nowrap rounded bg-warn-bg px-1.5 py-0.5 text-xs font-semibold text-warn">
      {children}
    </span>
  );
}

/** Correct, add or delete a position: name and price can be overwritten. */
function ItemDialog({
  item,
  onSave,
  onDelete,
  onClose,
}: {
  item: DraftItem | null;
  onSave: (label: string, amountCents: number) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(item?.label ?? '');
  const [price, setPrice] = useState(
    item && item.amountCents !== 0 ? formatCents(item.amountCents) : '',
  );
  const [error, setError] = useState('');

  const submit = () => {
    const amountCents = parseAmount(price);
    if (label.trim() === '') {
      setError('Die Bezeichnung fehlt.');
    } else if (amountCents === null) {
      setError('Der Preis ist kein Betrag, zum Beispiel 2,49.');
    } else if (amountCents === 0) {
      setError('Der Preis darf nicht 0,00 sein.');
    } else {
      onSave(label.trim(), amountCents);
    }
  };

  return (
    <Dialog title={item ? 'Position bearbeiten' : 'Position hinzufügen'} onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <TextField label="Bezeichnung" value={label} onChange={setLabel} maxLength={80} />
        <TextField
          label="Preis in €"
          value={price}
          onChange={setPrice}
          inputMode="decimal"
          autoComplete="off"
          hint="Mit Minus für Abzüge, zum Beispiel -0,25 für zurückgegebenes Pfand."
        />
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit">Übernehmen</Button>
        {item && (
          <Button variant="secondary" onClick={onDelete}>
            Position löschen
          </Button>
        )}
      </form>
    </Dialog>
  );
}

/** Name of the shop (or what the receipt is for) and its date. */
function HeadDialog({
  merchant,
  date,
  onSave,
  onClose,
}: {
  merchant: string;
  date: string;
  onSave: (merchant: string, date: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(merchant);
  const [day, setDay] = useState(date);
  return (
    <Dialog title="Bezeichnung und Datum" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() !== '' && day !== '') onSave(name.trim(), day);
        }}
      >
        <TextField label="Laden oder Bezeichnung" value={name} onChange={setName} maxLength={60} />
        <DateField label="Datum" value={day} onChange={setDay} />
        <Button type="submit" disabled={name.trim() === '' || day === ''}>
          Übernehmen
        </Button>
      </form>
    </Dialog>
  );
}

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={INPUT_STYLE}
      />
    </label>
  );
}
