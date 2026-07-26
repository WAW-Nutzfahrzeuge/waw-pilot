import type { SupabaseClient } from "@supabase/supabase-js";

export class SupabaseDocumentStorage {
    constructor(private readonly supabase: SupabaseClient) {}

    async download(params: {
        bucket: string;
        path: string;
    }): Promise<Uint8Array | null> {
        const { data, error } = await this.supabase.storage
            .from(params.bucket)
            .download(params.path);

        if (error || !data) {
            return null;
        }

        return new Uint8Array(await data.arrayBuffer());
    }
}
