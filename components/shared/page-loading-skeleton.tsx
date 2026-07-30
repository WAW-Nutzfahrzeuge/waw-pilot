function SkeletonBlock({ className = "" }: { className?: string }) {
    return (
        <div
            className={`animate-pulse rounded-[1.5rem] bg-slate-200/70 ${className}`}
        />
    );
}

export function PageLoadingSkeleton({
    actionWidth = "w-48",
}: {
    actionWidth?: string;
}) {
    return (
        <div className="space-y-6" aria-label="Seite wird geladen">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="space-y-3">
                    <SkeletonBlock className="h-3 w-32 rounded-full" />
                    <SkeletonBlock className="h-9 w-72 max-w-full" />
                    <SkeletonBlock className="h-4 w-[28rem] max-w-full" />
                </div>
                <SkeletonBlock className={`h-12 ${actionWidth}`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
                <SkeletonBlock className="h-32" />
                <SkeletonBlock className="h-32" />
                <SkeletonBlock className="h-32" />
            </div>

            <SkeletonBlock className="h-[28rem]" />
        </div>
    );
}

export function DetailLoadingSkeleton() {
    return (
        <div className="space-y-6" aria-label="Detailansicht wird geladen">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                    <SkeletonBlock className="h-3 w-28 rounded-full" />
                    <SkeletonBlock className="h-10 w-80 max-w-full" />
                    <SkeletonBlock className="h-4 w-[32rem] max-w-full" />
                </div>
                <div className="flex flex-wrap gap-3">
                    <SkeletonBlock className="h-11 w-36" />
                    <SkeletonBlock className="h-11 w-44" />
                </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,0.9fr)]">
                <div className="space-y-5">
                    <SkeletonBlock className="h-52" />
                    <SkeletonBlock className="h-44" />
                </div>
                <div className="space-y-5">
                    <SkeletonBlock className="h-56" />
                    <SkeletonBlock className="h-40" />
                </div>
            </div>

            <SkeletonBlock className="h-64" />
        </div>
    );
}
