import { createAuthServerSupabaseClient } from "@/lib/supabase/auth-server";
import { SupabaseDocumentRepository } from "@/src/modules/documents/infrastructure/repositories/supabase-document.repository";
import { SendEmailUseCase } from "@/src/modules/email/application/use-cases/send-email.use-case";
import { SupabaseDocumentAttachmentReader } from "@/src/modules/email/infrastructure/attachments/supabase-document-attachment.reader";
import { SupabaseEmailRepository } from "@/src/modules/email/infrastructure/persistence/repositories/supabase-email.repository";
import { ResendEmailProvider } from "@/src/modules/email/infrastructure/providers/resend/resend-email.provider";
import { SupabaseEmailAuditAdapter } from "@/src/modules/email/infrastructure/logging/supabase-email-audit.adapter";
import { EmailActivityAdapter } from "@/src/modules/email/infrastructure/logging/email-activity.adapter";

export async function createSendEmailUseCase(): Promise<SendEmailUseCase> {
    const supabase = await createAuthServerSupabaseClient();
    const documentRepository = new SupabaseDocumentRepository(supabase);

    return new SendEmailUseCase(
        new SupabaseEmailRepository(supabase),
        new SupabaseDocumentAttachmentReader(supabase, documentRepository),
        new ResendEmailProvider(),
        new SupabaseEmailAuditAdapter(supabase),
        new EmailActivityAdapter(),
    );
}

export async function createEmailRepository(): Promise<SupabaseEmailRepository> {
    return new SupabaseEmailRepository(await createAuthServerSupabaseClient());
}
