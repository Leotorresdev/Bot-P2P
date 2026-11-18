"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F4F7F9] p-6 dark:bg-[#0B0E11]">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-[#2B3139] dark:bg-[#181A20]">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-[#F6465D]/15 dark:text-[#F6465D]">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-[#EAECEF]">
          Interrupción de Sincronización Contable
        </h2>
        <p className="text-xs leading-relaxed text-slate-600 dark:text-[#848E9C]">
          {error.message ||
            "Ocurrió una anomalía temporal verificando la firma criptográfica o la conexión con el motor P&L."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-slate-800 dark:bg-[#FCD535] dark:text-[#0B0E11] dark:hover:bg-[#F0B90B]"
        >
          Reintentar Sincronización
        </button>
      </div>
    </div>
  );
}
