"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { loadMoreSaleEmailHistoryAction } from "@/app/dashboard/sales/[saleId]/email-actions";
import { formatDate } from "@/lib/format/date";
import { EmailStatusBadge } from "@/src/modules/email/presentation/components/email-status-badge";
import type { EmailListItemDto } from "@/src/modules/email/application/dto/email.dto";

type EmailHistoryTableProps = {
    emails: EmailListItemDto[];
    emptyText?: string;
    saleId?: string;
    hasMore?: boolean;
};

type EmailHistoryDisplayItem = EmailListItemDto & {
    recipientsLabel: string;
    dateLabel: string;
};

function formatRecipients(recipients: EmailListItemDto["toRecipients"]): string {
    return recipients
        .map((recipient) => recipient.name || recipient.email)
        .join(", ");
}

export function EmailHistoryTable({
    emails,
    emptyText = "Es wurden noch keine E-Mails gefunden.",
    saleId,
    hasMore = false,
}: EmailHistoryTableProps) {
    const [visibleEmails, setVisibleEmails] = useState(emails);
    const [visibleHasMore, setVisibleHasMore] = useState(hasMore);
    const [isPending, startTransition] = useTransition();

    const displayEmails: EmailHistoryDisplayItem[] = visibleEmails.map((email) => ({
        ...email,
        recipientsLabel: formatRecipients(email.toRecipients),
        dateLabel: formatDate(email.sentAt ?? email.createdAt),
    }));

    if (visibleEmails.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500">
                {emptyText}
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                        <tr>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Referenz</th>
                            <th className="px-4 py-3">Datum</th>
                            <th className="px-4 py-3">Empfänger</th>
                            <th className="px-4 py-3">Betreff</th>
                            <th className="px-4 py-3 text-right">Anhänge</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {displayEmails.map((email) => (
                            <tr key={email.id} className="hover:bg-cyan-50/50">
                                <td className="px-4 py-3">
                                    <EmailStatusBadge status={email.status} />
                                </td>
                                <td className="px-4 py-3 font-bold text-cyan-800">
                                    <Link href={`/dashboard/emails/${email.id}`}>
                                        {email.emailReference}
                                    </Link>
                                </td>
                                <td className="px-4 py-3 font-semibold text-slate-600">
                                    {email.dateLabel}
                                </td>
                                <td className="px-4 py-3 text-slate-700">
                                    {email.recipientsLabel}
                                </td>
                                <td className="px-4 py-3 text-slate-700">{email.subject}</td>
                                <td className="px-4 py-3 text-right font-bold text-slate-700">
                                    {email.attachmentCount}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {saleId && visibleHasMore ? (
                <div className="flex justify-center border-t border-slate-100 px-4 py-3">
                    <button
                        type="button"
                        aria-label="Weitere E-Mails anzeigen"
                        disabled={isPending}
                        onClick={() => {
                            startTransition(async () => {
                                const result = await loadMoreSaleEmailHistoryAction(
                                    saleId,
                                    visibleEmails.length,
                                );

                                setVisibleEmails((currentEmails) => [
                                    ...currentEmails,
                                    ...result.emails,
                                ]);
                                setVisibleHasMore(result.hasMore);
                            });
                        }}
                        className="inline-flex size-9 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-black leading-none text-slate-700 shadow-sm transition hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-800 disabled:cursor-wait disabled:opacity-60"
                    >
                        {isPending ? <Loader2 className="size-4 animate-spin" /> : "…"}
                    </button>
                </div>
            ) : null}
        </div>
    );
}
