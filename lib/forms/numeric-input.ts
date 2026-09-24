/**
 * Zentrale Hilfsfunktionen, damit Zahlen-Eingabefelder weiterhin nur Zahlen
 * akzeptieren, obwohl sie technisch als `type="text"` gerendert werden (statt
 * `type="number"`, damit der Browser keine Auf-/Ab-Pfeile mehr anzeigt).
 *
 * Wird von `components/ui/input.tsx` verwendet und ist bewusst als reine
 * Funktion ausgelagert, damit sie ohne DOM/JSDOM getestet werden kann.
 */

export type NumericInputOptions = {
    /** Erlaubt ein führendes Minuszeichen (Default: nein - keines der aktuellen Felder braucht negative Werte). */
    allowNegative?: boolean;
};

/**
 * Entfernt aus einer Zeichenkette alles, was in einem Zahlenfeld nicht
 * erlaubt ist: behält Ziffern, höchstens einen Dezimaltrenner (Komma wird zu
 * Punkt normalisiert) und optional ein führendes Minuszeichen.
 */
export function sanitizeNumericInputValue(
    rawValue: string,
    { allowNegative = false }: NumericInputOptions = {},
): string {
    const normalized = rawValue.replace(/,/g, ".");
    const isNegative = allowNegative && normalized.trimStart().startsWith("-");

    const digitsAndDots = normalized.replace(/[^0-9.]/g, "");
    const firstDotIndex = digitsAndDots.indexOf(".");

    const sanitizedDigits =
        firstDotIndex === -1
            ? digitsAndDots
            : digitsAndDots.slice(0, firstDotIndex + 1) +
              digitsAndDots.slice(firstDotIndex + 1).replace(/\./g, "");

    return isNegative ? `-${sanitizedDigits}` : sanitizedDigits;
}

export type NumericKeyDownContext = {
    key: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    currentValue: string;
    selectionStart: number | null;
    selectionEnd?: number | null;
} & NumericInputOptions;

/**
 * Entscheidet, ob ein einzelner Tastendruck in einem Zahlenfeld erlaubt ist.
 * Wird `onKeyDown` verwendet, um die Eingabe direkt beim Tippen auf Zahlen
 * (und höchstens einen Dezimaltrenner / ein führendes Minus) zu beschränken -
 * unabhängig davon, ob der Browser Auf-/Ab-Pfeile für `type="number"` anzeigt.
 */
export function isNumericKeyAllowed({
    key,
    ctrlKey = false,
    metaKey = false,
    altKey = false,
    currentValue,
    selectionStart,
    selectionEnd,
    allowNegative = false,
}: NumericKeyDownContext): boolean {
    // Tastenkürzel (Kopieren, Einfügen, Rückgängig, Markieren, ...) unangetastet lassen.
    if (ctrlKey || metaKey || altKey) return true;

    // Steuer-/Navigationstasten (Backspace, Pfeile, Tab, ...) sind mehrzeichige key-Werte und immer erlaubt.
    if (key.length !== 1) return true;

    if (key >= "0" && key <= "9") return true;

    const selectionStartIndex = selectionStart ?? currentValue.length;
    const selectionEndIndex = selectionEnd ?? selectionStartIndex;
    const valueAfterDeletingSelection =
        currentValue.slice(0, selectionStartIndex) + currentValue.slice(selectionEndIndex);

    if (key === "." || key === ",") {
        return !valueAfterDeletingSelection.includes(".") && !valueAfterDeletingSelection.includes(",");
    }

    if (key === "-") {
        return (
            allowNegative &&
            selectionStartIndex === 0 &&
            !valueAfterDeletingSelection.includes("-")
        );
    }

    return false;
}
