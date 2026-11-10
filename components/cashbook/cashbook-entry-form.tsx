"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import {
    ArrowLeft,
    Banknote,
    CheckCircle2,
    Coins,
    FileText,
    FileUp,
    Save,
    Sparkles,
    Wallet,
} from "lucide-react";

import { createCashbookEntryAction } from "@/app/dashboard/cashbook/new/actions";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    documentAcceptMimeTypes,
    getUnsupportedDocumentTypeMessage,
    isAllowedDocumentFile,
} from "@/lib/documents/upload-validation";
import { financialCategories } from "@/lib/accounting/financial-categories";
import { formatDate, getTodayDateOnly } from "@/lib/format/date";
import {
    captureFormSnapshot,
    restoreFormSnapshot,
    type FormSnapshot,
} from "@/lib/forms/form-snapshot";
import { useFormActionFeedback } from "@/components/forms/use-form-action-feedback";
import { ActionMessage } from "@/components/shared/action-message";
import type { CashInflowCandidate } from "@/lib/accounting/cash-deposit-allocations";

const initialState = {
    success: false,
    message: "",
};

function formatCashEuro(value: number): string {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatCashDate(value: string): string {
    return formatDate(value);
}

type CashbookEntryFormProps = {
    initialCategory?: string;
    cashInflowCandidates?: CashInflowCandidate[];
};

type SelectedCashAllocation = {
    type: "sale_payment" | "other_cash_income";
    amount: string;
};

function toCents(value: string): number {
    const amount = Number(value.replace(",", "."));
    return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

export function CashbookEntryForm({
    initialCategory = "other",
    cashInflowCandidates = [],
}: CashbookEntryFormProps) {
    const [state, formAction, isPending] = useActionState(
        createCashbookEntryAction,
        initialState,
    );

    const fileInputRef = useRef<HTMLInputElement>(null);
    const formRef = useRef<HTMLFormElement | null>(null);
    const messageRef = useRef<HTMLDivElement | null>(null);
    const lastSubmittedSnapshotRef = useRef<FormSnapshot | null>(null);
    const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
    const [selectedCategory, setSelectedCategory] = useState(
        initialCategory === "cash_bank_deposit" ? initialCategory : "other",
    );
    const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(
        null,
    );
    const [depositAmount, setDepositAmount] = useState("");
    const [selectedCashAllocations, setSelectedCashAllocations] = useState<Record<string, SelectedCashAllocation>>({});
    const [remainderType, setRemainderType] = useState<"" | "existing_cash_balance">("");
    const [suggestionApplied, setSuggestionApplied] = useState(false);
    const [suggestionTieCount, setSuggestionTieCount] = useState(0);

    const today = getTodayDateOnly();
    const isBankDeposit = selectedCategory === "cash_bank_deposit";
    const allocatedCents = Object.values(selectedCashAllocations)
        .reduce((total, allocation) => total + toCents(allocation.amount), 0);
    const depositCents = toCents(depositAmount);
    const remainderCents = depositCents - allocatedCents;
    const cashAllocations = [
        ...Object.entries(selectedCashAllocations).map(([sourceFinancialEntryId, allocation]) => ({
            type: allocation.type,
            sourceFinancialEntryId,
            amount: toCents(allocation.amount) / 100,
        })),
        ...(remainderCents > 0 && remainderType
            ? [{ type: remainderType, amount: remainderCents / 100 }]
            : []),
    ];
    const depositAllocationInvalid = isBankDeposit && (
        depositCents <= 0 ||
        remainderCents < 0 ||
        (remainderCents > 0 && !remainderType)
    );
    const orderedCashInflowCandidates = [...cashInflowCandidates].sort((left, right) => {
        const leftSelected = Boolean(selectedCashAllocations[left.financialEntryId]);
        const rightSelected = Boolean(selectedCashAllocations[right.financialEntryId]);
        return Number(rightSelected) - Number(leftSelected);
    });

    function suggestClosestSales() {
        const targetCents = depositCents;
        if (targetCents <= 0) return;

        const saleCandidates = cashInflowCandidates
            .filter((candidate) => candidate.saleNumber !== null)
            .map((candidate) => ({
                candidate,
                cents: Math.round(candidate.availableAmount * 100),
            }))
            .filter(({ cents }) => cents > 0);
        if (saleCandidates.length === 0) return;

        const closestDistance = Math.min(
            ...saleCandidates.map(({ cents }) => Math.abs(cents - targetCents)),
        );
        const closestCandidates = saleCandidates.filter(
            ({ cents }) => Math.abs(cents - targetCents) === closestDistance,
        );
        const hasEqualValueTie = closestCandidates.length > 1 &&
            closestCandidates.every(({ cents }) => cents === closestCandidates[0].cents);
        const suggestedCandidates = hasEqualValueTie
            ? closestCandidates
            : closestCandidates.slice(0, 1);
        const suggested: Record<string, SelectedCashAllocation> = {};
        for (const { candidate, cents } of suggestedCandidates) {
            suggested[candidate.financialEntryId] = {
                type: "sale_payment",
                amount: (Math.min(cents, targetCents) / 100).toFixed(2),
            };
        }

        setSelectedCashAllocations(suggested);
        setRemainderType("");
        setSuggestionApplied(true);
        setSuggestionTieCount(hasEqualValueTie ? suggestedCandidates.length : 0);
    }

    useFormActionFeedback({
        message: state.message,
        success: state.success,
        messageRef,
        restoreLastSubmission: () => {
            const form = formRef.current;
            const snapshot = lastSubmittedSnapshotRef.current;

            if (!form || !snapshot) return;

            window.requestAnimationFrame(() => restoreFormSnapshot(form, snapshot));
        },
    });

    function handleReceiptFileChange() {
        const file = fileInputRef.current?.files?.[0] ?? null;

        if (!file || file.size <= 0) {
            setSelectedFileName(null);
            setUploadErrorMessage("Bitte wähle eine Datei aus.");
            return;
        }

        if (!isAllowedDocumentFile(file)) {
            setSelectedFileName(null);
            setUploadErrorMessage(getUnsupportedDocumentTypeMessage());
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
            return;
        }

        setUploadErrorMessage(null);
        setSelectedFileName(file.name);
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Kassenbuch"
                title={isBankDeposit ? "Bareinzahlung auf Bank erfassen" : "Finanzvorgang erfassen"}
                description={
                    isBankDeposit
                        ? "Trage ein, wie viel Bargeld du auf das Bankkonto eingezahlt hast. Der Betrag wird vom aktuellen Kassenbestand abgezogen."
                        : "Erfasse sonstige Bar- oder Bankvorgänge. Verkaufszahlungen werden in der Verkaufsakte erfasst."
                }
                action={
                    <Button
                        asChild
                        variant="outline"
                        className="rounded-2xl border-slate-200 bg-white font-bold"
                    >
                        <Link href="/dashboard/cashbook">
                            <ArrowLeft className="mr-2 size-4" />
                            Zurück
                        </Link>
                    </Button>
                }
            />

            <form
                ref={formRef}
                action={formAction}
                className="space-y-6"
                onSubmit={(event) => {
                    lastSubmittedSnapshotRef.current = captureFormSnapshot(
                        event.currentTarget,
                    );
                }}
            >
                {state.message ? (
                    <ActionMessage
                        ref={messageRef}
                        title={state.message}
                        tone={state.success ? "success" : "danger"}
                    />
                ) : null}

                {!isBankDeposit ? <Card className="rounded-3xl border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={Wallet}
                            title="Buchungstyp"
                            description="Wähle, ob es sich um eine Einnahme, Ausgabe, Bareinlage oder Barentnahme handelt."
                        />

                        <div className="grid gap-3 md:grid-cols-2">
                            <RadioBox
                                name="entry_type"
                                value="income"
                                title="Einnahme"
                                description="Sonstiger Geldeingang außerhalb einer Verkaufszahlung."
                                defaultChecked
                            />
                            <RadioBox
                                name="entry_type"
                                value="expense"
                                title="Ausgabe / Entnahme"
                                description="Geldausgang, z. B. Reparatur, Gebühren oder Einkauf."
                            />
                        </div>
                    </CardContent>
                </Card> : null}

                {!isBankDeposit ? <Card className="rounded-3xl border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={Coins}
                            title="Zahlungsart"
                            description="Trenne Bar- und Bankbewegungen sauber voneinander."
                        />

                        <div className="grid gap-3 md:grid-cols-2">
                            <RadioBox
                                name="payment_method"
                                value="cash"
                                title="Bar"
                                description="Bargeldbewegung im Kassenbuch."
                            />
                            <RadioBox
                                name="payment_method"
                                value="bank"
                                title="Bank"
                                description="Zahlung über Bankkonto."
                                defaultChecked
                            />
                        </div>
                    </CardContent>
                </Card> : (
                    <Card className="rounded-3xl border-cyan-200 bg-cyan-50/70 shadow-sm">
                        <CardContent className="space-y-3 p-5">
                            <SectionTitle
                                icon={Wallet}
                                title="Einzahlung aus der Barkasse"
                                description="Der Betrag wird als Umbuchung erfasst und direkt vom laufenden Kassenbestand abgezogen."
                            />
                            <input type="hidden" name="entry_type" value="expense" />
                            <input type="hidden" name="payment_method" value="cash" />
                            <input type="hidden" name="description" value="Bargeld auf Bank eingezahlt" />
                            <p className="text-sm font-semibold text-cyan-900">
                                Die Einzahlung zählt nicht als Barausgabe und verändert nicht die Einnahmen oder Ausgaben der Buchhaltungsübersicht.
                            </p>
                        </CardContent>
                    </Card>
                )}

                <Card className="rounded-3xl border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={Banknote}
                            title="Buchungsdaten"
                            description={isBankDeposit ? "Einzahlungsbetrag und Buchungsdatum." : "Kategorie, Betrag und Buchungsdatum."}
                        />

                        <div className={`grid gap-4 ${isBankDeposit ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
                            {isBankDeposit ? (
                                <input type="hidden" name="category" value="cash_bank_deposit" />
                            ) : (
                                <div className="space-y-2">
                                    <Label htmlFor="category" className="font-bold text-slate-700">
                                        Kategorie *
                                    </Label>
                                    <select
                                        id="category"
                                        name="category"
                                        required
                                        value={selectedCategory}
                                        onChange={(event) => setSelectedCategory(event.target.value)}
                                        className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-950 outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-100"
                                    >
                                        {financialCategories.filter((category) => category.code !== "cash_bank_deposit").map((category) => (
                                            <option key={category.code} value={category.code}>
                                                {category.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <FormField
                                label="Betrag *"
                                name="amount"
                                type="number"
                                step="0.01"
                                required
                                value={isBankDeposit ? depositAmount : undefined}
                                onChange={isBankDeposit ? (value) => {
                                    setDepositAmount(value);
                                    setSuggestionApplied(false);
                                    setSuggestionTieCount(0);
                                } : undefined}
                            />

                            <FormField
                                label="Buchungsdatum *"
                                name="booking_date"
                                type="date"
                                defaultValue={today}
                                required
                            />
                        </div>
                    </CardContent>
                </Card>

                {isBankDeposit ? (
                    <>
                        <input type="hidden" name="cash_allocations" value={JSON.stringify(cashAllocations)} />
                        <Card className="rounded-3xl border-slate-200 bg-white/90 shadow-sm">
                            <CardContent className="space-y-5 p-5">
                                <SectionTitle
                                    icon={Coins}
                                    title="Herkunft der Einzahlung zuordnen"
                                    description="Wähle die Bareinnahmen aus, die du bei dieser Einzahlung auf die Bank eingezahlt hast. Bereits früher erhaltene Zahlungen sind ebenfalls auswählbar."
                                />
                                <div className="flex flex-col gap-2 rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                                    <p className="text-sm font-semibold leading-5 text-cyan-950">
                                        Verkäufe können anhand ihrer noch nicht zugeordneten Barzahlungen vorgeschlagen werden. Bitte prüfe die Auswahl vor dem Speichern.
                                    </p>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={suggestClosestSales}
                                        disabled={depositCents <= 0 || !cashInflowCandidates.some((candidate) => candidate.saleNumber !== null && candidate.availableAmount > 0)}
                                        className="shrink-0 rounded-xl border-cyan-200 bg-white font-bold text-cyan-900 hover:bg-cyan-50"
                                    >
                                        <Sparkles className="mr-2 size-4" />
                                        Verkäufe vorschlagen
                                    </Button>
                                </div>
                                {depositCents > 0 && !cashInflowCandidates.some((candidate) => candidate.saleNumber !== null && candidate.availableAmount > 0) ? (
                                    <p className="text-xs font-semibold text-amber-800">
                                        Keine noch zuordenbare Barzahlung aus einem Verkauf gefunden. Prüfe den Zeitraum oder ordne den Betrag dem vorhandenen Kassenbestand zu.
                                    </p>
                                ) : null}
                                {suggestionApplied ? (
                                    <p className="text-xs font-semibold text-cyan-900">
                                        {suggestionTieCount > 1
                                            ? `${suggestionTieCount} gleich nahe Verkäufe vorausgewählt. Bitte den richtigen auswählen und die Summe prüfen.`
                                            : "Der dem Einzahlungsbetrag nächstliegende Verkauf ist vorausgewählt. Bitte prüfen."}
                                    </p>
                                ) : null}
                                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold leading-5 text-amber-950">
                                    Historische Einzahlungen werden nicht automatisch rückwirkend zugeordnet. Wähle eine ältere Bareinnahme daher nur aus, wenn ihr Betrag damals noch in der Kasse war und nicht bereits eingezahlt wurde.
                                </p>

                                {cashInflowCandidates.length ? (
                                    <div className="space-y-3">
                                        {orderedCashInflowCandidates.map((candidate) => {
                                            const selected = selectedCashAllocations[candidate.financialEntryId];
                                            return (
                                                <div key={candidate.financialEntryId} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-center">
                                                    <label className="flex min-w-0 cursor-pointer items-start gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={Boolean(selected)}
                                                            onChange={(event) => setSelectedCashAllocations((current) => {
                                                                if (!event.target.checked) {
                                                                    const next = { ...current };
                                                                    delete next[candidate.financialEntryId];
                                                                    return next;
                                                                }
                                                                return {
                                                                    ...current,
                                                                    [candidate.financialEntryId]: {
                                                                        type: candidate.allocationType,
                                                                        amount: candidate.availableAmount.toFixed(2),
                                                                    },
                                                                };
                                                            })}
                                                            className="mt-1 size-4 rounded border-slate-300 text-cyan-700 focus:ring-cyan-600"
                                                        />
                                                        <span className="min-w-0">
                                                            <span className="block truncate text-sm font-extrabold text-slate-900">
                                                                {candidate.saleNumber ? `Verkauf ${candidate.saleNumber}` : candidate.description}
                                                            </span>
                                                            <span className="mt-1 block text-xs font-medium text-slate-500">
                                                                {formatCashDate(candidate.paymentDate)} · Beleg {candidate.paymentReference} · noch zuordenbar {formatCashEuro(candidate.availableAmount)}
                                                            </span>
                                                        </span>
                                                    </label>
                                                    <div className="space-y-1.5">
                                                        <Label htmlFor={`allocation-${candidate.financialEntryId}`} className="text-xs font-bold text-slate-600">Anteil dieser Zahlung</Label>
                                                        <Input
                                                            id={`allocation-${candidate.financialEntryId}`}
                                                            type="number"
                                                            min="0.01"
                                                            max={candidate.availableAmount}
                                                            step="0.01"
                                                            disabled={!selected}
                                                            value={selected?.amount ?? ""}
                                                            onChange={(event) => setSelectedCashAllocations((current) => ({
                                                                ...current,
                                                                [candidate.financialEntryId]: {
                                                                    type: candidate.allocationType,
                                                                    amount: event.target.value,
                                                                },
                                                            }))}
                                                            className="h-10 rounded-xl border-slate-200 bg-white font-semibold"
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                                        Es gibt keine noch offenen Barzahlungseingänge zum Zuordnen. Du kannst die Einzahlung einem bereits vorhandenen Kassenbestand zuordnen.
                                    </p>
                                )}

                                <div className="flex flex-col gap-2 rounded-2xl bg-slate-100 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                                    <span className="font-semibold text-slate-700">Ausgewählte Bareinnahmen</span>
                                    <span className="font-extrabold tabular-nums text-slate-950">{formatCashEuro(allocatedCents / 100)}</span>
                                </div>

                                {remainderCents > 0 ? (
                                    <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                        <Label htmlFor="cash-remainder-type" className="font-bold text-amber-950">
                                            Noch zu erklären: {formatCashEuro(remainderCents / 100)}
                                        </Label>
                                        <select
                                            id="cash-remainder-type"
                                            value={remainderType}
                                            onChange={(event) => setRemainderType(event.target.value as "" | "existing_cash_balance")}
                                            className="h-11 w-full rounded-xl border border-amber-300 bg-white px-3 text-sm font-semibold text-slate-900"
                                        >
                                            <option value="">Herkunft auswählen</option>
                                            <option value="existing_cash_balance">Bereits vorher in der Kasse vorhanden</option>
                                        </select>
                                        <p className="text-xs font-medium text-amber-900">
                                            Frühere Bareinnahmen aus Verkäufen oder sonstigen Zahlungseingängen kannst du oben zusätzlich auswählen.
                                        </p>
                                    </div>
                                ) : null}

                                {remainderCents < 0 ? (
                                    <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                                        Die ausgewählten Zuordnungen übersteigen den Einzahlungsbetrag.
                                    </p>
                                ) : null}
                            </CardContent>
                        </Card>
                    </>
                ) : null}

                {!isBankDeposit ? <Card className="rounded-3xl border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={FileText}
                            title="Beschreibung"
                            description="Kurzer Buchungstext für die spätere Prüfung."
                        />

                        <div className="space-y-2">
                            <Label htmlFor="description" className="font-bold text-slate-700">
                                Beschreibung *
                            </Label>
                            <Textarea
                                id="description"
                                name="description"
                                required
                                placeholder="z. B. Reparaturrechnung MAN TGX, Zulassungsgebühr, Barzahlung Kunde..."
                                className="min-h-32 rounded-2xl border-slate-200 bg-slate-50 font-medium"
                            />
                        </div>
                    </CardContent>
                </Card> : null}

                {!isBankDeposit ? <Card className="rounded-3xl border-slate-200 bg-white/90 shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <SectionTitle
                            icon={FileUp}
                            title="Beleg"
                            description="Optional PDF oder Bild hochladen, z. B. Rechnung, Quittung oder Zahlungsnachweis."
                        />

                        <div
                            className={
                                selectedFileName
                                    ? "group flex cursor-pointer items-center gap-4 rounded-3xl border border-emerald-200 bg-emerald-50/60 px-4 py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-md"
                                    : "group flex cursor-pointer items-center gap-4 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:bg-cyan-50/40 hover:shadow-md"
                            }
                        >
              <span
                  className={
                      selectedFileName
                          ? "flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"
                          : "flex size-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-100 text-cyan-700"
                  }
              >
                {selectedFileName ? (
                    <CheckCircle2 className="size-5" />
                ) : (
                    <FileUp className="size-5" />
                )}
              </span>

                            <span className="min-w-0 flex-1">
                <span className="block text-sm font-extrabold text-slate-950">
                  {selectedFileName ? "Beleg ausgewählt" : "Beleg auswählen"}
                </span>
                <span className="mt-1 block truncate text-xs font-semibold text-slate-500">
                  {selectedFileName ?? "PDF, PNG, JPG oder WEBP"}
                </span>
              </span>

                            <Button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                className="h-10 shrink-0 rounded-xl bg-slate-950 px-3 text-xs font-extrabold text-white transition hover:bg-slate-800"
                            >
                Hochladen
              </Button>

                            <input
                                ref={fileInputRef}
                                name="receipt_file"
                                type="file"
                                accept={documentAcceptMimeTypes}
                                className="sr-only"
                                onChange={handleReceiptFileChange}
                            />
                        </div>

                        {uploadErrorMessage ? (
                            <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                                {uploadErrorMessage}
                            </p>
                        ) : null}
                    </CardContent>
                </Card> : null}

                <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white/85 px-4 py-4 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0">
                    <div className="flex flex-col-reverse gap-3 md:flex-row md:justify-end">
                        <Button
                            asChild
                            type="button"
                            variant="outline"
                            className="h-12 rounded-2xl border-slate-200 bg-white font-bold"
                        >
                            <Link href="/dashboard/cashbook">Abbrechen</Link>
                        </Button>

                        <Button
                            type="submit"
                            disabled={isPending || depositAllocationInvalid}
                            className="h-12 rounded-2xl bg-cyan-700 px-6 font-extrabold text-white hover:bg-cyan-800"
                        >
                            <Save className="mr-2 size-4" />
                            {isPending ? "Speichert..." : isBankDeposit ? "Einzahlung speichern" : "Buchung speichern"}
                        </Button>
                    </div>
                </div>
            </form>
        </div>
    );
}

function RadioBox({
                      name,
                      value,
                      title,
                      description,
                      defaultChecked = false,
                  }: {
    name: string;
    value: string;
    title: string;
    description: string;
    defaultChecked?: boolean;
}) {
    return (
        <label className="cursor-pointer rounded-3xl border border-slate-200 bg-slate-50 p-4 transition-all hover:border-emerald-200 hover:bg-emerald-50/60 has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50 has-[:checked]:ring-4 has-[:checked]:ring-emerald-100">
            <input
                type="radio"
                name={name}
                value={value}
                defaultChecked={defaultChecked}
                className="sr-only"
            />
            <p className="font-extrabold text-slate-950">{title}</p>
            <p className="mt-1 text-sm font-medium leading-6 text-slate-500">
                {description}
            </p>
        </label>
    );
}

function SectionTitle({
                          icon: Icon,
                          title,
                          description,
                      }: {
    icon: typeof Wallet;
    title: string;
    description: string;
}) {
    return (
        <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl border border-cyan-100 bg-cyan-50 text-cyan-700">
                <Icon className="size-5" />
            </div>
            <div>
                <h2 className="text-xl font-extrabold text-slate-950">{title}</h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                    {description}
                </p>
            </div>
        </div>
    );
}

function FormField({
                       label,
                       name,
                       type = "text",
                       required = false,
                       defaultValue,
                       placeholder,
                       step,
                       value,
                       onChange,
                   }: {
    label: string;
    name: string;
    type?: string;
    required?: boolean;
    defaultValue?: string;
    placeholder?: string;
    step?: string;
    value?: string;
    onChange?: (value: string) => void;
}) {
    return (
        <div className="space-y-2">
            <Label htmlFor={name} className="font-bold text-slate-700">
                {label}
            </Label>
            <Input
                id={name}
                name={name}
                type={type}
                required={required}
                {...(value === undefined ? { defaultValue } : { value })}
                placeholder={placeholder}
                step={step}
                onChange={onChange ? (event) => onChange(event.target.value) : undefined}
                className="h-12 rounded-2xl border-slate-200 bg-slate-50 font-medium"
            />
        </div>
    );
}
