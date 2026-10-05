import assert from "node:assert/strict";
import test from "node:test";

import { compareNumberedReferences } from "../lib/sorting/numbered-reference-sort.ts";

test("nummerierte Referenzen werden standardmäßig numerisch aufsteigend sortiert", () => {
    const references = ["026-10", "026-2", "026-9"];

    assert.deepEqual(
        references.toSorted((first, second) =>
            compareNumberedReferences(first, second, "ascending"),
        ),
        ["026-2", "026-9", "026-10"],
    );
});

test("nummerierte Referenzen können absteigend sortiert werden", () => {
    const references = ["EK-2-2026", "EK-10-2026", "EK-9-2026"];

    assert.deepEqual(
        references.toSorted((first, second) =>
            compareNumberedReferences(first, second, "descending"),
        ),
        ["EK-10-2026", "EK-9-2026", "EK-2-2026"],
    );
});

test("Einträge ohne Nummer bleiben unabhängig von der Richtung am Ende", () => {
    const references = [null, "EK-2-2026", "EK-10-2026"];

    assert.equal(
        references.toSorted((first, second) =>
            compareNumberedReferences(first, second, "ascending"),
        ).at(-1),
        null,
    );
    assert.equal(
        references.toSorted((first, second) =>
            compareNumberedReferences(first, second, "descending"),
        ).at(-1),
        null,
    );
});
