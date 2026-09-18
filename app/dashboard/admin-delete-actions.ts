"use server";

import { redirect } from "next/navigation";

import { revalidatePaths } from "@/lib/actions/revalidation";
import {
    createAdminDeleteOperationId,
    getAdminDeleteErrorMessage,
    initialAdminDeleteActionState,
    type AdminDeleteActionState,
    type AdminDeleteSubject,
    collectAdminDeleteStoragePaths,
} from "@/lib/admin-delete/admin-delete-policies";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { getCurrentCompanyId } from "@/lib/company";
import {
    finalizeStagedPrivateDocumentDeletes,
    restoreStagedPrivateDocumentFiles,
    stagePrivateDocumentFilesForDelete,
    type StagedPrivateDocumentFile,
} from "@/lib/documents/private-document-upload";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type SupabaseServerClient = ReturnType<typeof createServerSupabaseClient>;

type StoragePathRow = {
    file_path?: string | null;
    storage_path?: string | null;
    zugferd_file_path?: string | null;
};

function getFormId(formData: FormData, key: string): string | null {
    const value = formData.get(key);

    if (typeof value !== "string") return null;

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : null;
}

function getActorName(context: Awaited<ReturnType<typeof getCurrentUserContext>>): string {
    return (
        [context.profile.firstName, context.profile.lastName]
            .filter(Boolean)
            .join(" ")
            .trim() ||
        context.profile.email ||
        context.email ||
        "Admin"
    );
}

async function requireAdminDeleteContext() {
    const context = await getCurrentUserContext();

    if (context.profile.role !== "admin") {
        throw new Error("Nur Admins dürfen Datensätze vollständig löschen.");
    }

    return context;
}

async function getDocumentVersionPaths({
    supabase,
    companyId,
    documentIds,
}: {
    supabase: SupabaseServerClient;
    companyId: string;
    documentIds: string[];
}): Promise<string[]> {
    if (documentIds.length === 0) return [];

    const { data, error } = await supabase
        .from("document_versions")
        .select("storage_path")
        .eq("company_id", companyId)
        .in("document_id", documentIds);

    if (error) {
        throw new Error(`Dokumentversionen konnten nicht geprüft werden: ${error.message}`);
    }

    return ((data ?? []) as StoragePathRow[])
        .map((row) => row.storage_path)
        .filter((path): path is string => Boolean(path));
}

async function getSaleStoragePaths({
    supabase,
    companyId,
    saleId,
}: {
    supabase: SupabaseServerClient;
    companyId: string;
    saleId: string;
}): Promise<string[]> {
    const { data: invoicesData, error: invoicesError } = await supabase
        .from("invoices")
        .select("id, pdf_document_id, zugferd_file_path")
        .eq("company_id", companyId)
        .eq("sale_id", saleId);

    if (invoicesError) {
        throw new Error(`Rechnungsartefakte konnten nicht geprüft werden: ${invoicesError.message}`);
    }

    const invoices = (invoicesData ?? []) as Array<{
        id: string;
        pdf_document_id: string | null;
        zugferd_file_path: string | null;
    }>;
    const invoiceIds = invoices.map((invoice) => invoice.id);
    const pdfDocumentIds = invoices
        .map((invoice) => invoice.pdf_document_id)
        .filter((id): id is string => Boolean(id));

    const documentQueries = [
        supabase
            .from("documents")
            .select("id, file_path")
            .eq("company_id", companyId)
            .eq("sale_id", saleId),
    ];

    if (invoiceIds.length > 0) {
        documentQueries.push(
            supabase
                .from("documents")
                .select("id, file_path")
                .eq("company_id", companyId)
                .in("invoice_id", invoiceIds),
        );
    }

    if (pdfDocumentIds.length > 0) {
        documentQueries.push(
            supabase
                .from("documents")
                .select("id, file_path")
                .eq("company_id", companyId)
                .in("id", pdfDocumentIds),
        );
    }

    const documentResults = await Promise.all(documentQueries);
    const documentRows: Array<{ id: string; file_path: string | null }> = [];

    for (const result of documentResults) {
        if (result.error) {
            throw new Error(`Verkaufsdokumente konnten nicht geprüft werden: ${result.error.message}`);
        }

        documentRows.push(...((result.data ?? []) as Array<{ id: string; file_path: string | null }>));
    }

    const documentIds = Array.from(new Set(documentRows.map((document) => document.id)));
    const versionPaths = await getDocumentVersionPaths({ supabase, companyId, documentIds });

    return collectAdminDeleteStoragePaths([
        ...documentRows.map((document) => ({ filePath: document.file_path })),
        ...versionPaths.map((path) => ({ versionStoragePath: path })),
        ...invoices.map((invoice) => ({ zugferdFilePath: invoice.zugferd_file_path })),
    ]);
}

async function getPurchaseStoragePaths({
    supabase,
    companyId,
    purchaseId,
}: {
    supabase: SupabaseServerClient;
    companyId: string;
    purchaseId: string;
}): Promise<string[]> {
    const { data, error } = await supabase
        .from("documents")
        .select("id, file_path")
        .eq("company_id", companyId)
        .eq("purchase_case_id", purchaseId);

    if (error) {
        throw new Error(`Ankaufsdokumente konnten nicht geprüft werden: ${error.message}`);
    }

    const documents = (data ?? []) as Array<{ id: string; file_path: string | null }>;
    const versionPaths = await getDocumentVersionPaths({
        supabase,
        companyId,
        documentIds: documents.map((document) => document.id),
    });

    return collectAdminDeleteStoragePaths([
        ...documents.map((document) => ({ filePath: document.file_path })),
        ...versionPaths.map((path) => ({ versionStoragePath: path })),
    ]);
}

async function getVehicleStoragePaths({
    supabase,
    companyId,
    vehicleId,
}: {
    supabase: SupabaseServerClient;
    companyId: string;
    vehicleId: string;
}): Promise<string[]> {
    const { data, error } = await supabase
        .from("documents")
        .select("id, file_path")
        .eq("company_id", companyId)
        .eq("vehicle_id", vehicleId);

    if (error) {
        throw new Error(`Fahrzeugdokumente konnten nicht geprüft werden: ${error.message}`);
    }

    const documents = (data ?? []) as Array<{ id: string; file_path: string | null }>;
    const versionPaths = await getDocumentVersionPaths({
        supabase,
        companyId,
        documentIds: documents.map((document) => document.id),
    });

    return collectAdminDeleteStoragePaths([
        ...documents.map((document) => ({ filePath: document.file_path })),
        ...versionPaths.map((path) => ({ versionStoragePath: path })),
    ]);
}

async function runAdminHardDelete({
    subject,
    targetId,
    rpcName,
    rpcIdParam,
    storagePaths,
}: {
    subject: AdminDeleteSubject;
    targetId: string;
    rpcName: "admin_delete_sale" | "admin_delete_purchase_case" | "admin_delete_vehicle";
    rpcIdParam: "p_sale_id" | "p_purchase_id" | "p_vehicle_id";
    storagePaths: string[];
}): Promise<void> {
    const supabase = createServerSupabaseClient();
    const companyId = getCurrentCompanyId();
    const context = await requireAdminDeleteContext();
    const operationId = createAdminDeleteOperationId(subject);
    let stagedFiles: StagedPrivateDocumentFile[] = [];
    let databaseDeleteSucceeded = false;

    try {
        stagedFiles = await stagePrivateDocumentFilesForDelete({
            supabase,
            filePaths: storagePaths,
            operationId,
        });

        const { error } = await supabase.rpc(rpcName, {
            p_company_id: companyId,
            [rpcIdParam]: targetId,
            p_actor_auth_user_id: context.authUserId,
            p_actor_name: getActorName(context),
        });

        if (error) {
            throw new Error(error.message);
        }

        databaseDeleteSucceeded = true;
        await finalizeStagedPrivateDocumentDeletes({ supabase, stagedFiles });
    } catch (error) {
        if (!databaseDeleteSucceeded && stagedFiles.length > 0) {
            await restoreStagedPrivateDocumentFiles({ supabase, stagedFiles });
        }

        throw new Error(getAdminDeleteErrorMessage(error));
    }
}

export async function deleteSaleAdminAction(
    _previousState: AdminDeleteActionState = initialAdminDeleteActionState,
    formData: FormData,
): Promise<AdminDeleteActionState> {
    void _previousState;

    const saleId = getFormId(formData, "sale_id");

    if (!saleId) {
        return { success: false, message: "Verkauf fehlt." };
    }

    try {
        await requireAdminDeleteContext();

        const supabase = createServerSupabaseClient();
        const companyId = getCurrentCompanyId();
        const storagePaths = await getSaleStoragePaths({ supabase, companyId, saleId });

        await runAdminHardDelete({
            subject: "sale",
            targetId: saleId,
            rpcName: "admin_delete_sale",
            rpcIdParam: "p_sale_id",
            storagePaths,
        });
    } catch (error) {
        return { success: false, message: getAdminDeleteErrorMessage(error) };
    }

    revalidatePaths([
        "/dashboard/sales",
        "/dashboard/vehicles",
        "/dashboard/invoices",
        "/dashboard/documents",
        "/dashboard/cashbook",
        "/dashboard/activities",
        "/dashboard",
    ]);

    redirect("/dashboard/sales?deleted=1");
}

export async function deletePurchaseAdminAction(
    _previousState: AdminDeleteActionState = initialAdminDeleteActionState,
    formData: FormData,
): Promise<AdminDeleteActionState> {
    void _previousState;

    const purchaseId = getFormId(formData, "purchase_id");

    if (!purchaseId) {
        return { success: false, message: "Ankauf fehlt." };
    }

    try {
        await requireAdminDeleteContext();

        const supabase = createServerSupabaseClient();
        const companyId = getCurrentCompanyId();
        const storagePaths = await getPurchaseStoragePaths({ supabase, companyId, purchaseId });

        await runAdminHardDelete({
            subject: "purchase",
            targetId: purchaseId,
            rpcName: "admin_delete_purchase_case",
            rpcIdParam: "p_purchase_id",
            storagePaths,
        });
    } catch (error) {
        return { success: false, message: getAdminDeleteErrorMessage(error) };
    }

    revalidatePaths([
        "/dashboard/ankauf",
        "/dashboard/vehicles",
        "/dashboard/documents",
        "/dashboard/cashbook",
        "/dashboard/activities",
        "/dashboard",
    ]);

    redirect("/dashboard/ankauf?deleted=1");
}

export async function deleteVehicleAdminAction(
    _previousState: AdminDeleteActionState = initialAdminDeleteActionState,
    formData: FormData,
): Promise<AdminDeleteActionState> {
    void _previousState;

    const vehicleId = getFormId(formData, "vehicle_id");

    if (!vehicleId) {
        return { success: false, message: "Fahrzeug fehlt." };
    }

    try {
        await requireAdminDeleteContext();

        const supabase = createServerSupabaseClient();
        const companyId = getCurrentCompanyId();
        const storagePaths = await getVehicleStoragePaths({ supabase, companyId, vehicleId });

        await runAdminHardDelete({
            subject: "vehicle",
            targetId: vehicleId,
            rpcName: "admin_delete_vehicle",
            rpcIdParam: "p_vehicle_id",
            storagePaths,
        });
    } catch (error) {
        return { success: false, message: getAdminDeleteErrorMessage(error) };
    }

    revalidatePaths([
        "/dashboard/vehicles",
        "/dashboard/documents",
        "/dashboard/activities",
        "/dashboard",
    ]);

    redirect("/dashboard/vehicles?deleted=1");
}
