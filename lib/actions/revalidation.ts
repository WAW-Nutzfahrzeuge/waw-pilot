import { revalidatePath } from "next/cache";

type RevalidationPath = string | readonly [path: string, type: "layout" | "page"];

export function revalidatePaths(paths: readonly RevalidationPath[]) {
    for (const entry of paths) {
        if (typeof entry !== "string") {
            revalidatePath(entry[0], entry[1]);
            continue;
        }

        revalidatePath(entry);
    }
}
