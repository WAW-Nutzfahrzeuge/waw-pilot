import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
    evaluateVehiclePurchaseEligibility,
    getVehiclePurchaseAction,
    resolvePurchasePrefillVehicleId,
} from "../lib/purchases/vehicle-purchase-eligibility.ts";

const companyVehicles = [
    { id: "vehicle-1", disabled: false },
    { id: "vehicle-already-purchased", disabled: true },
    { id: "vehicle-sold", disabled: true },
];

// TEST B: Fahrzeugbestand -> vorhandenes Fahrzeug -> Ankaufen
test("purchase create preselects a purchasable vehicle from the current company vehicle list", () => {
    assert.equal(
        resolvePurchasePrefillVehicleId(companyVehicles, "vehicle-1"),
        "vehicle-1",
    );
});

// TEST G: manipulierte vehicleId einer anderen Company
test("purchase create ignores missing or cross-company vehicle ids", () => {
    assert.equal(
        resolvePurchasePrefillVehicleId(companyVehicles, "other-company-vehicle"),
        null,
    );
    assert.equal(resolvePurchasePrefillVehicleId(companyVehicles, null), null);
    assert.equal(resolvePurchasePrefillVehicleId(companyVehicles, undefined), null);
});

// TEST F: Fahrzeug mit bestehendem Ankauf -> kein zweiter Ankauf möglich
test("purchase create does not preselect a vehicle that already has a purchase", () => {
    assert.equal(
        resolvePurchasePrefillVehicleId(companyVehicles, "vehicle-already-purchased"),
        null,
    );
});

test("purchase create does not preselect a sold vehicle", () => {
    assert.equal(resolvePurchasePrefillVehicleId(companyVehicles, "vehicle-sold"), null);
});

test("purchase eligibility rejects a vehicle that already has an active purchase", () => {
    assert.deepEqual(
        evaluateVehiclePurchaseEligibility({
            status: "in_stock",
            hasExistingPurchase: true,
        }),
        {
            eligible: false,
            reason: "Für dieses Fahrzeug existiert bereits ein Ankauf.",
        },
    );
});

test("purchase eligibility rejects an already sold vehicle", () => {
    const result = evaluateVehiclePurchaseEligibility({
        status: "sold",
        hasExistingPurchase: false,
    });

    assert.equal(result.eligible, false);
    assert.ok(result.reason?.includes("verkauft"));
});

test("purchase eligibility allows an in-stock vehicle without an existing purchase", () => {
    assert.deepEqual(
        evaluateVehiclePurchaseEligibility({
            status: "in_stock",
            hasExistingPurchase: false,
        }),
        { eligible: true, reason: null },
    );
});

// TEST B / section 10: bestehendes Fahrzeug vorauswählen (vehicle detail action)
test("vehicle detail offers starting a purchase for an eligible vehicle without existing purchase", () => {
    assert.deepEqual(
        getVehiclePurchaseAction({
            id: "vehicle-1",
            status: "in_stock",
            purchase_id: null,
        }),
        {
            kind: "create",
            href: "/dashboard/ankauf/new?vehicleId=vehicle-1",
            label: "Fahrzeug ankaufen",
        },
    );
});

// TEST F: vehicle detail must link the existing purchase instead of offering a duplicate one
test("vehicle detail links the existing purchase instead of offering a duplicate purchase", () => {
    assert.deepEqual(
        getVehiclePurchaseAction({
            id: "vehicle-1",
            status: "in_stock",
            purchase_id: "purchase-1",
        }),
        {
            kind: "open",
            href: "/dashboard/ankauf/purchase-1",
            label: "Ankauf öffnen",
        },
    );
});

test("vehicle detail hides purchase action for a sold vehicle without an existing purchase", () => {
    assert.deepEqual(
        getVehiclePurchaseAction({
            id: "vehicle-1",
            status: "sold",
            purchase_id: null,
        }),
        { kind: "none" },
    );
});

// TEST A / TEST C: menu "Fahrzeug ankaufen" and Fahrzeugbestand "neues Fahrzeug ankaufen"
// both server-side-validated vehicleId handling and the central action are reused.
test("central ankauf/new page resolves and validates vehicleId server-side via the shared eligibility helper", () => {
    const source = readFileSync("app/dashboard/ankauf/new/page.tsx", "utf8");

    assert.equal(source.includes("resolvePurchasePrefillVehicleId"), true);
    assert.equal(source.includes("getPurchaseFormData"), true);
    assert.equal(source.includes("PurchaseForm"), true);
});

// TEST D / TEST E: unified entry points must funnel into the same createPurchaseCaseAction
// (single source of truth for seller, tax and payment-status handling / Kassenbuch impact).
test("purchase form always submits through the single central createPurchaseCaseAction", () => {
    const source = readFileSync("components/purchases/purchase-form.tsx", "utf8");

    assert.equal(source.includes("createPurchaseCaseAction"), true);
});

test("vehicle-only create flow no longer writes to the legacy purchases table", () => {
    const source = readFileSync("app/dashboard/vehicles/new/actions.ts", "utf8");

    assert.equal(source.includes('.from("purchases")'), false);
    assert.equal(source.includes("seller_customer_id: null"), true);
});
