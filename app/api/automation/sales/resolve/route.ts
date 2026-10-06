import { NextResponse } from "next/server";
import { z } from "zod";

import { authenticateAutomationRequest } from "@/lib/automation/api-auth";
import { automationError, automationUnauthorized } from "@/lib/automation/http";
import { resolveSales, type ResolutionSale } from "@/lib/automation/sale-resolution";
import { createAutomationSupabaseClient } from "@/lib/supabase/automation";

export const runtime = "nodejs";

const schema = z.object({
    saleIdentifier: z.string().trim().max(64).optional(),
    invoiceNumber: z.string().trim().max(100).optional(),
    vin: z.string().trim().max(100).optional(),
    senderEmail: z.string().trim().email().max(320).optional(),
    customerName: z.string().trim().max(200).optional(),
}).refine((value) => Object.values(value).some(Boolean), "Mindestens ein Suchmerkmal ist erforderlich.");

type DbSale = {
    id: string;
    sale_identifier: string;
    sale_number: string | null;
    vehicles: { vin: string | null } | { vin: string | null }[] | null;
    customers: {
        type: "company" | "private" | null;
        company_name: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
    } | Array<{
        type: "company" | "private" | null;
        company_name: string | null;
        first_name: string | null;
        last_name: string | null;
        email: string | null;
    }> | null;
    invoices: { invoice_number: string | null } | { invoice_number: string | null }[] | null;
};

const one = <T,>(value: T | T[] | null): T | null => Array.isArray(value) ? value[0] ?? null : value;
const many = <T,>(value: T | T[] | null): T[] => value ? (Array.isArray(value) ? value : [value]) : [];

export async function POST(request: Request) {
    const context = authenticateAutomationRequest(request);
    if (!context) return automationUnauthorized();

    let payload: unknown;
    try { payload = await request.json(); } catch { return automationError(400, "invalid_json", "Der Request enthält kein gültiges JSON."); }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) return automationError(422, "invalid_request", "Die Suchmerkmale sind ungültig.", parsed.error.flatten().fieldErrors);

    const supabase = createAutomationSupabaseClient();
    const { data, error } = await supabase
        .from("sales")
        .select(`id, sale_identifier, sale_number, vehicles(vin), customers(type, company_name, first_name, last_name, email), invoices(invoice_number)`)
        .eq("company_id", context.companyId);

    if (error) {
        console.error("automation.resolve.query_failed", { code: error.code });
        return automationError(500, "lookup_failed", "Die Verkaufsakten konnten nicht durchsucht werden.");
    }

    const sales: ResolutionSale[] = ((data ?? []) as unknown as DbSale[]).map((row) => {
        const customer = one(row.customers);
        const vehicle = one(row.vehicles);
        const customerName = customer?.type === "company"
            ? customer.company_name
            : [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || null;
        return {
            id: row.id,
            saleIdentifier: row.sale_identifier,
            saleNumber: row.sale_number,
            invoiceNumbers: many(row.invoices).map((invoice) => invoice.invoice_number).filter((value): value is string => Boolean(value)),
            vin: vehicle?.vin ?? null,
            customerName,
            customerEmail: customer?.email ?? null,
        };
    });

    return NextResponse.json(resolveSales(parsed.data, sales));
}
