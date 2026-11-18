import { Suspense } from "react";
import { P2PDashboardShell } from "@/features/p2p-ledger/components/p2p-dashboard-shell";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen w-full items-center justify-center bg-[#F4F7F9] px-4 font-mono text-xs font-semibold text-slate-500 dark:bg-[#0B0E11] dark:text-[#848E9C]">
          <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xs dark:border-[#2B3139] dark:bg-[#181A20]">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent dark:border-[#FCD535] dark:border-t-transparent" />
            <span>Sincronizando Terminal P2P...</span>
          </div>
        </div>
      }
    >
      <P2PDashboardShell />
    </Suspense>
  );
}
