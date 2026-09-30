"use client";

import { useActionState, useEffect, useRef } from "react";
import { Mail, Send } from "lucide-react";
import { useRouter } from "next/navigation";

import {
    sendEndUseDeclarationEmailAction,
    type SendStampDocumentsEmailState,
} from "@/app/dashboard/sales/[saleId]/stamp-documents-email-actions";
import { Button } from "@/components/ui/button";

const initialState: SendStampDocumentsEmailState = {
    success: false,
    message: "",
};

export function SendEndUseDeclarationEmailButton({ saleId }: { saleId: string }) {
    const [state, formAction, isPending] = useActionState(
        sendEndUseDeclarationEmailAction,
        initialState,
    );
    const router = useRouter();
    const successHandledRef = useRef(false);

    useEffect(() => {
        if (!state.success || successHandledRef.current) return;

        successHandledRef.current = true;
        router.refresh();
    }, [router, state.success]);

    return (
        <form action={formAction} className="mt-2">
            <input type="hidden" name="sale_id" value={saleId} />
            <Button
                type="submit"
                disabled={isPending}
                variant="outline"
                className="h-10 w-full rounded-2xl border-cyan-200 bg-white font-extrabold text-cyan-800 hover:bg-cyan-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {isPending ? (
                    <Send className="mr-2 size-4 animate-pulse" />
                ) : (
                    <Mail className="mr-2 size-4" />
                )}
                {isPending ? "Wird gesendet..." : "E-Mail senden"}
            </Button>

            {state.message ? (
                <p
                    className={`mt-2 text-center text-xs font-bold leading-5 ${
                        state.success ? "text-emerald-700" : "text-red-700"
                    }`}
                    role="status"
                >
                    {state.message}
                </p>
            ) : null}
        </form>
    );
}
