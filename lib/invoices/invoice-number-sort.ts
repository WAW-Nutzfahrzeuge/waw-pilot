/**
 * Sorts invoice numbers as people read them, not lexicographically.
 * For example, 026-9 comes before 026-10.
 */
export function compareInvoiceNumbersAscending(
    firstInvoiceNumber: string,
    secondInvoiceNumber: string,
): number {
    return firstInvoiceNumber.localeCompare(secondInvoiceNumber, "de", {
        numeric: true,
        sensitivity: "base",
    });
}
