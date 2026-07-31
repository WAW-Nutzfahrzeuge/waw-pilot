import { NextResponse } from "next/server";

import { getCurrentCompanyId } from "@/lib/company";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
    ExportSaleFileUseCase,
    SaleFileExportError,
} from "@/src/modules/documents/application/use-cases/export-sale-file.use-case";

export const runtime = "nodejs";

type RouteContext = {
    params: Promise<{
        saleId: string;
    }>;
};

function createContentDispositionFileName(fileName: string): string {
    return fileName.replace(/["\r\n]/g, "");
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
    return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
}

export async function GET(_request: Request, context: RouteContext) {
    const { saleId } = await context.params;
    const companyId = getCurrentCompanyId();
    const supabase = createServerSupabaseClient();
    const useCase = new ExportSaleFileUseCase(supabase);

    try {
        const result = await useCase.execute({
            companyId,
            saleId,
        });
        const fileName = createContentDispositionFileName(result.fileName);

        return new NextResponse(toArrayBuffer(result.archive), {
            headers: {
                "Content-Type": result.contentType,
                "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
                "Cache-Control": "no-store",
            },
        });
    } catch (error) {
        const status = error instanceof SaleFileExportError ? error.statusCode : 500;
        const message =
            error instanceof Error
                ? error.message
                : "Verkaufsakte konnte nicht heruntergeladen werden.";

        return NextResponse.json({ message }, { status });
    }
}
