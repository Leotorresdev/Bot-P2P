"use client";

import * as React from "react";
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Loader2,
  Play,
  Radio,
  Square,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCloseShiftMutation,
  useShiftStateQuery,
  useStartShiftMutation,
} from "@/features/p2p-ledger/api/use-p2p-queries";
import { useAlertSettingsStore } from "@/features/p2p-ledger/store/use-alert-settings-store";
import {
  playShiftCloseSound,
  playShiftStartSound,
  showOsNotification,
  unlockAudioContext,
} from "@/lib/notification-sound";
import {
  MERCHANT_BADGE_META,
  type ShiftClosureDto,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import {
  formatBinanceAppOrderUsdt,
  formatDecimalWithCommas,
  formatUsdtAmount,
  formatVesAmount,
  getStatusCategoryBadgeStyle,
  getTradeTypeBadgeStyle,
} from "@/lib/format-currency";
import { getCurrentVetDateIso } from "@/lib/timezone-utc4";
import { cn } from "@/lib/utils";

function formatElapsedDuration(startMs: number, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const days = Math.floor(diffSec / 86_400);
  const hours = Math.floor((diffSec % 86_400) / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  const hms = [
    String(hours).padStart(2, "0"),
    String(mins).padStart(2, "0"),
    String(secs).padStart(2, "0"),
  ].join(":");
  return days > 0 ? `${days}d ${hms}` : hms;
}

export interface ShiftControlPanelProps {
  readonly mode?: "WORKER_BAR" | "FULL_RESULTS";
}

export function ShiftControlPanel({
  mode = "FULL_RESULTS",
}: ShiftControlPanelProps) {
  const isWorkerBarOnly = mode === "WORKER_BAR";
  const [selectedHistoryDate, setSelectedHistoryDate] =
    React.useState<string>("");
  const [isClosuresDrawerOpen, setIsClosuresDrawerOpen] =
    React.useState<boolean>(mode === "FULL_RESULTS");
  const [expandedShiftOrdersId, setExpandedShiftOrdersId] = React.useState<
    string | null
  >(null);
  const [feedbackBanner, setFeedbackBanner] = React.useState<{
    readonly type: "success" | "info" | "error";
    readonly message: string;
  } | null>(null);
  const [nowMs, setNowMs] = React.useState<number>(() => Date.now());
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSelectedHistoryDate((prev) => prev || getCurrentVetDateIso());
  }, []);

  const shiftStateQuery = useShiftStateQuery(selectedHistoryDate || undefined);
  const startShiftMutation = useStartShiftMutation();
  const closeShiftMutation = useCloseShiftMutation();
  const {
    soundEnabled,
    osNotificationsEnabled,
    isWakeLockActive,
    isBackgroundWorkerActive,
  } = useAlertSettingsStore();
  const isBackgroundAlive = isWakeLockActive || isBackgroundWorkerActive;

  const shiftState = shiftStateQuery.data;
  const activeShift = shiftState?.activeShift ?? null;
  const todayShifts = shiftState?.todayShifts ?? [];
  const nextShiftNumber = shiftState?.nextShiftNumber ?? 1;

  // Reloj en vivo únicamente cuando hay una jornada abierta (cierre 100% manual, soporta varios días)
  React.useEffect(() => {
    if (!activeShift) return;
    setNowMs(Date.now());
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [activeShift]);

  const handleStartShift = async () => {
    if (activeShift || startShiftMutation.isPending) return;
    setFeedbackBanner(null);
    await unlockAudioContext();
    try {
      const res = await startShiftMutation.mutateAsync();
      const msg =
        res.message ||
        "Jornada iniciada desde 0.00. Recopilando únicamente órdenes nuevas a partir de este instante.";
      setFeedbackBanner({
        type: "success",
        message: msg,
      });
      if (soundEnabled) {
        void playShiftStartSound();
      }
      toast.success("Jornada iniciada", {
        description: msg,
        duration: 5500,
      });
      if (osNotificationsEnabled) {
        void showOsNotification({
          title: "🟢 Bot P2P — Jornada Iniciada",
          body: msg,
          tag: "bot-p2p-shift-start",
        });
      }
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : "Error al iniciar la jornada.";
      setFeedbackBanner({
        type: "error",
        message: errMsg,
      });
      toast.error("No se pudo iniciar la jornada", { description: errMsg });
    }
  };

  const handleCloseShift = async () => {
    if (!activeShift || closeShiftMutation.isPending) return;
    setFeedbackBanner(null);
    await unlockAudioContext();
    try {
      const res = await closeShiftMutation.mutateAsync();
      setIsClosuresDrawerOpen(true);
      const msg =
        res.message ||
        "Jornada cerrada y guardada. El panel principal quedó en espera (0.00) hasta el próximo inicio.";
      setFeedbackBanner({
        type: "info",
        message: msg,
      });
      if (soundEnabled) {
        void playShiftCloseSound();
      }
      toast.info("Jornada cerrada y guardada", {
        description: msg,
        duration: 6000,
      });
      if (osNotificationsEnabled) {
        void showOsNotification({
          title: "🔴 Bot P2P — Jornada Cerrada",
          body: msg,
          tag: "bot-p2p-shift-close",
        });
      }
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message : "Error al cerrar la jornada.";
      setFeedbackBanner({
        type: "error",
        message: errMsg,
      });
      toast.error("No se pudo cerrar la jornada", { description: errMsg });
    }
  };

  const handleDownloadShiftFile = async (
    shift: ShiftClosureDto,
    format: "xlsx" | "pdf" | "csv"
  ) => {
    const key = `${shift.id}-${format}`;
    setDownloadingId(key);
    try {
      const params = new URLSearchParams({
        scope: "SHIFT",
        shiftId: shift.id,
        date: shift.dateIsoVet,
        format,
      });
      const res = await fetch(`/api/p2p/export-closing?${params.toString()}`, {
        method: "GET",
        credentials: "same-origin",
      });
      if (!res.ok) {
        throw new Error("No se pudo generar el archivo de la jornada.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Cierre_Jornada_${shift.shiftNumber}_${shift.dateIsoVet}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setFeedbackBanner({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : "Error descargando el reporte de la jornada.",
      });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* BARRA PRINCIPAL DE CONTROL DE JORNADA (INICIAR / CERRAR / MIS CIERRES DE HOY) */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-xs transition-all",
          activeShift
            ? "border-emerald-300/90 bg-gradient-to-r from-emerald-50/90 via-white to-white dark:border-[#0ECB81]/40 dark:from-[#0ECB81]/10 dark:via-[#181A20] dark:to-[#181A20]"
            : "border-slate-200/90 bg-white dark:border-[#2B3139] dark:bg-[#181A20]"
        )}
      >
        {/* Izquierda: Estado de Jornada (En Curso vs Cerrado) */}
        <div className="flex flex-wrap items-center gap-3">
          {activeShift ? (
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-900 dark:border-[#0ECB81]/50 dark:bg-[#0ECB81]/20 dark:text-[#0ECB81]">
                <span className="h-2 w-2 animate-ping rounded-full bg-emerald-600 dark:bg-[#0ECB81]" />
                <span>EN CURSO · JORNADA #{activeShift.shiftNumber}</span>
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-extrabold text-slate-900 dark:text-[#EAECEF]">
                  Jornada activa desde{" "}
                  <span className="font-mono text-emerald-700 dark:text-[#0ECB81]">
                    {activeShift.dateLabelVet} · {activeShift.startTimeVetLabel}
                  </span>{" "}
                  (VET)
                </span>
                <span className="text-[11px] font-medium text-slate-500 dark:text-[#848E9C]">
                  Tiempo transcurrido:{" "}
                  <strong className="font-mono tabular-nums text-slate-700 dark:text-[#EAECEF]">
                    {formatElapsedDuration(activeShift.shiftStartTimeMs, nowMs)}
                  </strong>{" "}
                  · Cierre manual
                  {isBackgroundAlive && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-emerald-300/70 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:border-[#0ECB81]/35 dark:bg-[#0ECB81]/15 dark:text-[#0ECB81]">
                      <Radio className="h-2.5 w-2.5" />
                      <span>2do plano activo</span>
                    </span>
                  )}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-extrabold text-amber-900 dark:border-[#FCD535]/40 dark:bg-[#FCD535]/15 dark:text-[#FCD535]">
                <span className="h-2 w-2 rounded-full bg-amber-500 dark:bg-[#FCD535]" />
                <span>CERRADO / EN ESPERA</span>
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-extrabold text-slate-900 dark:text-[#EAECEF]">
                  Panel en 0.00 · Listo para iniciar Jornada #{nextShiftNumber}
                </span>
                <span className="text-[11px] font-medium text-slate-500 dark:text-[#848E9C]">
                  Presiona «Iniciar Jornada» para iniciar desde cero. Solo se
                  cierra cuando pulses «Cerrar Jornada».
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Derecha: Botones "Iniciar Jornada", "Cerrar Jornada" y "Mis Cierres de Hoy" */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 1. Botón Iniciar Jornada */}
          <button
            type="button"
            onClick={() => void handleStartShift()}
            disabled={Boolean(activeShift) || startShiftMutation.isPending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold shadow-xs transition-all",
              activeShift
                ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#848E9C]/60"
                : "bg-emerald-600 text-white hover:bg-emerald-500 active:scale-[0.98] dark:bg-[#0ECB81] dark:text-[#0B0E11] dark:hover:bg-[#0ECB81]/90"
            )}
          >
            {startShiftMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current" />
            )}
            <span>
              {activeShift
                ? `Jornada #${activeShift.shiftNumber} Activa`
                : `Iniciar Jornada #${nextShiftNumber}`}
            </span>
          </button>

          {/* 2. Botón Cerrar Jornada */}
          <button
            type="button"
            onClick={() => void handleCloseShift()}
            disabled={!activeShift || closeShiftMutation.isPending}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold shadow-xs transition-all",
              !activeShift
                ? "cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#848E9C]/60"
                : "bg-rose-600 text-white hover:bg-rose-500 active:scale-[0.98] dark:bg-[#F6465D] dark:text-white dark:hover:bg-[#F6465D]/90"
            )}
          >
            {closeShiftMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Square className="h-3.5 w-3.5 fill-current" />
            )}
            <span>Cerrar Jornada</span>
          </button>

          {/* 3. En Resultados: Botón Desplegable "Mis Cierres de Hoy" | En Gráficas: Indicador de turnos cerrados */}
          {!isWorkerBarOnly ? (
            <button
              type="button"
              onClick={() => setIsClosuresDrawerOpen((prev) => !prev)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-extrabold transition-all",
                isClosuresDrawerOpen
                  ? "border-slate-900 bg-slate-900 text-white dark:border-[#FCD535] dark:bg-[#FCD535] dark:text-[#0B0E11]"
                  : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#EAECEF] dark:hover:border-[#FCD535]/50"
              )}
            >
              <History className="h-3.5 w-3.5" />
              <span>Mis Cierres de Hoy</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-mono text-[10px] font-extrabold tabular-nums",
                  isClosuresDrawerOpen
                    ? "bg-white/20 text-white dark:bg-black/20 dark:text-[#0B0E11]"
                    : "bg-emerald-100 text-emerald-800 dark:bg-[#0ECB81]/20 dark:text-[#0ECB81]"
                )}
              >
                {todayShifts.length}
              </span>
              {isClosuresDrawerOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#848E9C]">
              <History className="h-3.5 w-3.5 text-emerald-600 dark:text-[#FCD535]" />
              <span>Cierres hoy:</span>
              <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 font-mono text-[11px] font-extrabold tabular-nums text-emerald-800 dark:bg-[#0ECB81]/20 dark:text-[#0ECB81]">
                {todayShifts.length}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Aviso de Feedback tras Iniciar o Cerrar Jornada */}
      {feedbackBanner && (
        <div
          className={cn(
            "flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold",
            feedbackBanner.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-[#0ECB81]/40 dark:bg-[#0ECB81]/10 dark:text-[#0ECB81]"
              : feedbackBanner.type === "error"
                ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-[#F6465D]/40 dark:bg-[#F6465D]/10 dark:text-[#F6465D]"
                : "border-amber-200 bg-amber-50 text-amber-900 dark:border-[#FCD535]/40 dark:bg-[#FCD535]/10 dark:text-[#FCD535]"
          )}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-[11px] underline opacity-80 hover:opacity-100"
          >
            Ocultar
          </button>
        </div>
      )}

      {/* SECCIÓN DESPLEGABLE: "MIS CIERRES DE HOY" (Solo visible en la sección de Resultados) */}
      {!isWorkerBarOnly && isClosuresDrawerOpen && (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-[#2B3139] dark:bg-[#181A20]">
          {/* Cabecera con Selector de Fecha */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-[#2B3139]">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-[#EAECEF]">
                Mis Cierres de Jornada (Inicio y Fin Manual)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-[#848E9C]">
                Cada vez que presionas «Cerrar Jornada» se guarda el corte
                exacto del periodo abierto (sin límite de horario). Los libros
                contables diarios, semanales y mensuales se calculan aparte
                sobre tus transacciones calendario.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#EAECEF]">
                <Calendar className="h-3.5 w-3.5 text-emerald-600 dark:text-[#FCD535]" />
                <span>Fecha de cierre:</span>
                <input
                  type="date"
                  value={selectedHistoryDate}
                  onChange={(e) => setSelectedHistoryDate(e.target.value)}
                  className="bg-transparent font-mono text-xs font-extrabold focus:outline-none"
                />
              </label>
            </div>
          </div>

          {/* Lista de Cierres de Jornada (Jornada 1, Jornada 2, ...) */}
          {todayShifts.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-8 text-center dark:border-[#2B3139]">
              <Clock className="h-6 w-6 text-slate-400 dark:text-[#848E9C]" />
              <p className="mt-2 text-xs font-bold text-slate-700 dark:text-[#EAECEF]">
                Aún no hay cierres parciales guardados en esta fecha
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-[#848E9C]">
                Inicia una jornada y presiona «Cerrar Jornada» al terminar tu
                horario para guardar el corte aquí.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {todayShifts.map((shift) => {
                const badgeMeta = MERCHANT_BADGE_META[shift.merchantBadge];
                const isOrdersExpanded = expandedShiftOrdersId === shift.id;
                const s = shift.summary;

                return (
                  <div
                    key={shift.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-[#2B3139] dark:bg-[#1E2329]"
                  >
                    {/* Cabecera de la Jornada */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-slate-900 px-2.5 py-1 font-mono text-xs font-extrabold text-white dark:bg-[#FCD535] dark:text-[#0B0E11]">
                          Jornada #{shift.shiftNumber}
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-800 dark:text-[#EAECEF]">
                          {shift.startTimeVetLabel} &rarr;{" "}
                          {shift.endTimeVetLabel} VET
                        </span>
                        <span className="rounded-full border border-slate-300 bg-white px-2.5 py-0.5 text-[11px] font-bold text-slate-700 dark:border-[#2B3139] dark:bg-[#0B0E11] dark:text-[#EAECEF]">
                          {badgeMeta.emoji} {badgeMeta.label} (
                          {badgeMeta.feeLabel})
                        </span>
                        {shift.closedBy === "AUTO_2359" && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-[#FCD535]/20 dark:text-[#FCD535]">
                            Auto-Cierre 23:59:59 VET
                          </span>
                        )}
                      </div>

                      {/* Acciones: Ver Órdenes + Descargar Excel / PDF / CSV de la Jornada */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedShiftOrdersId(
                              isOrdersExpanded ? null : shift.id
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100 dark:border-[#2B3139] dark:bg-[#0B0E11] dark:text-[#EAECEF]"
                        >
                          <span>
                            {isOrdersExpanded
                              ? "Ocultar Órdenes"
                              : `Ver Órdenes (${shift.orders.length})`}
                          </span>
                          {isOrdersExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void handleDownloadShiftFile(shift, "xlsx")
                          }
                          disabled={downloadingId !== null}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-500 disabled:opacity-60 dark:bg-[#FCD535] dark:text-[#0B0E11]"
                        >
                          <FileSpreadsheet className="h-3 w-3" />
                          <span>Excel</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void handleDownloadShiftFile(shift, "pdf")
                          }
                          disabled={downloadingId !== null}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-[#0B0E11] dark:text-[#EAECEF]"
                        >
                          <FileText className="h-3 w-3" />
                          <span>PDF</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            void handleDownloadShiftFile(shift, "csv")
                          }
                          disabled={downloadingId !== null}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-[#2B3139] dark:bg-[#181A20] dark:text-[#848E9C]"
                        >
                          <Download className="h-3 w-3" />
                          <span>CSV</span>
                        </button>
                      </div>
                    </div>

                    {/* Estadísticas Completas de la Jornada */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                      <div className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 dark:border-[#2B3139] dark:bg-[#181A20]">
                        <p className="text-[10px] font-bold text-slate-500 dark:text-[#848E9C]">
                          Total Comprados
                        </p>
                        <p className="font-mono text-xs font-extrabold tabular-nums text-emerald-700 dark:text-[#0ECB81]">
                          {formatUsdtAmount(s.totalBoughtUsdt)}
                        </p>
                        <p className="font-mono text-[10px] tabular-nums text-slate-600 dark:text-[#848E9C]">
                          {formatVesAmount(s.totalBoughtVes)}
                        </p>
                        {s.grossBoughtUsdt && (
                          <p className="font-mono text-[9px] text-slate-400 dark:text-[#848E9C]">
                            Bruto: {formatDecimalWithCommas(s.grossBoughtUsdt)} USDT
                          </p>
                        )}
                      </div>

                      <div className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 dark:border-[#2B3139] dark:bg-[#181A20]">
                        <p className="text-[10px] font-bold text-slate-500 dark:text-[#848E9C]">
                          Total Vendidos
                        </p>
                        <p className="font-mono text-xs font-extrabold tabular-nums text-rose-700 dark:text-[#F6465D]">
                          {formatUsdtAmount(s.totalSoldUsdt)}
                        </p>
                        <p className="font-mono text-[10px] tabular-nums text-slate-600 dark:text-[#848E9C]">
                          {formatVesAmount(s.totalSoldVes)}
                        </p>
                        {s.grossSoldUsdt && (
                          <p className="font-mono text-[9px] text-slate-400 dark:text-[#848E9C]">
                            Bruto: {formatDecimalWithCommas(s.grossSoldUsdt)} USDT
                          </p>
                        )}
                      </div>

                      <div className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 dark:border-[#2B3139] dark:bg-[#181A20]">
                        <p className="text-[10px] font-bold text-slate-500 dark:text-[#848E9C]">
                          Vol. Total Movido
                        </p>
                        <p className="font-mono text-xs font-extrabold tabular-nums text-slate-900 dark:text-[#EAECEF]">
                          {formatUsdtAmount(s.totalVolumeUsdt)}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-[#848E9C]">
                          Prom. C: {s.activeAvgBuyRateVes} | V:{" "}
                          {s.activeAvgSellRateVes}
                        </p>
                      </div>

                      <div className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 dark:border-[#2B3139] dark:bg-[#181A20]">
                        <p className="text-[10px] font-bold text-slate-500 dark:text-[#848E9C]">
                          Brecha &amp; Bruta
                        </p>
                        <p className="font-mono text-xs font-extrabold tabular-nums text-slate-900 dark:text-[#EAECEF]">
                          {s.brechaPointsVes} pts · {formatUsdtAmount(s.grossProfitUsdt)}
                        </p>
                        <p className="font-mono text-[10px] tabular-nums text-slate-600 dark:text-[#848E9C]">
                          Bruta: {formatVesAmount(s.grossProfitVes)}
                        </p>
                        {s.grossBoughtUsdt && (
                          <p className="font-mono text-[9px] text-slate-400 dark:text-[#848E9C]">
                            Base: {formatDecimalWithCommas(s.grossBoughtUsdt)} × {s.brechaPointsVes}
                          </p>
                        )}
                      </div>

                      <div className="rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 dark:border-[#2B3139] dark:bg-[#181A20]">
                        <p className="text-[10px] font-bold text-slate-500 dark:text-[#848E9C]">
                          Comisión Real Binance
                        </p>
                        <p className="font-mono text-xs font-extrabold tabular-nums text-amber-700 dark:text-[#FCD535]">
                          -{formatUsdtAmount(s.volumeCommissionUsdt)}
                        </p>
                        <p className="font-mono text-[10px] tabular-nums text-slate-600 dark:text-[#848E9C]">
                          -{formatVesAmount(s.volumeCommissionVes)}
                        </p>
                      </div>

                      <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-2.5 py-1.5 dark:border-[#0ECB81]/30 dark:bg-[#0ECB81]/10">
                        <p className="text-[10px] font-extrabold text-emerald-800 dark:text-[#0ECB81]">
                          Ganancia Neta Jornada
                        </p>
                        <p className="font-mono text-xs font-extrabold tabular-nums text-emerald-700 dark:text-[#0ECB81]">
                          {formatUsdtAmount(s.netProfitUsdt)}
                        </p>
                        <p className="font-mono text-[10px] font-bold tabular-nums text-slate-800 dark:text-[#EAECEF]">
                          {formatVesAmount(s.netProfitVes)}
                        </p>
                      </div>
                    </div>

                    {/* Tabla Expandible con el Listado Exacto de Órdenes de esa Jornada */}
                    {isOrdersExpanded && (
                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-[#2B3139] dark:bg-[#0B0E11]">
                        {shift.orders.length === 0 ? (
                          <p className="p-4 text-center text-xs text-slate-500 dark:text-[#848E9C]">
                            Esta jornada se cerró sin órdenes registradas en ese
                            intervalo de tiempo.
                          </p>
                        ) : (
                          <table className="w-full text-left text-[11px]">
                            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] font-extrabold uppercase text-slate-600 dark:border-[#2B3139] dark:bg-[#181A20] dark:text-[#848E9C]">
                              <tr>
                                <th className="px-3 py-2">Fecha / Hora VET</th>
                                <th className="px-3 py-2">N° Orden / Adv</th>
                                <th className="px-3 py-2">Tipo</th>
                                <th className="px-3 py-2">Estado</th>
                                <th className="px-3 py-2">Banco / Contraparte</th>
                                <th className="px-3 py-2 text-right">
                                  Precio (Bs)
                                </th>
                                <th className="px-3 py-2 text-right">
                                  Cantidad (USDT)
                                </th>
                                <th className="px-3 py-2 text-right">
                                  Total (Bs)
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-[#2B3139]">
                              {shift.orders.map((order) => {
                                const typeStyle = getTradeTypeBadgeStyle(
                                  order.tradeType
                                );
                                const statusStyle = getStatusCategoryBadgeStyle(
                                  order.statusCategory
                                );
                                return (
                                  <tr
                                    key={order.orderNumber}
                                    className="hover:bg-slate-50/80 dark:hover:bg-[#181A20]"
                                  >
                                    <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-700 dark:text-[#EAECEF]">
                                      {order.timeVetLabel}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-600 dark:text-[#848E9C]">
                                      #{order.orderNumber.slice(-8)} · Adv{" "}
                                      {order.advNo && order.advNo !== "---"
                                        ? `#${order.advNo.slice(-6)}`
                                        : "---"}
                                    </td>
                                    <td className="px-3 py-2">
                                      <span
                                        className={cn(
                                          "rounded border px-1.5 py-0.5 text-[10px] font-extrabold",
                                          typeStyle.badgeClass
                                        )}
                                      >
                                        {typeStyle.label}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2">
                                      <span
                                        className={cn(
                                          "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-bold",
                                          statusStyle.badgeClass
                                        )}
                                      >
                                        <span
                                          className={cn(
                                            "h-1.5 w-1.5 rounded-full",
                                            statusStyle.dotClass
                                          )}
                                        />
                                        {order.statusLabel}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-slate-700 dark:text-[#EAECEF]">
                                      <span className="font-bold">
                                        {order.payMethodName}
                                      </span>{" "}
                                      · {order.counterPartNickName}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-bold tabular-nums text-slate-900 dark:text-[#EAECEF]">
                                      {formatDecimalWithCommas(
                                        order.unitPriceVes
                                      )}{" "}
                                      Bs
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-extrabold tabular-nums text-slate-900 dark:text-[#EAECEF]">
                                      {formatBinanceAppOrderUsdt(order)}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2 text-right font-mono font-extrabold tabular-nums text-slate-900 dark:text-[#FCD535]">
                                      {formatVesAmount(order.totalPriceVes)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
