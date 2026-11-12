// Screen 4: the state of the group (wireframe gruppenuebersicht.html).

import { useEffect, useState } from 'react';
import type { ReceiptSummaryDto } from '../../shared/api-types';
import { api, errorMessage } from '../api';
import { balanceText, formatEuro } from '../format';
import { useGroup } from '../group';
import { receiptMeta } from '../parts';
import { navigate } from '../router';
import { invitationLink, shareInvitation } from '../share';
import {
  Button,
  Card,
  Dialog,
  ErrorNote,
  IconButton,
  MenuIcon,
  Screen,
  SectionTitle,
  useToast,
} from '../ui';

/** How many receipts the overview shows; the rest is one tap away. */
const LATEST = 3;

export function Overview() {
  const group = useGroup();
  const [toast, showToast] = useToast();
  const [showLink, setShowLink] = useState(false);
  const [receipts, setReceipts] = useState<ReceiptSummaryDto[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api
      .listReceipts(group.token)
      .then((list) => {
        if (!cancelled) setReceipts(list.receipts.filter((receipt) => !receipt.deletedAt));
      })
      .catch((failure) => {
        if (!cancelled) setError(errorMessage(failure));
      });
    return () => {
      cancelled = true;
    };
  }, [group.token]);

  const share = async () => {
    const result = await shareInvitation(group.token, group.name);
    if (result === 'copied') showToast('Link kopiert');
    if (result === 'unavailable') setShowLink(true);
  };

  // People who are even and no longer in the group need no line.
  const rows = group.members.filter(
    (member) => member.active || (group.balances.get(member.id) ?? 0) !== 0,
  );

  return (
    <Screen
      title={group.name}
      footer={
        <div className="flex gap-2.5">
          <Button tall className="flex-[2]" onClick={() => navigate(`/g/${group.token}/scan`)}>
            Zettel scannen
          </Button>
          <Button
            variant="secondary"
            tall
            className="flex-1 text-base"
            onClick={() => navigate(`/g/${group.token}/manuell`)}
          >
            Manuell
          </Button>
        </div>
      }
      actions={
        <>
          <Button variant="text" className="px-3" onClick={() => void share()}>
            Link teilen
          </Button>
          <IconButton
            label="Gruppeneinstellungen"
            onClick={() => navigate(`/g/${group.token}/einstellungen`)}
          >
            <MenuIcon />
          </IconButton>
        </>
      }
    >
      <div className="flex flex-col gap-5 p-4">
        <section className="flex flex-col gap-2" aria-label="Salden">
          <div className="flex min-h-11 items-center">
            <div className="flex-1">
              <SectionTitle>Salden</SectionTitle>
            </div>
            <Button variant="text" onClick={() => navigate(`/g/${group.token}/begleichen`)}>
              Begleichen
            </Button>
          </div>
          <Card>
            {rows.map((member) => {
              const cents = group.balances.get(member.id) ?? 0;
              const isMe = member.id === group.me.id;
              return (
                <div key={member.id} className="flex gap-3 px-3.5 py-3">
                  <span className={`min-w-0 flex-1 truncate ${isMe ? 'font-semibold' : ''}`}>
                    {group.label(member.id)}
                    {!member.active && <span className="text-muted"> (entfernt)</span>}
                  </span>
                  <span className={cents > 0 ? 'font-semibold' : 'text-muted'}>
                    {balanceText(cents)}
                  </span>
                </div>
              );
            })}
          </Card>
        </section>

        <section className="flex flex-col gap-2" aria-label="Letzte Belege">
          <SectionTitle>Letzte Belege</SectionTitle>
          <ErrorNote>{error}</ErrorNote>
          {receipts && receipts.length === 0 && (
            <p className="m-0 rounded-lg border border-line px-3.5 py-4 text-sm text-muted">
              Noch keine Belege. Scanne einen Zettel oder trag einen Betrag von Hand ein.
            </p>
          )}
          {receipts && receipts.length > 0 && (
            <Card>
              {receipts.slice(0, LATEST).map((receipt) => (
                <button
                  key={receipt.id}
                  type="button"
                  onClick={() => navigate(`/g/${group.token}/beleg/${receipt.id}`)}
                  className="flex min-h-16 cursor-pointer items-center gap-3 border-0 bg-transparent px-3.5 py-2 text-left text-[15px] text-ink"
                >
                  {/* A dashed tile marks receipts with a photo, as in the wireframe. */}
                  <span
                    aria-hidden="true"
                    className={`box-border h-[42px] w-8 shrink-0 rounded-[3px] ${
                      receipt.hasImage ? 'border border-dashed border-field' : ''
                    }`}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium">{receipt.merchant}</span>
                    <span className="text-[13px] text-muted">{receiptMeta(group, receipt)}</span>
                  </span>
                  <span className="font-semibold">{formatEuro(receipt.totalCents)}</span>
                </button>
              ))}
            </Card>
          )}
          <Button variant="text" onClick={() => navigate(`/g/${group.token}/verlauf`)}>
            Alle Belege und Änderungsverlauf
          </Button>
        </section>
      </div>
      {toast}
      {showLink && (
        <Dialog title="Link teilen" onClose={() => setShowLink(false)}>
          <p className="m-0 text-sm text-muted">
            Wer diesen Link hat, darf in der Gruppe alles. Gib ihn nur an Mitglieder weiter.
          </p>
          <p className="m-0 select-all break-all rounded-lg border border-line bg-panel p-3 text-sm">
            {invitationLink(group.token)}
          </p>
        </Dialog>
      )}
    </Screen>
  );
}
