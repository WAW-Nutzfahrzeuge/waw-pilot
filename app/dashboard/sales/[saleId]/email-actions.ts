"use server";

import { getCurrentCompanyId } from "@/lib/company";
import { createEmailRepository } from "@/src/modules/email/infrastructure/factories/email-use-case.factory";
import type { EmailListItemDto } from "@/src/modules/email/application/dto/email.dto";

type LoadMoreSaleEmailsResult = {
    emails: EmailListItemDto[];
    hasMore: boolean;
};

export async function loadMoreSaleEmailHistoryAction(
    saleId: string,
    offset: number,
): Promise<LoadMoreSaleEmailsResult> {
    const normalizedSaleId = saleId.trim();
    const safeOffset = Number.isInteger(offset) && offset >= 0 ? offset : 0;

    if (!normalizedSaleId) {
        return { emails: [], hasMore: false };
    }

    const repository = await createEmailRepository();
    const result = await repository.search({
        companyId: getCurrentCompanyId(),
        contextType: "SALE",
        contextId: normalizedSaleId,
        offset: safeOffset,
        limit: 5,
    });

    return {
        emails: result.emails,
        hasMore: safeOffset + result.emails.length < result.totalCount,
    };
}
