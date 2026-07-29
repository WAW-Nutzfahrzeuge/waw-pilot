export type FormSnapshotValue = string | boolean | string[];

export type FormSnapshot = Record<string, FormSnapshotValue>;

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
    const prototype = Object.getPrototypeOf(element) as HTMLInputElement | HTMLTextAreaElement;
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
        prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
        valueSetter.call(element, value);
    } else {
        element.value = value;
    }
}

function notifyFieldChanged(element: HTMLElement) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
}

export function captureFormSnapshot(form: HTMLFormElement): FormSnapshot {
    const snapshot: FormSnapshot = {};
    const fields = Array.from(
        form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
            "input[name], select[name], textarea[name]",
        ),
    );

    for (const field of fields) {
        if (field.disabled || field.type === "file") continue;

        const name = field.name;

        if (field instanceof HTMLInputElement && field.type === "checkbox") {
            snapshot[name] = field.checked;
            continue;
        }

        if (field instanceof HTMLInputElement && field.type === "radio") {
            if (field.checked) snapshot[name] = field.value;
            continue;
        }

        if (field instanceof HTMLSelectElement && field.multiple) {
            snapshot[name] = Array.from(field.selectedOptions).map((option) => option.value);
            continue;
        }

        snapshot[name] = field.value;
    }

    return snapshot;
}

export function restoreFormSnapshot(form: HTMLFormElement, snapshot: FormSnapshot) {
    for (const [name, value] of Object.entries(snapshot)) {
        const selectorName = CSS.escape(name);
        const fields = Array.from(
            form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
                `[name="${selectorName}"]`,
            ),
        );

        for (const field of fields) {
            if (field.disabled || field.type === "file") continue;

            if (field instanceof HTMLInputElement && field.type === "checkbox") {
                field.checked = Boolean(value);
                notifyFieldChanged(field);
                continue;
            }

            if (field instanceof HTMLInputElement && field.type === "radio") {
                field.checked = field.value === value;
                notifyFieldChanged(field);
                continue;
            }

            if (field instanceof HTMLSelectElement && field.multiple) {
                const selectedValues = Array.isArray(value) ? value : [];
                for (const option of Array.from(field.options)) {
                    option.selected = selectedValues.includes(option.value);
                }
                notifyFieldChanged(field);
                continue;
            }

            if (typeof value === "string") {
                if (field instanceof HTMLSelectElement) {
                    field.value = value;
                } else {
                    setNativeValue(field, value);
                }
                notifyFieldChanged(field);
            }
        }
    }
}
