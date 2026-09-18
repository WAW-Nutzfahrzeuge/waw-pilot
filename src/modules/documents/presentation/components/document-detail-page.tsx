import Link from "next/link";
import { Download, ExternalLink, FileText } from "lucide-react";

import type { DocumentDetailDto } from "@/src/modules/documents/application/dto/document.dto";
import { createDocumentDetailViewModel } from "@/src/modules/documents/presentation/view-models/document-detail.view-model";
import { formatFileSize } from "@/lib/documents/document-helpers";
import { formatDate } from "@/lib/format/date";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function DocumentDetailPage({ document }: { document: DocumentDetailDto }) {
    const viewModel = createDocumentDetailViewModel(document);

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Dokumentencenter"
                title={viewModel.title}
                description={`${viewModel.reference} · ${viewModel.typeLabel}`}
                action={
                    <div className="flex flex-wrap gap-2">
                        <Button asChild variant="outline" className="rounded-2xl font-bold whitespace-nowrap">
                            <Link href={viewModel.openHref} target="_blank">
                                <ExternalLink className="mr-2 size-4" />
                                Öffnen
                            </Link>
                        </Button>
                        <Button asChild className="rounded-2xl bg-cyan-700 font-bold text-white hover:bg-cyan-800 whitespace-nowrap">
                            <Link href={viewModel.downloadHref}>
                                <Download className="mr-2 size-4" />
                                Herunterladen
                            </Link>
                        </Button>
                    </div>
                }
            />

            <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
                <Card className="rounded-[1.75rem] border-slate-200 bg-white shadow-sm">
                    <CardContent className="space-y-5 p-6">
                        <div className="flex items-start gap-4">
                            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700">
                                <FileText className="size-6" />
                            </div>
                            <div className="min-w-0">
                                <h2 className="text-lg font-extrabold text-slate-950">Dokumentdaten</h2>
                                <p className="mt-1 text-sm font-semibold text-slate-500">
                                    {viewModel.fileName}
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                            <InfoItem label="Status" value={viewModel.status} />
                            <InfoItem label="Archiv" value={viewModel.archiveStatus} />
                            <InfoItem label="MIME-Type" value={viewModel.mimeType} />
                            <InfoItem label="Dateigröße" value={formatFileSize(viewModel.fileSizeBytes)} />
                            <InfoItem label="Erstellt am" value={formatDate(viewModel.createdAt)} />
                            <InfoItem label="Aktualisiert am" value={formatDate(viewModel.updatedAt)} />
                        </div>

                        {viewModel.description ? (
                            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                                    Beschreibung
                                </p>
                                <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                                    {viewModel.description}
                                </p>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>

                <Card className="rounded-[1.75rem] border-slate-200 bg-white shadow-sm">
                    <CardContent className="space-y-4 p-6">
                        <h2 className="text-lg font-extrabold text-slate-950">Verknüpfungen</h2>
                        {viewModel.relations.length > 0 ? (
                            <div className="space-y-2">
                                {viewModel.relations.map((relation) =>
                                    relation.href ? (
                                        <Link
                                            key={`${relation.label}-${relation.href}`}
                                            href={relation.href}
                                            className="block rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-cyan-700 transition hover:border-cyan-200 hover:bg-cyan-50"
                                        >
                                            {relation.label}
                                        </Link>
                                    ) : (
                                        <div
                                            key={relation.label}
                                            className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600"
                                        >
                                            {relation.label}
                                        </div>
                                    ),
                                )}
                            </div>
                        ) : (
                            <p className="text-sm font-semibold text-slate-500">
                                Dieses Dokument hat noch keine zentrale Verknüpfung.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card className="rounded-[1.75rem] border-slate-200 bg-white shadow-sm">
                <CardContent className="p-0">
                    <div className="border-b border-slate-100 p-6">
                        <h2 className="text-lg font-extrabold text-slate-950">Versionen</h2>
                    </div>
                    <div className="divide-y divide-slate-100">
                        {viewModel.versions.map((version) => (
                            <div
                                key={version.id}
                                className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"
                            >
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-extrabold text-slate-950">{version.label}</p>
                                        {version.isActive ? (
                                            <StatusBadge tone="success">Aktiv</StatusBadge>
                                        ) : null}
                                    </div>
                                    <p className="mt-1 text-sm font-semibold text-slate-500">
                                        {version.fileName} · hochgeladen am {formatDate(version.uploadedAt)}
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2 md:justify-end">
                                    <Button asChild variant="outline" size="sm" className="rounded-xl font-bold whitespace-nowrap">
                                        <Link href={version.openHref} target="_blank">
                                            <ExternalLink className="mr-1 size-3.5" />
                                            Öffnen
                                        </Link>
                                    </Button>
                                    <Button asChild variant="outline" size="sm" className="rounded-xl font-bold whitespace-nowrap">
                                        <Link href={version.downloadHref}>
                                            <Download className="mr-1 size-3.5" />
                                            Download
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {viewModel.versions.length === 0 ? (
                            <div className="p-6 text-sm font-semibold text-slate-500">
                                Für dieses Dokument wurde noch keine Version angelegt.
                            </div>
                        ) : null}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function InfoItem({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p>
            <p className="mt-1 text-sm font-extrabold text-slate-900">{value}</p>
        </div>
    );
}
