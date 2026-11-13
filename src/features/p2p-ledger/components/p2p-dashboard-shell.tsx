"use client";

import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { TopNavigationBar } from "@/features/p2p-ledger/components/top-navigation-bar";
import { BentoModulesGrid } from "@/features/p2p-ledger/components/bento-modules-grid";
import { LiveOperationsLedger } from "@/features/p2p-ledger/components/live-operations-ledger";
import { SecurityAndClosingsView } from "@/features/p2p-ledger/components/security-and-closings-view";
import { AccountantTaxView } from "@/features/p2p-ledger/components/accountant-tax-view";
import { ClosingExportModal } from "@/features/p2p-ledger/components/closing-export-panel";
import type {
  LotMethod,
  PeriodFilter,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import { useLedgerUiStore } from "@/features/p2p-ledger/store/use-ledger-ui-store";
import {
  getCurrentVetDateIso,
  getCurrentVetMonthIso,
} from "@/lib/timezone-utc4";

export function P2PDashboardShell() {
  const { activeTab, activeRole } = useLedgerUiStore();
  const [period, setPeriod] = React.useState<PeriodFilter>("TODAY");
  const [method] = React.useState<LotMethod>("FIFO");
  const [selectedDate, setSelectedDate] = React.useState<string>("");
  const [selectedMonth, setSelectedMonth] = React.useState<string>("");
  const [selectedBank, setSelectedBank] = React.useState<string | null>(null);
  const [viewMode, setViewMode] = React.useState<"TERMINAL" | "FULL_LEDGER">(
    "TERMINAL"
  );

  React.useEffect(() => {
    setSelectedDate((prev) => prev || getCurrentVetDateIso());
    setSelectedMonth((prev) => prev || getCurrentVetMonthIso());
  }, []);

  const isAccountant = activeRole === "AUDITOR_SENIAT";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1536px] flex-col gap-4 bg-[#F4F7F9] px-3 py-4 sm:px-6 sm:py-6">
      <TopNavigationBar />

      {isAccountant ? (
        <AccountantTaxView />
      ) : activeTab === "DASHBOARD_LIVE" ? (
        viewMode === "TERMINAL" ? (
          <BentoModulesGrid
            period={period}
            onPeriodChange={setPeriod}
            method={method}
            selectedDate={selectedDate}
            onSelectedDateChange={setSelectedDate}
            selectedMonth={selectedMonth}
            onSelectedMonthChange={setSelectedMonth}
            selectedBank={selectedBank}
            onSelectBank={setSelectedBank}
            onOpenFullLedger={() => setViewMode("FULL_LEDGER")}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3">
              <button
                type="button"
                onClick={() => setViewMode("TERMINAL")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-slate-800"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Volver al Centro de Comando (Gráfica y KPIs)</span>
              </button>
              <span className="text-xs font-semibold text-slate-500">
                Espejo Exacto en Tiempo Real de Binance P2P (createTime DESC)
              </span>
            </div>
            <LiveOperationsLedger
              onBackToTerminal={() => setViewMode("TERMINAL")}
            />
          </div>
        )
      ) : (
        <SecurityAndClosingsView />
      )}

      <ClosingExportModal
        defaultDate={selectedDate || undefined}
        defaultMonth={selectedMonth || undefined}
      />
    </main>
  );
}
