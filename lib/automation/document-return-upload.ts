import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const automationReturnDocumentTypes = ["entry_certificate", "transport_proof", "handover_protocol"] as const;
export const automationSignatureStatuses = ["present", "absent", "uncertain"] as const;
export const automationReviewStatuses = ["pending", "needs_review", "accepted", "rejected"] as const;
export const maxAutomationPdfBytes = 10 * 1024 * 1024;

export type ReturnDocumentType = (typeof automationReturnDocumentTypes)[number];
export type SignatureStatus = (typeof automationSignatureStatuses)[number];
export type ReviewStatus = (typeof automationReviewStatuses)[number];

export function sanitizeAutomationFileName(value: string): string {
    const cleaned = value.trim().replace(/[\\/]/g, "-").replace(/[^\p{L}\p{N}._ -]/gu, "").replace(/\s+/g, "-");
    return (cleaned || "ruecklauf.pdf").slice(-160);
}

export function isPdf(bytes: Buffer): boolean {
    return bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
}

export function parsePageNumbers(value: string | null): number[] | null {
    if (!value?.trim()) return null;
    const pages = value.split(",").map((part) => Number(part.trim()));
    if (pages.some((page) => !Number.isSafeInteger(page) || page < 1) || new Set(pages).size !== pages.length) return null;
    return pages;
}

export function createUploadFingerprint(bytes: Buffer, metadata: Record<string, unknown>) {
    const fileHash = createHash("sha256").update(bytes).digest("hex");
    const fingerprint = createHash("sha256").update(fileHash).update(JSON.stringify(metadata, Object.keys(metadata).sort())).digest("hex");
    return { fileHash, fingerprint };
}

type ClaimResult =
    | { kind: "claimed"; id: string }
    | { kind: "replay"; row: Record<string, unknown> }
    | { kind: "processing"; id: string }
    | { kind: "conflict" };

export async function claimUpload(params: {
    supabase: SupabaseClient;
    row: Record<string, unknown> & { company_id: string; idempotency_key: string; request_fingerprint: string };
}): Promise<ClaimResult> {
    const { data, error } = await params.supabase.from("automation_return_uploads").insert(params.row).select("*").single();
    if (!error && data) return { kind: "claimed", id: String(data.id) };
    if (error?.code !== "23505") throw new Error(`claim_failed:${error?.code ?? "unknown"}`);

    const { data: existing, error: readError } = await params.supabase
        .from("automation_return_uploads")
        .select("*")
        .eq("company_id", params.row.company_id)
        .eq("idempotency_key", params.row.idempotency_key)
        .single();
    if (readError || !existing) throw new Error(`claim_read_failed:${readError?.code ?? "unknown"}`);
    if (existing.request_fingerprint !== params.row.request_fingerprint) return { kind: "conflict" };
    if (existing.processing_status === "completed") return { kind: "replay", row: existing };
    if (existing.processing_status === "processing") {
        const updatedAt = Date.parse(String(existing.updated_at ?? existing.created_at ?? ""));
        const stale = Number.isFinite(updatedAt) && Date.now() - updatedAt > 15 * 60 * 1000;
        if (!stale) return { kind: "processing", id: String(existing.id) };

        const { data: reclaimed, error: reclaimError } = await params.supabase
            .from("automation_return_uploads")
            .update({ updated_at: new Date().toISOString(), error_code: null })
            .eq("id", existing.id)
            .eq("processing_status", "processing")
            .eq("updated_at", existing.updated_at)
            .select("id")
            .maybeSingle();
        if (reclaimError) throw new Error(`claim_reclaim_failed:${reclaimError.code}`);
        return reclaimed ? { kind: "claimed", id: String(reclaimed.id) } : { kind: "processing", id: String(existing.id) };
    }

    const { data: resumed, error: resumeError } = await params.supabase
        .from("automation_return_uploads")
        .update({ processing_status: "processing", error_code: null, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .eq("processing_status", "failed")
        .select("id")
        .maybeSingle();
    if (resumeError) throw new Error(`claim_resume_failed:${resumeError.code}`);
    return resumed ? { kind: "claimed", id: String(resumed.id) } : { kind: "processing", id: String(existing.id) };
}

export async function markUploadFailed(supabase: SupabaseClient, uploadId: string, errorCode: string) {
    await supabase.from("automation_return_uploads").update({
        processing_status: "failed",
        error_code: errorCode,
        updated_at: new Date().toISOString(),
    }).eq("id", uploadId);
}
