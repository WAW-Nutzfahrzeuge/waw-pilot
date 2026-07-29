import { notFound } from "next/navigation";
import { ArrowLeft, Paperclip } from "lucide-react";
import Link from "next/link";

import { getCurrentCompanyId } from "@/lib/company";
import { formatDate } from "@/lib/format/date";
import { formatFileSize } from "@/lib/documents/document-helpers";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { EmailStatusBadge } from "@/src/modules/email/presentation/components/email-status-badge";
import { createEmailRepository } from "@/src/modules/email/infrastructure/factories/email-use-case.factory";

type EmailDetailPageProps = {
    params: Promise<{ emailId: string }>;
};

function formatRecipients(recipients: Array<{ email: string; name: string | null }>): string {
    return recipients
        .map((recipient) => recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email)
        .join(", ");
}

export default async function EmailDetailPage({ params }: EmailDetailPageProps) {
    const { emailId } = await params;
    const repository = await createEmailRepository();
    const email = await repository.findDetail({
        companyId: getCurrentCompanyId(),
        emailId,
    });

    if (!email) {
        notFound();
    }

    return (
        <div className="space-y-6">
            <Button asChild variant="ghost" className="w-fit">
                <Link href="/dashboard/emails">
                    <ArrowLeft className="mr-2 size-4" />
                    Zur E-Mail-Historie
                </Link>
            </Button>

            <PageHeader
                title={email.emailReference}
                description={email.subject}
            />

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-center gap-3">
                    <EmailStatusBadge status={email.status} />
                    <span className="text-sm font-semibold text-slate-500">
                        {email.sentAt ? `Gesendet am ${formatDate(email.sentAt)}` : `Erstellt am ${formatDate(email.createdAt)}`}
                    </span>
                </div>
                <dl className="mt-5 grid gap-4 md:grid-cols-2">
                    <div>
                        <dt className="text-xs font-bold uppercase text-slate-500">Absender</dt>
                        <dd className="mt-1 font-semibold text-slate-900">
                            {email.senderName} &lt;{email.senderEmail}&gt;
                        </dd>
                    </div>
                    <div>
                        <dt className="text-xs font-bold uppercase text-slate-500">Empfänger</dt>
                        <dd className="mt-1 font-semibold text-slate-900">
                            {formatRecipients(email.toRecipients)}
                        </dd>
                    </div>
                    {email.ccRecipients.length > 0 ? (
                        <div>
                            <dt className="text-xs font-bold uppercase text-slate-500">CC</dt>
                            <dd className="mt-1 font-semibold text-slate-900">
                                {formatRecipients(email.ccRecipients)}
                            </dd>
                        </div>
                    ) : null}
                    <div>
                        <dt className="text-xs font-bold uppercase text-slate-500">Kontext</dt>
                        <dd className="mt-1 font-semibold text-slate-900">
                            {email.contextType}
                        </dd>
                    </div>
                </dl>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-base font-extrabold text-slate-950">Nachricht</h2>
                <div
                    className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-800"
                    dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
                />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2">
                    <Paperclip className="size-4 text-cyan-700" />
                    <h2 className="text-base font-extrabold text-slate-950">Anhänge</h2>
                </div>
                <div className="mt-4 space-y-2">
                    {email.attachments.length === 0 ? (
                        <p className="text-sm font-semibold text-slate-500">
                            Diese E-Mail hatte keine Anhänge.
                        </p>
                    ) : (
                        email.attachments.map((attachment) => (
                            <div
                                key={attachment.id}
                                className="flex flex-col gap-1 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                            >
                                <span className="font-semibold text-slate-900">
                                    {attachment.fileName}
                                </span>
                                <span className="text-xs font-bold text-slate-500">
                                    {attachment.mimeType} · {formatFileSize(attachment.fileSizeBytes)}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </section>
        </div>
    );
}
