// Screen 8: look at a receipt (wireframe beleg-detail.html): the photo, the
// positions with who shares them, what each person bears, and who changed what.

import { useCallback, useEffect, useState } from 'react';
import type { ReceiptDetailDto } from '../../shared/api-types';
import { api, errorMessage } from '../api';
import { formatDate, formatDateTime, formatEuro } from '../format';
import { useGroup } from '../group';
import { ReceiptImageButton, selectableMembers, sharersText } from '../parts';
import { navigate } from '../router';
import { Button, Dialog, ErrorNote, Loading, Screen, SectionTitle } from '../ui';

export function ReceiptDetail({ receiptId }: { receiptId: number }) {
  const group = useGroup();
  const [receipt, setReceipt] = useState<ReceiptDetailDto | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const load = useCallback(async () => {
    try {
      setReceipt(await api.getReceipt(group.token, receiptId));
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }, [group.token, receiptId]);

  useEffect(() => {
    void load();
  }, [load]);

  const overview = `/g/${group.token}`;

  if (!receipt) {
    return (
      <Screen title="Beleg" back={overview}>
        {error ? (
          <div className="p-4">
            <ErrorNote>{error}</ErrorNote>
          </div>
        ) : (
          <Loading />
        )}
      </Screen>
    );
  }

  const deleted = receipt.deletedAt !== null;

  const remove = async () => {
    setBusy(true);
    setError('');
    try {
      await api.deleteReceipt(group.token, receipt.id);
      await group.reload();
      navigate(overview, { replace: true });
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
      setConfirming(false);
    }
  };

  const restore = async () => {
    setBusy(true);
    setError('');
    try {
      setReceipt(await api.restoreReceipt(group.token, receipt.id));
      await group.reload();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const shareOrder = selectableMembers(
    group,
    receipt.shares.map((share) => share.memberId),
  ).filter((member) => receipt.shares.some((share) => share.memberId === member.id));

  return (
    <Screen
      title={receipt.merchant}
      back={overview}
      actions={
        !deleted && (
          <Button
            variant="text"
            className="px-3"
            onClick={() => navigate(`/g/${group.token}/beleg/${receipt.id}/bearbeiten`)}
          >
            Bearbeiten
          </Button>
        )
      }
      banner={
        <div className="flex shrink-0 items-center gap-3 border-b border-line bg-panel px-4 py-3">
          {receipt.hasImage && (
            <ReceiptImageButton src={api.receiptImageUrl(group.token, receipt.id)} />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="text-xl font-semibold" data-testid="receipt-total">
              {formatEuro(receipt.totalCents)}
            </div>
            <div className="text-[13px] text-muted">
              {formatDate(receipt.date)} · bezahlt von {group.label(receipt.paidBy)} ·{' '}
              {receipt.source === 'scan' ? 'Scan' : 'manuell'}
            </div>
          </div>
        </div>
      }
      footer={
        deleted ? (
          <Button disabled={busy} onClick={() => void restore()}>
            Beleg wiederherstellen
          </Button>
        ) : (
          <Button variant="secondary" disabled={busy} onClick={() => setConfirming(true)}>
            Beleg löschen
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4 px-4 py-3">
        {deleted && (
          <p
            className="m-0 rounded-lg bg-warn-bg px-3 py-2 text-sm font-semibold text-warn"
            role="status"
          >
            Dieser Beleg ist gelöscht und zählt nicht mehr. Du kannst ihn wiederherstellen.
          </p>
        )}
        <ErrorNote>{error}</ErrorNote>

        <ul
          className="m-0 flex list-none flex-col divide-y divide-line-soft p-0"
          aria-label="Positionen"
        >
          {receipt.items.map((item) => (
            <li key={item.id} className="flex gap-2 py-[7px]">
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="font-medium">{item.label}</span>
                <span className="text-[13px] text-muted">{sharersText(group, item.memberIds)}</span>
              </span>
              <span className="font-semibold">{formatEuro(item.amountCents)}</span>
            </li>
          ))}
        </ul>

        <section className="flex flex-col gap-1.5" aria-label="Anteile">
          <SectionTitle>Anteile</SectionTitle>
          <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg border border-line px-3.5 py-2.5 text-sm">
            {shareOrder.map((member) => {
              const cents =
                receipt.shares.find((share) => share.memberId === member.id)?.cents ?? 0;
              return (
                <div key={member.id} className="flex">
                  <dt className="min-w-0 flex-1 truncate">{group.label(member.id)}</dt>
                  <dd className="m-0 font-semibold">{formatEuro(cents)}</dd>
                </div>
              );
            })}
          </dl>
        </section>

        <section className="flex flex-col gap-1.5" aria-label="Verlauf">
          <SectionTitle>Verlauf</SectionTitle>
          <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
            {receipt.history.map((change) => (
              <li key={change.id} className="text-[13px] text-ink">
                {formatDateTime(change.at)} ·{' '}
                {change.memberId ? group.label(change.memberId) : 'Jemand'} {change.summary}
              </li>
            ))}
          </ol>
        </section>
      </div>

      {confirming && (
        <Dialog title="Beleg löschen?" onClose={() => setConfirming(false)}>
          <p className="m-0 text-sm text-muted">
            Der Beleg zählt dann nicht mehr für die Salden. Unter „Alle Belege und Änderungsverlauf“
            lässt er sich wiederherstellen.
          </p>
          <Button disabled={busy} onClick={() => void remove()}>
            Löschen
          </Button>
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Abbrechen
          </Button>
        </Dialog>
      )}
    </Screen>
  );
}
