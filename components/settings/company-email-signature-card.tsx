"use client";

import { useState } from "react";
import { Check, Copy, ImagePlus, Mail, Trash2, Upload } from "lucide-react";

import {
    removeCompanyEmailSignatureAssetAction,
    saveCompanyEmailSignatureAction,
    uploadCompanyEmailSignatureAssetAction,
} from "@/app/dashboard/settings/actions";
import type { CompanySettings } from "@/lib/settings/company-settings-queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Props = {
    company: CompanySettings;
    saved?: boolean;
    uploaded?: boolean;
    removed?: boolean;
    error?: string;
};

export function CompanyEmailSignatureCard({ company, saved, uploaded, removed, error }: Props) {
    const [copiedCid, setCopiedCid] = useState<string | null>(null);

    async function copySnippet(contentId: string) {
        await navigator.clipboard.writeText(`<img src="cid:${contentId}" alt="WAW Nutzfahrzeuge" style="max-width: 280px; height: auto;">`);
        setCopiedCid(contentId);
        window.setTimeout(() => setCopiedCid(null), 1600);
    }

    return (
        <Card className="rounded-3xl border-slate-200 bg-white/90 shadow-sm">
            <CardContent className="space-y-5 p-5">
                <div className="flex items-start gap-3">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700"><Mail className="size-5" /></div>
                    <div>
                        <h2 className="font-extrabold text-slate-950">E-Mail-Signatur</h2>
                        <p className="mt-1 text-sm leading-6 text-slate-600">Diese Signatur wird an ausgehende Kunden-E-Mails angehängt. Bilder bleiben privat gespeichert und werden in der Nachricht eingebettet.</p>
                    </div>
                </div>

                {saved ? <Notice tone="success">E-Mail-Signatur wurde gespeichert.</Notice> : null}
                {uploaded ? <Notice tone="success">Signaturbild wurde sicher hochgeladen. Kopiere seinen CID-Code in den HTML-Code.</Notice> : null}
                {removed ? <Notice tone="success">Signaturbild wurde entfernt.</Notice> : null}
                {error ? <Notice tone="error">{getErrorMessage(error)}</Notice> : null}

                <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 p-4 text-sm leading-6 text-cyan-950">
                    Füge den HTML-Code aus Outlook ein. WAW speichert den eingefügten Quelltext unverändert und erhält für die E-Mail-Ausgabe auch Outlook-Klassen und Word-Formatierungen. Aktive Inhalte und externe CSS-Ressourcen werden aus Sicherheitsgründen nicht versendet. Outlooks lokale Bildpfade funktionieren nicht in E-Mails: Lade die Bilder hier hoch und ersetze deren `src` durch den CID-Code des Bildes.
                </div>

                <form action={saveCompanyEmailSignatureAction} className="space-y-3">
                    <label htmlFor="email_signature_html" className="block text-sm font-bold text-slate-800">HTML-Signatur</label>
                    <textarea
                        id="email_signature_html"
                        name="email_signature_html"
                        defaultValue={company.email_signature_html}
                        rows={10}
                        maxLength={100000}
                        spellCheck={false}
                        placeholder={'<p>Mit freundlichen Grüßen</p>\n<p>Max Mustermann</p>\n<img src="cid:...">'}
                        className="w-full rounded-2xl border border-slate-200 bg-white p-3 font-mono text-xs leading-5 text-slate-800 shadow-inner focus:border-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-100"
                    />
                    <label className="flex items-start gap-2 text-sm leading-5 text-slate-700">
                        <input type="checkbox" name="email_signature_includes_closing" value="yes" defaultChecked={company.email_signature_includes_closing} className="mt-0.5 size-4 rounded border-slate-300 text-cyan-700 focus:ring-cyan-600" />
                        <span>Meine Signatur enthält bereits eine Grußformel, z. B. „Mit freundlichen Grüßen“. Vorhandene Standard-Grußformeln der E-Mail-Vorlagen werden dann entfernt.</span>
                    </label>
                    <div className="flex justify-end">
                        <Button type="submit" className="rounded-xl bg-cyan-700 font-bold text-white hover:bg-cyan-800"><Mail className="mr-2 size-4" />Signatur speichern</Button>
                    </div>
                </form>

                <div className="border-t border-slate-100 pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h3 className="font-extrabold text-slate-900">Signaturbilder</h3>
                            <p className="mt-1 text-xs leading-5 text-slate-500">PNG, JPG oder WEBP; bis zu 8 Bilder. WAW optimiert sie für E-Mails.</p>
                        </div>
                        <form action={uploadCompanyEmailSignatureAssetAction} className="flex flex-wrap items-center gap-2">
                            <input name="file" type="file" accept="image/png,image/jpeg,image/webp" required className="block max-w-full text-xs text-slate-600 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-bold file:text-slate-800" />
                            <Button type="submit" variant="outline" className="rounded-xl font-bold"><Upload className="mr-2 size-4" />Bild hochladen</Button>
                        </form>
                    </div>

                    {company.email_signature_assets.length ? (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {company.email_signature_assets.map((asset) => (
                                <div key={asset.contentId} className="flex min-w-0 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                    <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1">
                                        {asset.previewUrl ? (
                                            // Signed private Storage URLs are rendered directly; they are short lived and cannot be configured as a fixed Next Image host.
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={asset.previewUrl} alt={asset.fileName} className="max-h-full max-w-full object-contain" />
                                        ) : <ImagePlus className="size-6 text-slate-300" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-bold text-slate-800">{asset.fileName}</p>
                                        <code className="mt-1 block truncate text-[11px] text-slate-500">cid:{asset.contentId}</code>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <Button type="button" variant="outline" size="sm" onClick={() => copySnippet(asset.contentId)} className="h-8 rounded-lg text-xs font-bold">
                                                {copiedCid === asset.contentId ? <Check className="mr-1 size-3.5" /> : <Copy className="mr-1 size-3.5" />}
                                                {copiedCid === asset.contentId ? "Kopiert" : "HTML kopieren"}
                                            </Button>
                                            <form action={removeCompanyEmailSignatureAssetAction}>
                                                <input type="hidden" name="content_id" value={asset.contentId} />
                                                <Button type="submit" variant="outline" size="sm" className="h-8 rounded-lg border-red-100 text-xs font-bold text-red-700 hover:bg-red-50"><Trash2 className="mr-1 size-3.5" />Entfernen</Button>
                                            </form>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="mt-4 rounded-2xl border border-dashed border-slate-200 p-5 text-center text-sm font-medium text-slate-500">Noch keine Signaturbilder hochgeladen.</div>
                    )}
                </div>

                <div className="border-t border-slate-100 pt-4">
                    <h3 className="text-sm font-extrabold text-slate-900">Vorschau</h3>
                    <div className="mt-2 min-h-20 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-800 [&_a]:text-cyan-700 [&_a]:underline [&_img]:inline-block [&_img]:max-h-24 [&_img]:max-w-full [&_p]:my-1">
                        {company.email_signature_preview_html ? (
                            <iframe
                                title="Vorschau der E-Mail-Signatur"
                                sandbox=""
                                referrerPolicy="no-referrer"
                                srcDoc={`<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="font-family:Arial,sans-serif;font-size:14px">${company.email_signature_preview_html}</body></html>`}
                                className="h-64 w-full border-0"
                            />
                        ) : <p className="text-slate-400">Noch keine Signatur gespeichert.</p>}
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">Die Vorschau zeigt den zuletzt gespeicherten Stand. Eingebettete CID-Bilder können je nach Mailprogramm unterschiedlich dargestellt werden; WAW sendet sie als Inline-Bilder mit.</p>
                </div>
            </CardContent>
        </Card>
    );
}

function Notice({ children, tone }: { children: React.ReactNode; tone: "success" | "error" }) {
    return <p role={tone === "error" ? "alert" : "status"} className={tone === "error" ? "rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800" : "rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-800"}>{children}</p>;
}

function getErrorMessage(code: string): string {
    const messages: Record<string, string> = {
        tooLong: "Der HTML-Code ist zu lang. Bitte kürze die Signatur auf höchstens 100.000 Zeichen.",
        missingImage: "Mindestens ein CID-Bild wird nicht gefunden. Lade das Bild zuerst hoch und kopiere den passenden HTML-Code.",
        missingFile: "Bitte wähle zuerst ein Bild aus.",
        fileTooLarge: "Das Bild ist zu groß. Bitte verwende eine Datei bis 4 MB.",
        unsupportedType: "Bitte verwende ein PNG-, JPG- oder WEBP-Bild.",
        invalidImage: "Die Bilddatei konnte nicht gelesen werden. Bitte exportiere sie erneut als PNG, JPG oder WEBP.",
        tooManyImages: "Es können höchstens 8 Signaturbilder hinterlegt werden.",
        totalTooLarge: "Die optimierten Signaturbilder dürfen zusammen höchstens 3 MB groß sein.",
        uploadFailed: "Das Bild konnte nicht privat gespeichert werden. Bitte versuche es erneut.",
        saveFailed: "Die E-Mail-Signatur konnte nicht gespeichert werden. Prüfe, ob die Signaturmigration angewendet wurde.",
        invalidAsset: "Das Signaturbild wurde nicht gefunden.",
        imageInUse: "Dieses Bild wird noch in der gespeicherten Signatur verwendet. Entferne zuerst seinen CID-Verweis und speichere die Signatur.",
        cleanupFailed: "Der Bildverweis wurde entfernt, aber die private Datei konnte nicht bereinigt werden. Bitte wende dich an den Support.",
    };
    return messages[code] ?? "Die Signaturänderung ist fehlgeschlagen. Bitte versuche es erneut.";
}
