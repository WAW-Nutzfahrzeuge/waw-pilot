"use client";

import { type RefObject, useEffect, useRef } from "react";

type UseFormActionFeedbackParams = {
    message: string;
    success?: boolean;
    messageRef: RefObject<HTMLElement | null>;
    restoreLastSubmission?: () => void;
};

export function useFormActionFeedback({
    message,
    success = false,
    messageRef,
    restoreLastSubmission,
}: UseFormActionFeedbackParams) {
    const restoreLastSubmissionRef = useRef(restoreLastSubmission);

    useEffect(() => {
        restoreLastSubmissionRef.current = restoreLastSubmission;
    }, [restoreLastSubmission]);

    useEffect(() => {
        if (!message || success) return;

        messageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        messageRef.current?.focus({ preventScroll: true });
        restoreLastSubmissionRef.current?.();
    }, [message, messageRef, success]);
}
