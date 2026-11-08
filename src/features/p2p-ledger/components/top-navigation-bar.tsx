"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  Shield,
  Lock,
  RefreshCw,
  LayoutDashboard,
  KeyRound,
  CheckCircle2,
  FileCheck2,
  UserCheck,
  ArrowRightLeft,
  LogOut,
} from "lucide-react";
import {
  useLedgerUiStore,
  type ActiveWorkspaceTab,
} from "@/features/p2p-ledger/store/use-ledger-ui-store";
import { UnlockAccountantModal } from "@/features/p2p-ledger/components/unlock-accountant-modal";
import { useQueryClient } from "@tanstack/react-query";
import { FinanceLogo } from "@/components/ui/finance-logo";
import { cn } from "@/lib/utils";

export function TopNavigationBar() {
  const router = useRouter();
  const {
    activeTab,
    setActiveTab,
    activeRole,
    setActiveRole,
    setUnlockAccountantModalOpen,
  } = useLedgerUiStore();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [justSynced, setJustSynced] = React.useState(false);
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const handleDownloadCsv = () => {
    window.location.href = "/api/p2p/export-csv";
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await fetch("/api/p2p/logout", { method: "POST" });
    } catch {
      // Ignorar fallo de red y proceder
    }
    setActiveRole("OPERATOR");
    setActiveTab("DASHBOARD_LIVE");
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

  return (
    <header className="flex w-full flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white px-6 py-4 shadow-[0_4px_20px_-4px_rgba(15,23,42,0.05)]">
      {/* Izquierda: Marca + Pestañas o Indicador de Rol */}
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex items-center gap-3.5">
          <FinanceLogo
            size={44}
            variant={isAccountant ? "accountant" : "finance"}
            className={cn(
              "h-11 w-11 shrink-0 rounded-2xl shadow-md",
              isAccountant
                ? "shadow-amber-600/20"
                : "shadow-emerald-600/20"
            )}
          />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-display text-lg font-extrabold tracking-tight text-slate-900">
                {isAccountant ? "Portal Fiscal P2P" : "Bot P2P"}
              </span>
              {isAccountant ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                  <Lock className="h-3 w-3 text-amber-600" />
                  Rol Contador / Auditor SENIAT
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Conectado a Binance
                </span>
              )}
            </div>
            <span className="text-xs font-medium text-slate-500">
              {isAccountant
                ? "Libros Contables BA VEN-NIF & Declaración de IVA (16%)"
                : "Control fácil de tus ganancias, bancos e impuestos"}
            </span>
          </div>
        </div>

        <div className="hidden h-7 w-px bg-slate-200 lg:block" />

        {/* Selector de Vista (Solo para Dueño; el Contador tiene su vista fija de Auditoría) */}
        {!isAccountant ? (
          <nav
            aria-label="Secciones del Bot"
            className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-slate-100/80 p-1"
          >
            {(
              [
                {
                  id: "DASHBOARD_LIVE",
                  label: "Mis Ganancias Hoy",
                  icon: LayoutDashboard,
                },
                {
                  id: "VAULT_AND_CLOSINGS",
                  label: "Conexión y Cierres",
                  icon: KeyRound,
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
                    "flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-bold transition-all duration-200",
                    isActive
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-3.5 w-3.5",
                      isActive ? "text-emerald-400" : "text-slate-500"
                    )}
                  />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-1.5 text-xs font-bold text-amber-900">
            <FileCheck2 className="h-4 w-4 text-amber-600" />
            <span>Vista de Auditoría: Cierres 11:59 PM y Libros 16%</span>
          </div>
        )}
      </div>

      {/* Derecha: Botón Modo Contador (con clave), Actualizar y Descargar Excel */}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => {
            if (isAccountant) {
              setActiveRole("OPERATOR");
              setActiveTab("DASHBOARD_LIVE");
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
            "flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all shadow-sm",
            isAccountant
              ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              : "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100"
          )}
        >
          {isAccountant ? (
            <>
              <ArrowRightLeft className="h-3.5 w-3.5" />
              <span>Volver a Modo Dueño</span>
            </>
          ) : (
            <>
              <Lock className="h-3.5 w-3.5 text-amber-600" />
              <span>Modo Contador</span>
            </>
          )}
        </button>

        {!isAccountant && (
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition-all",
              justSynced
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-50 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/50"
            )}
          >
            {justSynced ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>¡Actualizado!</span>
              </>
            ) : (
              <>
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5 text-emerald-600",
                    isSyncing && "animate-spin"
                  )}
                />
                <span>{isSyncing ? "Sincronizando..." : "Actualizar"}</span>
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={handleDownloadCsv}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm transition-all active:scale-[0.99]",
            isAccountant
              ? "bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 shadow-amber-600/20"
              : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/20"
          )}
        >
          <Download className="h-3.5 w-3.5 text-white" />
          <span>
            {isAccountant ? "Exportar Libro SENIAT (.XLSX)" : "Descargar Excel"}
          </span>
        </button>

        {/* Separador sutil */}
        <div className="h-6 w-px bg-slate-200" />

        {/* Botón Salir / Logout */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          title="Salir del bot y volver al inicio de sesión (/login)"
          className="flex items-center gap-2 rounded-xl border border-rose-200/90 bg-rose-50/80 px-3.5 py-2 text-xs font-bold text-rose-700 shadow-sm transition-all hover:border-rose-300 hover:bg-rose-100 hover:text-rose-800 active:scale-[0.98] disabled:opacity-60"
        >
          <LogOut className="h-3.5 w-3.5 text-rose-600" />
          <span>{isLoggingOut ? "Saliendo..." : "Salir"}</span>
        </button>
      </div>

      <UnlockAccountantModal />
    </header>
  );
}
