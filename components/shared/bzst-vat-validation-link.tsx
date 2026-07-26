import { ExternalLink } from "lucide-react";

import { BZST_VAT_VALIDATION_URL } from "@/src/modules/documents/domain/constants/external-document-links";

export function BzstVatValidationLink({ className = "" }: { className?: string }) {
    return (
        <a
            href={BZST_VAT_VALIDATION_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-start gap-2 rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs font-bold leading-5 text-cyan-800 transition hover:border-cyan-200 hover:bg-cyan-100 focus:outline-none focus:ring-4 focus:ring-cyan-100 ${className}`}
        >
            <ExternalLink className="mt-0.5 size-4 shrink-0" />
            <span className="break-all">{BZST_VAT_VALIDATION_URL}</span>
        </a>
    );
}
