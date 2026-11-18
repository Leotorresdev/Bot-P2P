export default function Loading() {
  return (
    <div className="min-h-screen w-full bg-[#F4F7F9] transition-colors dark:bg-[#0B0E11]">
      <div className="mx-auto flex w-full max-w-[1536px] flex-col gap-4 px-3 py-4 sm:px-6 sm:py-6">
        <div className="h-[72px] w-full animate-pulse rounded-2xl border border-slate-200/80 bg-white dark:border-[#2B3139] dark:bg-[#181A20]" />
        <div className="h-[58px] w-full animate-pulse rounded-2xl border border-slate-200/80 bg-white dark:border-[#2B3139] dark:bg-[#181A20]" />
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
          <div className="h-[460px] animate-pulse rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-[#2B3139] dark:bg-[#181A20] lg:col-span-6">
            <div className="h-full w-full rounded-xl bg-slate-100 dark:bg-[#1E2329]" />
          </div>
          <div className="h-[460px] animate-pulse rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-[#2B3139] dark:bg-[#181A20] lg:col-span-6">
            <div className="h-full w-full rounded-xl bg-slate-100 dark:bg-[#1E2329]" />
          </div>
        </div>
      </div>
    </div>
  );
}
