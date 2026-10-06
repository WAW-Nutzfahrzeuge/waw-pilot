export type ResolutionSale = {
    id: string;
    saleIdentifier: string;
    saleNumber: string | null;
    invoiceNumbers: string[];
    vin: string | null;
    customerName: string | null;
    customerEmail: string | null;
};

export type ResolutionInput = {
    saleIdentifier?: string | null;
    invoiceNumber?: string | null;
    vin?: string | null;
    senderEmail?: string | null;
    customerName?: string | null;
};

const normalized = (value?: string | null) => value?.trim().toLocaleUpperCase("de-DE") ?? "";
const normalizedVin = (value?: string | null) => normalized(value).replace(/\s+/g, "");
const normalizedEmail = (value?: string | null) => value?.trim().toLowerCase() ?? "";
const normalizedName = (value?: string | null) => normalized(value).replace(/\s+/g, " ");

export function resolveSales(input: ResolutionInput, sales: ResolutionSale[]) {
    const identifier = normalized(input.saleIdentifier);
    const invoiceNumber = normalized(input.invoiceNumber);
    const vin = normalizedVin(input.vin);
    const senderEmail = normalizedEmail(input.senderEmail);
    const customerName = normalizedName(input.customerName);
    const minimal = (sale: ResolutionSale) => ({
        saleId: sale.id,
        saleIdentifier: sale.saleIdentifier,
        saleNumber: sale.saleNumber,
        invoiceNumbers: sale.invoiceNumbers,
        vin: sale.vin,
        customerName: sale.customerName,
    });
    const invoiceMatches = (sale: ResolutionSale) => sale.invoiceNumbers.some((value) => normalized(value) === invoiceNumber);
    const vinMatches = (sale: ResolutionSale) => normalizedVin(sale.vin) === vin;

    if (identifier) {
        const candidates = sales.filter((sale) => normalized(sale.saleIdentifier) === identifier);
        if (candidates.length === 0) return { status: "unmatched" as const, candidates: [] };
        if (candidates.length > 1) return { status: "ambiguous" as const, candidates: candidates.map(minimal) };
        const sale = candidates[0];
        const conflicts = [
            invoiceNumber && !invoiceMatches(sale) ? "invoiceNumber" : null,
            vin && !vinMatches(sale) ? "vin" : null,
        ].filter(Boolean);
        return conflicts.length
            ? { status: "conflict" as const, candidates: [minimal(sale)], conflictingFields: conflicts }
            : { status: "matched" as const, sale: minimal(sale) };
    }

    if (!invoiceNumber && !vin) {
        const soft = sales.filter((sale) =>
            (!senderEmail || normalizedEmail(sale.customerEmail) === senderEmail) &&
            (!customerName || normalizedName(sale.customerName).includes(customerName)),
        );
        return soft.length
            ? { status: "ambiguous" as const, candidates: soft.map(minimal), automaticMatchAllowed: false }
            : { status: "unmatched" as const, candidates: [] };
    }

    const hardInvoice = invoiceNumber ? sales.filter(invoiceMatches) : null;
    const hardVin = vin ? sales.filter(vinMatches) : null;
    let candidates = hardInvoice ?? hardVin ?? [];

    if (hardInvoice && hardVin) {
        const vinIds = new Set(hardVin.map((sale) => sale.id));
        candidates = hardInvoice.filter((sale) => vinIds.has(sale.id));
        if (candidates.length === 0 && (hardInvoice.length || hardVin.length)) {
            return { status: "conflict" as const, candidates: [...hardInvoice, ...hardVin].filter((sale, i, all) => all.findIndex((item) => item.id === sale.id) === i).map(minimal), conflictingFields: ["invoiceNumber", "vin"] };
        }
    }

    if (candidates.length === 1) return { status: "matched" as const, sale: minimal(candidates[0]) };
    const hardCandidates = candidates;
    if (senderEmail) candidates = candidates.filter((sale) => normalizedEmail(sale.customerEmail) === senderEmail);
    if (customerName) candidates = candidates.filter((sale) => normalizedName(sale.customerName).includes(customerName));
    if (candidates.length === 0 && hardCandidates.length > 0) candidates = hardCandidates;
    if (candidates.length === 1) return { status: "matched" as const, sale: minimal(candidates[0]) };
    if (candidates.length > 1) return { status: "ambiguous" as const, candidates: candidates.map(minimal) };
    return { status: "unmatched" as const, candidates: [] };
}
