import * as React from "react"

import { isNumericKeyAllowed, sanitizeNumericInputValue } from "@/lib/forms/numeric-input"
import { cn } from "@/lib/utils"

function Input({ className, type, onKeyDown, onPaste, ...props }: React.ComponentProps<"input">) {
  // "number"-Felder werden bewusst als Textfeld gerendert, damit der Browser
  // keine Auf-/Ab-Pfeile mehr zeigt. Die Eingabe bleibt trotzdem auf Zahlen
  // beschränkt (siehe lib/forms/numeric-input.ts).
  const isNumericField = type === "number"
  const allowNegative = isNumericField && props.min !== undefined && Number(props.min) < 0

  const handleNumericKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const target = event.currentTarget
    const allowed = isNumericKeyAllowed({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      currentValue: target.value,
      selectionStart: target.selectionStart,
      selectionEnd: target.selectionEnd,
      allowNegative,
    })

    if (!allowed) {
      event.preventDefault()
    }

    onKeyDown?.(event)
  }

  const handleNumericPaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault()

    const target = event.currentTarget
    const pastedText = event.clipboardData.getData("text")
    const selectionStart = target.selectionStart ?? target.value.length
    const selectionEnd = target.selectionEnd ?? selectionStart
    const combinedValue =
      target.value.slice(0, selectionStart) + pastedText + target.value.slice(selectionEnd)
    const sanitizedValue = sanitizeNumericInputValue(combinedValue, { allowNegative })

    // React trackt den Wert kontrollierter Inputs über den nativen Setter -
    // ein direktes `target.value = ...` würde `onChange` nicht auslösen.
    const nativeValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set
    nativeValueSetter?.call(target, sanitizedValue)
    target.dispatchEvent(new Event("input", { bubbles: true }))

    onPaste?.(event)
  }

  return (
    <input
      type={isNumericField ? "text" : type}
      inputMode={isNumericField ? "decimal" : undefined}
      data-slot="input"
      onKeyDown={isNumericField ? handleNumericKeyDown : onKeyDown}
      onPaste={isNumericField ? handleNumericPaste : onPaste}
      className={cn(
        "h-9 w-full min-w-0 rounded-xl border border-input bg-white/80 px-3 py-1 text-base shadow-sm shadow-slate-200/40 transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-cyan-400 focus-visible:ring-3 focus-visible:ring-cyan-500/15 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
