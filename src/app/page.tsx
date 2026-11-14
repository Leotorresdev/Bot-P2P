import { Suspense } from "react";
import { P2PDashboardShell } from "@/features/p2p-ledger/components/p2p-dashboard-shell";

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-alpine-snow font-mono text-sm text-alpine-muted dark:bg-[#0B0E11] dark:text-[#848E9C]">
          Sincronizando Bóveda Contable P2P...
        </div>
      }
    >
      <P2PDashboardShell />
    </Suspense>
  );
}
