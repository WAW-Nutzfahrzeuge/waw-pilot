import { readFile } from "node:fs/promises";
import path from "node:path";

const wawLogoPath = path.join(process.cwd(), "public", "brand", "waw-logo.png");

let wawLogoBytesPromise: Promise<Uint8Array> | null = null;

export function getWawLogoBytes(): Promise<Uint8Array> {
    if (!wawLogoBytesPromise) {
        wawLogoBytesPromise = readFile(wawLogoPath).catch((error: unknown) => {
            wawLogoBytesPromise = null;
            throw error;
        });
    }

    return wawLogoBytesPromise;
}
