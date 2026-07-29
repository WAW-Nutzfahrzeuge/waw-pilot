function SkeletonBlock({ className = "" }: { className?: string }) {
    return (
        <div
            className={`animate-pulse rounded-[1.5rem] bg-slate-200/70 ${className}`}
        />
    );
}

export default function DashboardLoading() {
    return (
        <div className="space-y-6" aria-label="Dashboard wird geladen">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="space-y-3">
                    <SkeletonBlock className="h-3 w-32 rounded-full" />
                    <SkeletonBlock className="h-9 w-72 max-w-full" />
                    <SkeletonBlock className="h-4 w-[28rem] max-w-full" />
                </div>
                <SkeletonBlock className="h-12 w-48" />
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
