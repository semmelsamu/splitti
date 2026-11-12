// Screen 9: who owes whom how much, and entering payments (wireframe begleichen.html).

import { useCallback, useEffect, useState } from 'react';
import type { TransferDto } from '../../shared/api-types';
import { api, errorMessage } from '../api';
import { formatEuro, parseAmount, todayIso } from '../format';
import { useGroup } from '../group';
import { selectableMembers } from '../parts';
import {
  Button,
  Dialog,
  ErrorNote,
  INPUT_STYLE,
  Loading,
  Screen,
  TextField,
  useToast,
} from '../ui';
import { DateField } from './SplitReceipt';

export function Settle() {
  const group = useGroup();
  const [toast, showToast] = useToast();
  const [transfers, setTransfers] = useState<TransferDto[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [entering, setEntering] = useState(false);

  const load = useCallback(async () => {
    try {
      setTransfers((await api.getSettlement(group.token)).transfers);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }, [group.token]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Enters a payment and refreshes proposals and balances. */
  const pay = async (from: number, to: number, amountCents: number, date: string) => {
    setBusy(true);
    setError('');
    try {
      await api.createPayment(group.token, { from, to, amountCents, date });
      await Promise.all([load(), group.reload()]);
      showToast('Zahlung eingetragen');
      return true;
    } catch (failure) {
      setError(errorMessage(failure));
      return false;
    } finally {
      setBusy(false);
    }
  };

  let intro = '';
  if (transfers) {
    if (transfers.length === 0)
      intro = 'Alle Salden sind ausgeglichen. Es gibt nichts zu überweisen.';
    else if (transfers.length === 1)
      intro = 'Mit dieser Überweisung sind alle Salden ausgeglichen.';
    else intro = `Mit diesen ${transfers.length} Überweisungen sind alle Salden ausgeglichen.`;
  }

  return (
    <Screen
      title="Begleichen"
      back={`/g/${group.token}`}
      footer={
        <Button variant="secondary" tall className="text-base" onClick={() => setEntering(true)}>
          Andere Zahlung eintragen
        </Button>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <ErrorNote>{error}</ErrorNote>
        {!transfers && !error && <Loading />}
        {transfers && <p className="m-0 text-sm text-muted">{intro}</p>}

        {transfers?.map((transfer) => (
          <article
            key={`${transfer.from}-${transfer.to}`}
            className="flex flex-col gap-2.5 rounded-lg border border-line p-3.5"
          >
            <div className="flex items-baseline gap-3">
              <span className="min-w-0 flex-1">
                <strong>{group.label(transfer.from)}</strong> zahlt an{' '}
                <strong>{group.label(transfer.to)}</strong>
              </span>
              <span className="text-[17px] font-semibold">{formatEuro(transfer.amountCents)}</span>
            </div>
            <Button
              variant="secondary"
              className="min-h-11 text-sm"
              disabled={busy}
              onClick={() => void pay(transfer.from, transfer.to, transfer.amountCents, todayIso())}
            >
              Als bezahlt eintragen
            </Button>
          </article>
        ))}

        {transfers && (
          <p className="m-0 text-[13px] text-muted">
            Eine eingetragene Zahlung erscheint im Verlauf und lässt sich dort wieder löschen.
          </p>
        )}
      </div>

      {entering && (
        <PaymentDialog
          busy={busy}
          onClose={() => setEntering(false)}
          onSave={async (from, to, amountCents, date) => {
            if (await pay(from, to, amountCents, date)) setEntering(false);
          }}
        />
      )}
      {toast}
    </Screen>
  );
}

/** Any payment between two members, e.g. a part of what is owed. */
function PaymentDialog({
  busy,
  onSave,
  onClose,
}: {
  busy: boolean;
  onSave: (from: number, to: number, amountCents: number, date: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const group = useGroup();
  const members = selectableMembers(group, []);
  const [from, setFrom] = useState(group.me.id);
  const [to, setTo] = useState(members.find((member) => member.id !== group.me.id)?.id ?? 0);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState('');

  const submit = () => {
    const cents = parseAmount(amount);
    if (from === to) {
      setError('Wähle zwei verschiedene Personen.');
    } else if (cents === null || cents <= 0) {
      setError('Der Betrag ist kein Betrag über null, zum Beispiel 8,15.');
    } else if (date === '') {
      setError('Das Datum fehlt.');
    } else {
      setError('');
      void onSave(from, to, cents, date);
    }
  };

  const select = (label: string, value: number, onChange: (id: number) => void) => (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-muted">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={INPUT_STYLE}
      >
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {group.label(member.id)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Dialog title="Zahlung eintragen" onClose={onClose}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex gap-3">
          {select('Von', from, setFrom)}
          {select('An', to, setTo)}
        </div>
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
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" disabled={busy}>
          Zahlung eintragen
        </Button>
      </form>
    </Dialog>
  );
}
