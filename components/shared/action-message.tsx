import { forwardRef } from "react";
import { CheckCircle2, FileWarning } from "lucide-react";

type ActionMessageTone = "success" | "danger";

type ActionMessageProps = {
    title: string;
    description?: string;
    tone?: ActionMessageTone;
    compact?: boolean;
};

export const ActionMessage = forwardRef<HTMLDivElement, ActionMessageProps>(
    function ActionMessage(
        { title, description, tone = "success", compact = false },
        ref,
    ) {
        const Icon = tone === "danger" ? FileWarning : CheckCircle2;
        const styles =
            tone === "danger"
                ? {
                    container: "border-red-200 bg-red-50",
                    iconBox: "bg-red-100 text-red-700",
                    title: "text-red-950",
                    description: "text-red-800",
                    focus: "focus:ring-red-100",
                }
                : {
                    container: "border-emerald-200 bg-emerald-50",
                    iconBox: "bg-emerald-100 text-emerald-700",
                    title: "text-emerald-950",
                    description: "text-emerald-800",
                    focus: "focus:ring-emerald-100",
                };

        return (
            <div
                ref={ref}
                role={tone === "danger" ? "alert" : "status"}
                tabIndex={-1}
                className={`scroll-mt-6 rounded-[1.5rem] border p-4 shadow-sm outline-none focus:ring-4 ${styles.container} ${styles.focus}`}
            >
                <div className="flex items-start gap-3">
                    <div
                        className={`flex shrink-0 items-center justify-center rounded-2xl ${styles.iconBox} ${
                            compact ? "size-8" : "size-10"
                        }`}
                    >
                        <Icon className={compact ? "size-4" : "size-5"} />
                    </div>

                    <div>
                        <p
                            className={`font-extrabold ${styles.title} ${
                                compact ? "text-sm" : ""
                            }`}
                        >
                            {title}
                        </p>

                        {description ? (
                            <p
                                className={`mt-1 font-semibold ${styles.description} ${
                                    compact ? "text-xs leading-5" : "text-sm"
                                }`}
                            >
                                {description}
                            </p>
                        ) : null}
                    </div>
                </div>
            </div>
        );
    },
);
