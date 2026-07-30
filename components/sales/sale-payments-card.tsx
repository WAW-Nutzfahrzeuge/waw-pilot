import { Wallet } from "lucide-react";

import {
    AddPaymentDialog,
    EditPaymentDialog,
    VoidPaymentDialog,
} from "@/components/sales/sale-payment-dialogs";
import { StatusBadge } from "@/components/shared/status-badge";
import type { SaleDetailPayment } from "@/lib/sales/sale-detail-queries";
import { formatCurrency } from "@/lib/format/currency";
import { formatDate } from "@/lib/format/date";
import { getPaymentMethodLabel } from "@/lib/payments/payment-methods";
import {
    getPaymentStatusLabel,
    getPaymentStatusTone,
} from "@/lib/sales/sale-helpers";
import type { PaymentStatus } from "@/lib/sales/sale-queries";

type SalePaymentsCardProps = {
    saleId: string;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    paymentStatus: PaymentStatus;
    payments: SaleDetailPayment[];
};

export function SalePaymentsCard({
    saleId,
    totalAmount,
    paidAmount,
    remainingAmount,
    paymentStatus,
    payments,
}: SalePaymentsCardProps) {
    const activePayments = payments.filter((payment) => !payment.is_voided);
    const voidedPayments = payments.filter((payment) => payment.is_voided);

    return (
        <div id="payments" className="scroll-mt-24 rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                    <div className="flex items-center gap-2">
                        <Wallet className="size-5 text-cyan-700" />
                        <h3 className="text-lg font-extrabold text-slate-950">
                            Zahlungen
                        </h3>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                        Bar- und Bankzahlungen werden einzeln erfasst und revisionssicher protokolliert.
                    </p>
                </div>
                <AddPaymentDialog
                    saleId={saleId}
                    remainingAmount={remainingAmount}
                />
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-4">
                <PaymentSummaryBox label="Gesamtbetrag" value={formatCurrency(totalAmount)} />
                <PaymentSummaryBox label="Bezahlt" value={formatCurrency(paidAmount)} />
                <PaymentSummaryBox
                    label={remainingAmount < 0 ? "Überzahlung" : "Restbetrag"}
                    value={formatCurrency(Math.abs(remainingAmount))}
                    highlight={remainingAmount !== 0}
                />
                <div className="rounded-2xl border border-slate-200 bg-white p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                        Zahlungsstatus
                    </p>
                    <div className="mt-2">
                        <StatusBadge tone={getPaymentStatusTone(paymentStatus)}>
                            {getPaymentStatusLabel(paymentStatus)}
                        </StatusBadge>
                    </div>
                </div>
            </div>

            <div className="mt-5 space-y-3">
                {activePayments.length > 0 ? (
                    activePayments.map((payment) => (
                        <PaymentRow
                            key={payment.id}
                            saleId={saleId}
                            payment={payment}
                        />
                    ))
                ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500">
                        Noch keine Zahlung erfasst.
                    </div>
                )}
            </div>

            {voidedPayments.length > 0 ? (
                <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
                    <summary className="cursor-pointer text-sm font-extrabold text-slate-700">
                        Historie stornierter Zahlungen ({voidedPayments.length})
                    </summary>
                    <div className="mt-3 space-y-3">
                        {voidedPayments.map((payment) => (
                            <div
                                key={payment.id}
                                className="rounded-2xl border border-slate-100 bg-slate-50 p-3 text-sm"
                            >
                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                    <div>
                                        <p className="font-extrabold text-slate-700">
                                            {payment.payment_reference} · {formatCurrency(payment.amount)}
                                        </p>
                                        <p className="mt-1 font-semibold text-slate-500">
                                            {formatDate(payment.payment_date)} · {getPaymentMethodLabel(payment.payment_method)}
                                        </p>
                                    </div>
                                    <StatusBadge tone="neutral">Storniert</StatusBadge>
                                </div>
                                {payment.void_reason ? (
                                    <p className="mt-2 font-semibold text-slate-500">
                                        Grund: {payment.void_reason}
                                    </p>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </details>
            ) : null}
        </div>
    );
}

function PaymentRow({
    saleId,
    payment,
}: {
    saleId: string;
    payment: SaleDetailPayment;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <p className="font-extrabold text-slate-950">
                        {payment.payment_reference} · {formatCurrency(payment.amount)}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                        {formatDate(payment.payment_date)} · {getPaymentMethodLabel(payment.payment_method)}
                    </p>
                    {payment.note ? (
                        <p className="mt-1 text-sm font-medium text-slate-600">
                            {payment.note}
                        </p>
                    ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                    <EditPaymentDialog saleId={saleId} payment={payment} />
                    <VoidPaymentDialog saleId={saleId} payment={payment} />
                </div>
            </div>
        </div>
    );
}

function PaymentSummaryBox({
    label,
    value,
    highlight = false,
}: {
    label: string;
    value: string;
    highlight?: boolean;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {label}
            </p>
            <p
                className={
                    highlight
                        ? "mt-1 text-lg font-extrabold text-cyan-700"
                        : "mt-1 text-lg font-extrabold text-slate-950"
                }
            >
                {value}
            </p>
        </div>
    );
}
