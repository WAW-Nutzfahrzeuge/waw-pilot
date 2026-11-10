"use server";

import { redirect } from "next/navigation";

import {
    getFinancialCategoryLabel,
} from "@/lib/accounting/financial-categories";
import { calculateCashRegisterBalance } from "@/lib/accounting/cash-register-summary";
import type { CashDepositAllocationInput } from "@/lib/accounting/cash-deposit-allocations";
import { getCashRegisterBalanceEntries } from "@/lib/accounting/financial-queries";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";
import { syncCashbookEntryFinancialEntry } from "@/lib/accounting/financial-sync";
import { getCurrentCompanyId } from "@/lib/company";
import { logActivity } from "@/lib/activity/activity-log";
import {
    getDocumentUploadFailedMessage,
    getUnsupportedDocumentTypeMessage,
    isAllowedDocumentFile,
} from "@/lib/documents/upload-validation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CreateCashbookEntryState = {
    success: boolean;
    message: string;
};

function getStringValue(formData: FormData, key: string): string | null {
    const value = formData.get(key);

    if (typeof value !== "string") return null;

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
}

function getNumberValue(formData: FormData, key: string): number | null {
    const value = getStringValue(formData, key);

    if (!value) return null;

    const normalizedValue = value.replace(",", ".");
    const numberValue = Number(normalizedValue);

    return Number.isFinite(numberValue) ? numberValue : null;
}

function parseCashDepositAllocations(value: FormDataEntryValue | null): CashDepositAllocationInput[] | null {
    if (typeof value !== "string") return null;
    try {
        const parsed: unknown = JSON.parse(value);
        if (!Array.isArray(parsed) || parsed.length === 0) return null;
        return parsed.map((row) => {
            if (!row || typeof row !== "object") throw new Error("invalid");
            const item = row as Record<string, unknown>;
            if (
                item.type !== "sale_payment" &&
                item.type !== "existing_cash_balance" &&
                item.type !== "other_cash_income"
            ) throw new Error("invalid");
            if (typeof item.amount !== "number" || !Number.isFinite(item.amount) || item.amount <= 0) {
                throw new Error("invalid");
            }
            if (
                (item.type === "sale_payment" || item.type === "other_cash_income") &&
                (typeof item.sourceFinancialEntryId !== "string" || !/^[0-9a-f-]{36}$/i.test(item.sourceFinancialEntryId))
            ) throw new Error("invalid");
            if (item.type === "existing_cash_balance" && item.sourceFinancialEntryId !== undefined) {
                throw new Error("invalid");
            }
            if (item.note !== undefined && typeof item.note !== "string") throw new Error("invalid");
            return {
                type: item.type,
                amount: Math.round(item.amount * 100) / 100,
                ...(typeof item.sourceFinancialEntryId === "string"
                    ? { sourceFinancialEntryId: item.sourceFinancialEntryId }
                    : {}),
                ...(typeof item.note === "string" ? { note: item.note.trim().slice(0, 300) } : {}),
            } as CashDepositAllocationInput;
        });
    } catch {
        return null;
    }
}

function sanitizeFileName(fileName: string): string {
    return fileName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/ä/g, "ae")
        .replace(/ö/g, "oe")
        .replace(/ü/g, "ue")
        .replace(/ß/g, "ss")
        .replace(/[^a-z0-9.\-_]/g, "");
}

function getFileExtension(fileName: string): string {
    const parts = fileName.split(".");
    const extension = parts.length > 1 ? parts.pop() : null;

    return extension ? `.${extension}` : "";
}

function getEntryTypeLabel(entryType: string): string {
    if (entryType === "income") return "Einnahme";
    if (entryType === "expense") return "Ausgabe";

    return entryType;
}

function getPaymentMethodLabel(paymentMethod: string): string {
    if (paymentMethod === "cash") return "Bar";
    if (paymentMethod === "bank") return "Bank";

    return paymentMethod;
}

function getCategoryLabel(category: string): string {
    return getFinancialCategoryLabel(category);
}

async function getCurrentCashBalance(companyId: string): Promise<number> {
    const supabase = createServerSupabaseClient();
    const { data: cashRegister, error: cashRegisterError } = await supabase
        .from("cash_registers")
        .select("opening_balance")
        .eq("company_id", companyId)
        .eq("active", true)
        .maybeSingle();

    if (cashRegisterError) {
        throw new Error("Der Anfangsbestand der Barkasse konnte nicht geladen werden.");
    }

    try {
        const cashEntries = await getCashRegisterBalanceEntries();
        const openingBalance = Number(cashRegister?.opening_balance ?? 0);
        return calculateCashRegisterBalance(openingBalance, cashEntries);
    } catch {
        throw new Error("Der Kassenbestand konnte nicht berechnet werden.");
    }
}

async function createCashbookReceiptDocument({
                                                 companyId,
                                                 file,
                                                 description,
                                             }: {
    companyId: string;
    file: File;
    description: string;
}): Promise<string> {
    const supabase = createServerSupabaseClient();

    const originalFileName = sanitizeFileName(file.name);
    const fileExtension = getFileExtension(originalFileName);
    const timestamp = Date.now();

    const fileName = `kassenbuch-beleg-${timestamp}${fileExtension}`;
    const filePath = `cashbook/manual/${fileName}`;
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
        .from("documents")
        .upload(filePath, fileBuffer, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
        });

    if (uploadError) {
        console.error("[upload] cashbook receipt storage upload failed", uploadError);
        throw new Error(getDocumentUploadFailedMessage(uploadError));
    }

    const { data: documentData, error: documentError } = await supabase
        .from("documents")
        .insert({
            company_id: companyId,
            document_type: "cashbook_receipt",
            source: "uploaded",
            status: "available",
            file_name: `Kassenbuch-Beleg - ${description} - ${originalFileName}`,
            file_path: filePath,
            mime_type: file.type || null,
            file_size: file.size,
            customer_id: null,
            vehicle_id: null,
            sale_id: null,
            invoice_id: null,
            generated_by_system: false,
        })
        .select("id")
        .single();

    if (documentError || !documentData) {
        await supabase.storage.from("documents").remove([filePath]);
        console.error("[upload] cashbook receipt document insert failed", documentError);

        throw new Error(
            "Dokument konnte nicht gespeichert werden. Bitte versuche es erneut.",
        );
    }

    return documentData.id as string;
}

export async function createCashbookEntryAction(
    _previousState: CreateCashbookEntryState,
    formData: FormData,
): Promise<CreateCashbookEntryState> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();

    const submittedEntryType = getStringValue(formData, "entry_type");
    const category = getStringValue(formData, "category");
    const submittedPaymentMethod = getStringValue(formData, "payment_method");
    const amount = getNumberValue(formData, "amount");
    const bookingDate = getStringValue(formData, "booking_date");
    const submittedDescription = getStringValue(formData, "description");
    const description =
        category === "cash_bank_deposit"
            ? "Bargeld auf Bank eingezahlt"
            : submittedDescription;
    const fileValue = formData.get("receipt_file");

    if (submittedEntryType !== "income" && submittedEntryType !== "expense") {
        return {
            success: false,
            message: "Bitte wähle Einnahme oder Ausgabe aus.",
        };
    }

    if (!category) {
        return {
            success: false,
            message: "Bitte wähle eine Kategorie aus.",
        };
    }

    if (submittedPaymentMethod !== "cash" && submittedPaymentMethod !== "bank") {
        return {
            success: false,
            message: "Bitte wähle Bar oder Bank aus.",
        };
    }

    const entryType =
        category === "owner_deposit"
            ? "income"
            : category === "owner_withdrawal"
              ? "expense"
              : submittedEntryType;
    const paymentMethod =
        category === "owner_deposit" ||
        category === "owner_withdrawal" ||
        category === "cash_bank_deposit"
            ? "cash"
            : submittedPaymentMethod;
    const normalizedEntryType =
        category === "cash_bank_deposit" ? "expense" : entryType;

    if (amount === null || amount <= 0) {
        return {
            success: false,
            message: "Bitte gib einen gültigen Betrag ein.",
        };
    }

    if (!bookingDate) {
        return {
            success: false,
            message: "Bitte wähle ein Buchungsdatum aus.",
        };
    }

    if (category === "cash_bank_deposit") {
        const allocations = parseCashDepositAllocations(formData.get("cash_allocations"));
        if (!allocations) {
            return {
                success: false,
                message: "Bitte ordne den Einzahlungsbetrag Verkäufen, Bareinnahmen oder dem vorhandenen Kassenbestand vollständig zu.",
            };
        }
        const allocatedCents = allocations.reduce((sum, allocation) => sum + Math.round(allocation.amount * 100), 0);
        if (allocatedCents !== Math.round(amount * 100)) {
            return {
                success: false,
                message: "Die Zuordnungen müssen zusammen genau dem Einzahlungsbetrag entsprechen.",
            };
        }
        if (fileValue instanceof File && fileValue.size > 0) {
            return {
                success: false,
                message: "Für eine Bankeinzahlung kann hier kein zusätzlicher Beleg hochgeladen werden.",
            };
        }

        const user = await getCurrentUserContext();
        if (user.companyId !== companyId) {
            return { success: false, message: "Die Firmenzuordnung konnte nicht bestätigt werden." };
        }

        let depositId: string | null = null;
        try {
            const adminSupabase = createAutomationSupabaseClient();
            const { data, error } = await adminSupabase.rpc("create_cash_bank_deposit_with_allocations", {
                p_company_id: companyId,
                p_amount: amount,
                p_booking_date: bookingDate,
                p_allocations: allocations,
                p_created_by: user.authUserId,
            });
            if (error || typeof data !== "string") {
                const message = error?.message ?? "";
                if (message.includes("deposit exceeds available cash balance")) {
                    return { success: false, message: "Die Einzahlung ist höher als der aktuell verfügbare Kassenbestand." };
                }
                if (message.includes("allocations must equal deposit amount")) {
                    return { success: false, message: "Die Zuordnungen müssen zusammen genau dem Einzahlungsbetrag entsprechen." };
                }
                if (message.includes("allocation exceeds unassigned cash inflow")) {
                    return { success: false, message: "Mindestens eine Zahlung wurde inzwischen bereits einer anderen Einzahlung zugeordnet. Bitte lade die Seite neu und prüfe die Auswahl." };
                }
                if (message.includes("selected cash inflow is unavailable")) {
                    return { success: false, message: "Eine ausgewählte Barzahlung ist nicht mehr verfügbar. Bitte lade die Seite neu." };
                }
                throw new Error("Die Einzahlung samt Zuordnung konnte nicht gespeichert werden.");
            }
            depositId = data;
            await syncCashbookEntryFinancialEntry({ companyId, cashbookEntryId: depositId });
            await logActivity({
                action: `Bareinzahlung auf Bank über ${amount.toLocaleString("de-DE", { style: "currency", currency: "EUR" })} mit Herkunftszuordnung erfasst`,
                entityType: "cashbook",
                entityId: depositId,
            });
        } catch (error) {
            return {
                success: false,
                message: depositId
                    ? "Die Einzahlung und Zuordnung wurden gespeichert, aber die Aktualisierung des Finanzjournals ist fehlgeschlagen. Bitte die Einzahlung nicht erneut erfassen und den Admin informieren."
                    : error instanceof Error ? error.message : "Einzahlung konnte nicht abgeschlossen werden.",
            };
        }

        redirect("/dashboard/cashbook?tab=cash");
    }

    if (!description) {
        return {
            success: false,
            message: "Bitte gib eine Beschreibung ein.",
        };
    }

    if (paymentMethod === "cash" && normalizedEntryType === "expense") {
        try {
            const currentCashBalance = await getCurrentCashBalance(companyId);
            const targetCashBalance = Math.round((currentCashBalance - amount) * 100) / 100;

            if (targetCashBalance < 0) {
                return {
                    success: false,
                    message: `${category === "cash_bank_deposit" ? "Diese Einzahlung" : "Diese Barausgabe"} würde den Kassenbestand auf ${targetCashBalance.toLocaleString(
                        "de-DE",
                        {
                            style: "currency",
                            currency: "EUR",
                        },
                    )} senken. Bitte prüfe den verfügbaren Kassenbestand, Anfangsbestand oder fehlende Bareinnahmen.`,
                };
            }
        } catch (error) {
            return {
                success: false,
                message:
                    error instanceof Error
                        ? error.message
                        : "Der Kassenbestand konnte nicht berechnet werden.",
            };
        }
    }

    let documentId: string | null = null;

    try {
        if (fileValue instanceof File && fileValue.size > 0) {
            if (!isAllowedDocumentFile(fileValue)) {
                return {
                    success: false,
                    message: getUnsupportedDocumentTypeMessage(),
                };
            }

            documentId = await createCashbookReceiptDocument({
                companyId,
                file: fileValue,
                description,
            });

            await logActivity({
                action: `Kassenbuch-Beleg zu "${description}" hochgeladen`,
                entityType: "document",
                entityId: documentId,
            });
        }

        const { data: cashbookEntry, error } = await supabase
            .from("cashbook_entries")
            .insert({
                company_id: companyId,
                entry_type: normalizedEntryType,
                category,
                payment_method: paymentMethod,
                amount,
                booking_date: bookingDate,
                description,

                customer_id: null,
                vehicle_id: null,
                sale_id: null,
                invoice_id: null,
                document_id: documentId,
            })
            .select("id")
            .single();

        if (error || !cashbookEntry) {
            return {
                success: false,
                message: `Buchung konnte nicht gespeichert werden: ${
                    error?.message ?? "Keine Kassenbuch-ID erhalten"
                }`,
            };
        }

        const entryTypeLabel = getEntryTypeLabel(entryType);
        const paymentMethodLabel = getPaymentMethodLabel(paymentMethod);
        const categoryLabel = getCategoryLabel(category);

        await logActivity({
            action: `${entryTypeLabel} im Kassenbuch erfasst: ${description} (${paymentMethodLabel}, ${categoryLabel})`,
            entityType: "cashbook",
            entityId: cashbookEntry.id as string,
        });

        await syncCashbookEntryFinancialEntry({
            companyId,
            cashbookEntryId: cashbookEntry.id as string,
        });
    } catch (error) {
        return {
            success: false,
            message:
                error instanceof Error
                    ? error.message
                    : "Buchung konnte nicht gespeichert werden.",
        };
    }

    redirect(`/dashboard/cashbook?tab=${paymentMethod === "cash" ? "cash" : "accounting"}`);
}
