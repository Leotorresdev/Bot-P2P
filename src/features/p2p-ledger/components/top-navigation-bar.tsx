"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Lock,
  Unlock,
  RefreshCw,
  BarChart2,
  PieChart,
  CheckCircle2,
  FileCheck2,
  ArrowRightLeft,
  LogOut,
  Sun,
  Moon,
  ShieldAlert,
} from "lucide-react";
import {
  useLedgerUiStore,
  type ActiveWorkspaceTab,
} from "@/features/p2p-ledger/store/use-ledger-ui-store";
import { useThemeStore } from "@/features/p2p-ledger/store/use-theme-store";
import { UnlockAccountantModal } from "@/features/p2p-ledger/components/unlock-accountant-modal";
import { useQueryClient } from "@tanstack/react-query";
import { FinanceLogo } from "@/components/ui/finance-logo";
import { cn } from "@/lib/utils";

export function TopNavigationBar() {
  const router = useRouter();
  const {
    activeTab,
    setActiveTab,
    isResultsUnlocked,
    lockResultsPanel,
    activeRole,
    setActiveRole,
    setUnlockAccountantModalOpen,
    setClosingExportModalOpen,
  } = useLedgerUiStore();
  const { theme, toggleTheme } = useThemeStore();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [justSynced, setJustSynced] = React.useState(false);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const handleDownloadCsv = () => {
    setClosingExportModalOpen(true);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/p2p/logout", { method: "POST" });
    } catch {
      // Ignorar fallo de red y proceder
    }
    lockResultsPanel();
    setActiveTab("MARKET_LIVE");
    router.push("/login");
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    await queryClient.invalidateQueries();
    setTimeout(() => {
      setIsSyncing(false);
      setJustSynced(true);
      setTimeout(() => setJustSynced(false), 2500);
    }, 600);
  };

  const isAccountant = activeRole === "AUDITOR_SENIAT";
  const isDark = theme === "dark";

  return (
    <header className="flex w-full flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)] transition-colors dark:border-[#2B3139] dark:bg-[#181A20] dark:shadow-[0_8px_30px_-10px_rgba(0,0,0,0.6)] sm:px-6 sm:py-4">
      {/* Izquierda: Marca + Pestañas Principales */}
      <div className="flex flex-wrap items-center gap-4 sm:gap-5">
        <div className="flex items-center gap-3">
          <FinanceLogo
            size={42}
            variant={isAccountant ? "accountant" : "finance"}
            className={cn(
              "h-10 w-10 shrink-0 rounded-2xl shadow-md sm:h-11 sm:w-11",
              isAccountant
                ? "shadow-amber-600/20"
                : "shadow-emerald-600/20 dark:shadow-[#FCD535]/15"
            )}
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-display text-base font-extrabold tracking-tight text-slate-900 dark:text-[#EAECEF] sm:text-lg">
                {isAccountant ? "Portal Fiscal P2P" : "Bot P2P"}
              </span>
              {isAccountant ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-900 dark:border-[#FCD535]/40 dark:bg-[#FCD535]/15 dark:text-[#FCD535]">
                  <Lock className="h-3 w-3 text-amber-600 dark:text-[#FCD535]" />
                  Rol Contador / Auditor
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:border-[#0ECB81]/30 dark:bg-[#0ECB81]/10 dark:text-[#0ECB81]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 dark:bg-[#0ECB81]" />
                  Binance C2C Live
                </span>
              )}
            </div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-[#848E9C]">
              {isAccountant
                ? "Libros Contables BA VEN-NIF & Declaración de IVA (16%)"
                : "Terminal de Brechas Bancarias & Bóveda Operativa"}
            </span>
          </div>
        </div>

        <div className="hidden h-7 w-px bg-slate-200 dark:bg-[#2B3139] lg:block" />

        {/* Navegación Principal en 2 Apartados */}
        {!isAccountant ? (
          <nav
            aria-label="Apartados principales del Bot"
            className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-100/80 p-1 dark:border-[#2B3139] dark:bg-[#0B0E11]"
          >
            {(
              [
                {
                  id: "MARKET_LIVE",
                  label: "Gráficas y Brechas",
                  icon: BarChart2,
                },
                {
                  id: "RESULTS",
                  label: "Resultados",
                  icon: PieChart,
                },
              ] as const satisfies readonly {
                id: ActiveWorkspaceTab;
                label: string;
                icon: React.ComponentType<{ className?: string }>;
              }[]
            ).map((tab) => {
              const isActive = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-extrabold transition-all duration-200",
                    isActive
                      ? "bg-slate-900 text-white shadow-sm dark:bg-[#FCD535] dark:text-[#0B0E11]"
                      : "text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-[#848E9C] dark:hover:bg-[#1E2329] dark:hover:text-[#EAECEF]"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-3.5 w-3.5",
                      isActive
                        ? "text-emerald-400 dark:text-[#0B0E11]"
                        : "text-slate-500 dark:text-[#848E9C]"
                    )}
                  />
                  <span>{tab.label}</span>
                  {tab.id === "RESULTS" &&
                    (isResultsUnlocked ? (
                      <Unlock
                        className={cn(
                          "h-3 w-3",
                          isActive
                            ? "text-emerald-400 dark:text-[#0B0E11]"
                            : "text-emerald-600 dark:text-[#0ECB81]"
                        )}
                      />
                    ) : (
                      <Lock
                        className={cn(
                          "h-3 w-3",
                          isActive
                            ? "text-amber-300 dark:text-[#0B0E11]"
                            : "text-amber-500 dark:text-[#FCD535]"
                        )}
                      />
                    ))}
                </button>
              );
            })}
          </nav>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-1.5 text-xs font-bold text-amber-900 dark:border-[#FCD535]/30 dark:bg-[#FCD535]/10 dark:text-[#FCD535]">
            <FileCheck2 className="h-4 w-4 text-amber-600 dark:text-[#FCD535]" />
            <span>Vista de Auditoría: Cierres 11:59 PM y Libros 16%</span>
          </div>
        )}
      </div>

      {/* Derecha: Toggle Tema + Controles según estado de desbloqueo */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Botón Toggle Tema Claro / Oscuro (Zustand) */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={
            isDark ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro Binance"
          }
          title={
            isDark ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro Binance"
          }
          className="group relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition-all hover:border-amber-300 hover:bg-amber-50 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#FCD535] dark:hover:border-[#FCD535]/60 dark:hover:bg-[#2B3139]"
        >
          <Sun
            className={cn(
              "h-4 w-4 transition-all duration-300",
              isDark
                ? "rotate-0 scale-100 opacity-100"
                : "-rotate-90 scale-0 opacity-0 absolute"
            )}
          />
          <Moon
            className={cn(
              "h-4 w-4 transition-all duration-300",
              !isDark
                ? "rotate-0 scale-100 opacity-100"
                : "rotate-90 scale-0 opacity-0 absolute"
            )}
          />
        </button>

        {/* Botón Actualizar Mercado / Datos */}
        {!isAccountant && (
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className={cn(
              "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition-all",
              justSynced
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-[#0ECB81]/40 dark:bg-[#0ECB81]/15 dark:text-[#0ECB81]"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#EAECEF] dark:hover:border-[#FCD535]/50"
            )}
          >
            {justSynced ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-[#0ECB81]" />
                <span>¡Actualizado!</span>
              </>
            ) : (
              <>
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5 text-emerald-600 dark:text-[#FCD535]",
                    isSyncing && "animate-spin"
                  )}
                />
                <span>{isSyncing ? "Sincronizando..." : "Actualizar"}</span>
              </>
            )}
          </button>
        )}

        {/* Acciones privadas solo visibles cuando Resultados está desbloqueado */}
        {isResultsUnlocked && (
          <>
            <button
              type="button"
              onClick={() => {
                if (isAccountant) {
                  setActiveRole("OPERATOR");
                } else {
                  setUnlockAccountantModalOpen(true);
                }
              }}
              title={
                isAccountant
                  ? "Bloquear vista fiscal y volver a tu panel de Dueño"
                  : "Ingresar contraseña para mostrar la vista de Contador"
              }
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold shadow-xs transition-all",
                isAccountant
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-[#0ECB81]/40 dark:bg-[#0ECB81]/15 dark:text-[#0ECB81]"
                  : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 dark:border-[#FCD535]/40 dark:bg-[#FCD535]/10 dark:text-[#FCD535] dark:hover:bg-[#FCD535]/20"
              )}
            >
              {isAccountant ? (
                <>
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  <span>Modo Dueño</span>
                </>
              ) : (
                <>
                  <Lock className="h-3.5 w-3.5" />
                  <span>Modo Contador</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleDownloadCsv}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold shadow-sm transition-all active:scale-[0.99]",
                isAccountant
                  ? "bg-amber-600 text-white hover:bg-amber-500 dark:bg-[#FCD535] dark:text-[#0B0E11] dark:hover:bg-[#F0B90B]"
                  : "bg-emerald-600 text-white hover:bg-emerald-500 dark:bg-[#FCD535] dark:text-[#0B0E11] dark:hover:bg-[#F0B90B]"
              )}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Cierres (.XLSX/.PDF)</span>
            </button>

            <button
              type="button"
              onClick={lockResultsPanel}
              title="Bloquear el panel de Resultados nuevamente con contraseña"
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 transition-all hover:border-amber-300 hover:bg-amber-50 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#848E9C] dark:hover:border-[#FCD535]/50 dark:hover:text-[#FCD535]"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Bloquear panel</span>
            </button>
          </>
        )}

        <div className="h-6 w-px bg-slate-200 dark:bg-[#2B3139]" />

        {/* Botón Cerrar Sesión */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          title="Cerrar sesión del bot y volver al inicio de sesión (/login)"
          className="flex items-center gap-1.5 rounded-xl border border-rose-200/90 bg-rose-50/80 px-3 py-2 text-xs font-bold text-rose-700 shadow-xs transition-all hover:border-rose-300 hover:bg-rose-100 active:scale-[0.98] disabled:opacity-60 dark:border-[#F6465D]/30 dark:bg-[#F6465D]/10 dark:text-[#F6465D] dark:hover:bg-[#F6465D]/20"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>{isLoggingOut ? "Saliendo..." : "Salir"}</span>
        </button>
      </div>

      <UnlockAccountantModal />
    </header>
  );
}
