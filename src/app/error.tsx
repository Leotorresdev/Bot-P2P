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
    <div className="flex min-h-screen flex-col items-center justify-center bg-alpine-snow p-6">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-[18px] border border-alpine-border bg-white p-8 text-center shadow-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#B91C1C]">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="font-display text-lg font-bold text-alpine-ink">
          Interrupción de Sincronización Contable
        </h2>
        <p className="text-xs leading-relaxed text-alpine-slate">
          {error.message ||
            "Ocurrió una anomalía temporal verificando la firma criptográfica o la conexión con el motor P&L."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-alpine-ink px-4 py-2 text-xs font-semibold text-white hover:bg-alpine-ink/90"
        >
          Reintentar Sincronización
        </button>
      </div>
    </div>
  );
}
