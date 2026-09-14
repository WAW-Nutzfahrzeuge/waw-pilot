import test from "node:test";
import assert from "node:assert/strict";

import { selectCurrentVehicleDocument } from "../lib/vehicles/vehicle-document-selection.ts";

const document = (overrides: Partial<Parameters<typeof selectCurrentVehicleDocument>[0][number]> = {}) => ({
    id: "document-1",
    document_type: "vehicle_registration",
    file_path: "vehicles/vehicle-1/registration.pdf",
    status: "available" as const,
    created_at: "2026-09-14T10:00:00.000Z",
    ...overrides,
});

test("vehicle registration is available after reload when a persistent file exists", () => {
    const current = selectCurrentVehicleDocument(
        [document()],
        "vehicle_registration",
    );

    assert.equal(current?.id, "document-1");
});

test("the newest persistent vehicle registration is selected deterministically", () => {
    const current = selectCurrentVehicleDocument(
        [
            document({ id: "older", created_at: "2026-09-14T10:00:00.000Z" }),
            document({ id: "newer", created_at: "2026-09-14T11:00:00.000Z" }),
        ],
        "vehicle_registration",
    );

    assert.equal(current?.id, "newer");
});

test("missing or incomplete documents do not make the replace action appear", () => {
    const current = selectCurrentVehicleDocument(
        [
            document({ id: "missing", file_path: null, status: "missing" }),
            document({ id: "wrong-type", document_type: "purchase_invoice" }),
        ],
        "vehicle_registration",
    );

    assert.equal(current, null);
});
