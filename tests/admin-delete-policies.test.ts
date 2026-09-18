import assert from "node:assert/strict";
import test from "node:test";

import {
    assertAdminCanDelete,
    collectAdminDeleteStoragePaths,
    getVehicleDeleteBlockers,
} from "../lib/admin-delete/admin-delete-policies.ts";
import {
    finalizeStagedPrivateDocumentDeletes,
    stagePrivateDocumentFilesForDelete,
} from "../lib/documents/private-document-upload.ts";

test("admin delete guard accepts admins and rejects employees", () => {
    assert.doesNotThrow(() => assertAdminCanDelete("admin"));
    assert.throws(() => assertAdminCanDelete("employee"), /Nur Admins/);
});

test("admin delete storage paths are deduplicated across documents, versions and ZUGFeRD", () => {
    assert.deepEqual(
        collectAdminDeleteStoragePaths([
            { filePath: "invoices/026-032.pdf" },
            { versionStoragePath: "invoices/026-032.pdf" },
            { zugferdFilePath: "zugferd/026-032.xml" },
            { filePath: null },
        ]),
        ["invoices/026-032.pdf", "zugferd/026-032.xml"],
    );
});

test("vehicle delete blockers describe critical vehicle relations", () => {
    assert.deepEqual(
        getVehicleDeleteBlockers({
            purchases: 1,
            sales: 2,
            invoices: 1,
            cashbookEntries: 0,
            financialEntries: 3,
        }),
        ["1 Ankauf", "2 Verkäufe", "1 Rechnung", "3 Finanzbuchungen"],
    );
});

test("storage staging moves files to trash and final cleanup removes only trash paths", async () => {
    const calls: Array<[string, string, string?]> = [];
    const supabase = {
        storage: {
            from(bucket: string) {
                return {
                    async move(from: string, to: string) {
                        calls.push(["move", bucket, `${from}->${to}`]);
                        return { error: null };
                    },
                    async remove(paths: string[]) {
                        calls.push(["remove", bucket, paths.join("|")]);
                        return { error: null };
                    },
                };
            },
        },
    };

    const staged = await stagePrivateDocumentFilesForDelete({
        supabase: supabase as never,
        operationId: "sale-test",
        filePaths: ["sales/a.pdf", "sales/a.pdf", "sales/b.pdf"],
    });

    assert.deepEqual(staged, [
        {
            originalPath: "sales/a.pdf",
            trashPath: "admin-delete-trash/sale-test/sales/a.pdf",
        },
        {
            originalPath: "sales/b.pdf",
            trashPath: "admin-delete-trash/sale-test/sales/b.pdf",
        },
    ]);

    await finalizeStagedPrivateDocumentDeletes({
        supabase: supabase as never,
        stagedFiles: staged,
    });

    assert.deepEqual(calls, [
        ["move", "documents", "sales/a.pdf->admin-delete-trash/sale-test/sales/a.pdf"],
        ["move", "documents", "sales/b.pdf->admin-delete-trash/sale-test/sales/b.pdf"],
        [
            "remove",
            "documents",
            "admin-delete-trash/sale-test/sales/a.pdf|admin-delete-trash/sale-test/sales/b.pdf",
        ],
    ]);
});

test("storage staging compensates already moved files when a later move fails", async () => {
    const calls: Array<[string, string, string?]> = [];
    const supabase = {
        storage: {
            from(bucket: string) {
                return {
                    async move(from: string, to: string) {
                        calls.push(["move", bucket, `${from}->${to}`]);

                        if (from === "sales/b.pdf") {
                            return { error: { message: "permission denied" } };
                        }

                        return { error: null };
                    },
                };
            },
        },
    };

    await assert.rejects(
        stagePrivateDocumentFilesForDelete({
            supabase: supabase as never,
            operationId: "sale-test",
            filePaths: ["sales/a.pdf", "sales/b.pdf"],
        }),
        /Storage-Datei konnte nicht vorbereitet werden/,
    );

    assert.deepEqual(calls, [
        ["move", "documents", "sales/a.pdf->admin-delete-trash/sale-test/sales/a.pdf"],
        ["move", "documents", "sales/b.pdf->admin-delete-trash/sale-test/sales/b.pdf"],
        ["move", "documents", "admin-delete-trash/sale-test/sales/a.pdf->sales/a.pdf"],
    ]);
});
