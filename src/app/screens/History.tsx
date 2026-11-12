// "Alle Belege und Änderungsverlauf": every receipt of the group including the
// deleted ones (which can be restored here), and the log of who changed what.

import { useCallback, useEffect, useState } from 'react';
import type { ChangeDto, PaymentDto, ReceiptSummaryDto } from '../../shared/api-types';
import { api, errorMessage } from '../api';
import { formatDate, formatDateTime, formatEuro } from '../format';
import { useGroup } from '../group';
import { receiptMeta } from '../parts';
import { Link } from '../router';
import { Button, Card, Dialog, ErrorNote, Loading, Screen, SectionTitle } from '../ui';

export function History() {
    const group = useGroup();
    const [receipts, setReceipts] = useState<ReceiptSummaryDto[] | null>(null);
    const [changes, setChanges] = useState<ChangeDto[]>([]);
    const [payments, setPayments] = useState<PaymentDto[]>([]);
    const [deleting, setDeleting] = useState<PaymentDto | null>(null);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const [receiptList, history] = await Promise.all([
                api.listReceipts(group.token),
                api.getHistory(group.token),
            ]);
            setReceipts(receiptList.receipts);
            setChanges(history.changes);
            setPayments(history.payments);
        } catch (failure) {
            setError(errorMessage(failure));
        }
    }, [group.token]);

    useEffect(() => {
        void load();
    }, [load]);

    const restore = async (receiptId: number) => {
        setBusy(true);
        setError('');
        try {
            await api.restoreReceipt(group.token, receiptId);
            await Promise.all([load(), group.reload()]);
        } catch (failure) {
            setError(errorMessage(failure));
        } finally {
            setBusy(false);
        }
    };

    const deletePayment = async (payment: PaymentDto) => {
        setBusy(true);
        setError('');
        try {
            await api.deletePayment(group.token, payment.id);
            await Promise.all([load(), group.reload()]);
        } catch (failure) {
            setError(errorMessage(failure));
        } finally {
            setBusy(false);
            setDeleting(null);
        }
    };

    const merchantOf = new Map(receipts?.map((receipt) => [receipt.id, receipt.merchant]));
    const paymentText = (payment: PaymentDto) =>
        `${group.label(payment.from)} an ${group.label(payment.to)}`;

    return (
        <Screen title="Belege und Verlauf" back={`/g/${group.token}`}>
            <div className="flex flex-col gap-5 p-4">
                <ErrorNote>{error}</ErrorNote>
                {!receipts && !error && <Loading />}

                {receipts && (
                    <section className="flex flex-col gap-2" aria-label="Alle Belege">
                        <SectionTitle>Alle Belege</SectionTitle>
                        {receipts.length === 0 ? (
                            <p className="m-0 text-sm text-muted">Noch keine Belege.</p>
                        ) : (
                            <Card>
                                {receipts.map((receipt) => (
                                    <div
                                        key={receipt.id}
                                        className="flex items-center gap-2 px-3.5 py-2"
                                    >
                                        <Link
                                            to={`/g/${group.token}/beleg/${receipt.id}`}
                                            className="flex min-h-12 min-w-0 flex-1 items-center gap-3 text-ink no-underline"
                                        >
                                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                                <span
                                                    className={`truncate font-medium ${receipt.deletedAt ? 'line-through' : ''}`}
                                                >
                                                    {receipt.merchant}
                                                </span>
                                                <span className="text-[13px] text-muted">
                                                    {receipt.deletedAt ? 'gelöscht · ' : ''}
                                                    {receiptMeta(group, receipt)}
                                                </span>
                                            </span>
                                            <span
                                                className={`font-semibold ${receipt.deletedAt ? 'text-muted' : ''}`}
                                            >
                                                {formatEuro(receipt.totalCents)}
                                            </span>
                                        </Link>
                                        {receipt.deletedAt && (
                                            <Button
                                                variant="text"
                                                disabled={busy}
                                                aria-label={`${receipt.merchant} wiederherstellen`}
                                                onClick={() => void restore(receipt.id)}
                                            >
                                                Wiederherstellen
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </Card>
                        )}
                    </section>
                )}

                {receipts && payments.length > 0 && (
                    <section className="flex flex-col gap-2" aria-label="Zahlungen">
                        <SectionTitle>Zahlungen</SectionTitle>
                        <Card>
                            {payments.map((payment) => (
                                <div
                                    key={payment.id}
                                    className="flex min-h-14 items-center gap-2 px-3.5 py-2"
                                >
                                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                        <span
                                            className={`truncate font-medium ${payment.deletedAt ? 'line-through' : ''}`}
                                        >
                                            {paymentText(payment)}
                                        </span>
                                        <span className="text-[13px] text-muted">
                                            {payment.deletedAt ? 'gelöscht · ' : ''}
                                            {formatDate(payment.date)}
                                        </span>
                                    </span>
                                    <span
                                        className={`font-semibold ${payment.deletedAt ? 'text-muted' : ''}`}
                                    >
                                        {formatEuro(payment.amountCents)}
                                    </span>
                                    {!payment.deletedAt && (
                                        <Button
                                            variant="text"
                                            disabled={busy}
                                            aria-label={`Zahlung ${paymentText(payment)} löschen`}
                                            onClick={() => setDeleting(payment)}
                                        >
                                            Löschen
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </Card>
                    </section>
                )}

                {receipts && (
                    <section className="flex flex-col gap-2" aria-label="Änderungsverlauf">
                        <SectionTitle>Änderungsverlauf</SectionTitle>
                        <ol className="m-0 flex list-none flex-col gap-2 p-0">
                            {changes.map((change) => {
                                const merchant =
                                    change.entity === 'receipt'
                                        ? merchantOf.get(change.entityId)
                                        : undefined;
                                return (
                                    <li key={change.id} className="text-[13px] text-ink">
                                        {formatDateTime(change.at)} ·{' '}
                                        {change.memberId ? group.label(change.memberId) : 'Jemand'}{' '}
                                        {change.summary}
                                        {merchant && (
                                            <>
                                                {' ('}
                                                <Link
                                                    to={`/g/${group.token}/beleg/${change.entityId}`}
                                                    className="font-semibold text-accent"
                                                >
                                                    {merchant}
                                                </Link>
                                                {')'}
                                            </>
                                        )}
                                    </li>
                                );
                            })}
                        </ol>
                    </section>
                )}
            </div>

            {deleting && (
                <Dialog title="Zahlung löschen?" onClose={() => setDeleting(null)}>
                    <p className="m-0 text-sm text-muted">
                        {paymentText(deleting)}, {formatEuro(deleting.amountCents)} vom{' '}
                        {formatDate(deleting.date)}. Die Salden rechnen danach wieder ohne diese
                        Zahlung.
                    </p>
                    <Button disabled={busy} onClick={() => void deletePayment(deleting)}>
                        Löschen
                    </Button>
                    <Button variant="secondary" onClick={() => setDeleting(null)}>
                        Abbrechen
                    </Button>
                </Dialog>
            )}
        </Screen>
    );
}
