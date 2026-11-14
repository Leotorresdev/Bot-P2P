"use client";

import * as React from "react";
import { ArrowLeft, KeyRound, LayoutDashboard } from "lucide-react";
import { TopNavigationBar } from "@/features/p2p-ledger/components/top-navigation-bar";
import { LiveMarketView } from "@/features/p2p-ledger/components/live-market-view";
import { ResultsLockScreen } from "@/features/p2p-ledger/components/results-lock-screen";
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
import { cn } from "@/lib/utils";

export function P2PDashboardShell() {
  const { activeTab, resultsSubTab, setResultsSubTab, isResultsUnlocked, activeRole } =
    useLedgerUiStore();

  const [period, setPeriod] = React.useState<PeriodFilter>("TODAY");
  const [method] = React.useState<LotMethod>("FIFO");
  const [selectedDate, setSelectedDate] = React.useState<string>("");
  const [selectedMonth, setSelectedMonth] = React.useState<string>("");
  const [selectedBank, setSelectedBank] = React.useState<string | null>(null);
  const [sellBrechaAmount, setSellBrechaAmount] = React.useState<number>(100_000);
  const [buyBrechaAmount, setBuyBrechaAmount] = React.useState<number>(100_000);
  const [viewMode, setViewMode] = React.useState<"TERMINAL" | "FULL_LEDGER">(
    "TERMINAL"
  );

  React.useEffect(() => {
    setSelectedDate((prev) => prev || getCurrentVetDateIso());
    setSelectedMonth((prev) => prev || getCurrentVetMonthIso());
  }, []);

  const isAccountant = activeRole === "AUDITOR_SENIAT";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1536px] flex-col gap-4 bg-[#F4F7F9] px-3 py-4 transition-colors dark:bg-[#0B0E11] sm:px-6 sm:py-6">
      <TopNavigationBar />

      {activeTab === "MARKET_LIVE" ? (
        <LiveMarketView
          selectedBank={selectedBank}
          onSelectBank={setSelectedBank}
          sellBrechaAmount={sellBrechaAmount}
          onSellBrechaAmountChange={setSellBrechaAmount}
          buyBrechaAmount={buyBrechaAmount}
          onBuyBrechaAmountChange={setBuyBrechaAmount}
        />
      ) : !isResultsUnlocked ? (
        <ResultsLockScreen />
      ) : isAccountant ? (
        <AccountantTaxView />
      ) : (
        <div className="flex flex-col gap-3">
          {/* Sub-navegación interna de Resultados: Operaciones/KPIs vs Conexión/Cierres */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white px-3.5 py-2 dark:border-[#2B3139] dark:bg-[#181A20]">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setResultsSubTab("OPERATIONS")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all",
                  resultsSubTab === "OPERATIONS"
                    ? "bg-slate-900 text-white dark:bg-[#FCD535] dark:text-[#0B0E11]"
                    : "text-slate-600 hover:bg-slate-100 dark:text-[#848E9C] dark:hover:bg-[#1E2329] dark:hover:text-[#EAECEF]"
                )}
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                <span>Panel Operativo &amp; Espejo P2P</span>
              </button>
              <button
                type="button"
                onClick={() => setResultsSubTab("VAULT_AND_CLOSINGS")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all",
                  resultsSubTab === "VAULT_AND_CLOSINGS"
                    ? "bg-slate-900 text-white dark:bg-[#FCD535] dark:text-[#0B0E11]"
                    : "text-slate-600 hover:bg-slate-100 dark:text-[#848E9C] dark:hover:bg-[#1E2329] dark:hover:text-[#EAECEF]"
                )}
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>Conexión Binance &amp; Cierres</span>
              </button>
            </div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-[#848E9C]">
              Sesión operativa desbloqueada · Zona horaria VET (-04:00)
            </span>
          </div>

          {resultsSubTab === "OPERATIONS" ? (
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
                hideLiveMarketSection
              />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-[#2B3139] dark:bg-[#181A20]">
                  <button
                    type="button"
                    onClick={() => setViewMode("TERMINAL")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white transition-all hover:bg-slate-800 dark:bg-[#FCD535] dark:text-[#0B0E11] dark:hover:bg-[#F0B90B]"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>Volver al Panel de Resultados</span>
                  </button>
                  <span className="text-xs font-semibold text-slate-500 dark:text-[#848E9C]">
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
        </div>
      )}

      {isResultsUnlocked && (
        <ClosingExportModal
          defaultDate={selectedDate || undefined}
          defaultMonth={selectedMonth || undefined}
        />
      )}
    </main>
  );
}
