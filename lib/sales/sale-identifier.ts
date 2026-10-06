export function ensureSaleIdentifierInSubject(
    subject: string,
    saleIdentifier: string,
): string {
    const identifier = saleIdentifier.trim();
    if (!identifier || subject.toLocaleUpperCase().includes(identifier.toLocaleUpperCase())) {
        return subject;
    }

    return `${subject} · ${identifier}`;
}

export function ensureSaleIdentifierInEmailText(
    text: string,
    saleIdentifier: string,
    language: string,
): string {
    const identifier = saleIdentifier.trim();
    if (!identifier || text.toLocaleUpperCase().includes(identifier.toLocaleUpperCase())) {
        return text;
    }

    const note =
        language === "de"
            ? `Bitte geben Sie bei Rückfragen und bei der Rücksendung die Verkaufskennung ${identifier} an.`
            : `For questions and when returning the documents, please quote the sales identifier ${identifier}.`;

    return `${text.trimEnd()}\n\n${note}`;
}

