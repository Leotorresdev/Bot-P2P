"use client";

import React from "react";
import {
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  X,
  AlertCircle,
} from "lucide-react";
import {
  formatDateIsoVe,
  formatMonthIsoEs,
  getCurrentVetDateIso,
  getCurrentVetMonthIso,
} from "@/lib/timezone-utc4";
import { useLedgerUiStore } from "@/features/p2p-ledger/store/use-ledger-ui-store";
import { cn } from "@/lib/utils";

type ExportScope = "DAY" | "MONTH";
type ExportFormat = "xlsx" | "pdf" | "csv";

interface ClosingExportPanelProps {
  readonly defaultDate?: string;
  readonly defaultMonth?: string;
  readonly className?: string;
}

function extractFilenameFromHeader(
  dispositionHeader: string | null,
  fallbackFilename: string
): string {
  if (!dispositionHeader) return fallbackFilename;
  const match = /filename="?([^"]+)"?/i.exec(dispositionHeader);
  return match?.[1] ? match[1] : fallbackFilename;
}

export function ClosingExportPanel({
  defaultDate,
  defaultMonth,
  className,
}: ClosingExportPanelProps) {
  const [selectedDay, setSelectedDay] = React.useState<string>(defaultDate ?? "");
  const [selectedMonth, setSelectedMonth] = React.useState<string>(
    defaultMonth ?? ""
  );
  const [downloadingKey, setDownloadingKey] = React.useState<string | null>(
    null
  );
  const [statusMessage, setStatusMessage] = React.useState<{
    readonly type: "success" | "error";
    readonly text: string;
  } | null>(null);

  // Inicialización segura post-hidratación en hora oficial Venezuela (-4:00 UTC)
  React.useEffect(() => {
    setSelectedDay((prev) =>
      prev && /^\d{4}-\d{2}-\d{2}$/.test(prev) ? prev : getCurrentVetDateIso()
    );
    setSelectedMonth((prev) =>
      prev && /^\d{4}-\d{2}$/.test(prev) ? prev : getCurrentVetMonthIso()
    );
  }, []);

  const handleDownload = async (scope: ExportScope, format: ExportFormat) => {
    const targetDay =
      selectedDay && /^\d{4}-\d{2}-\d{2}$/.test(selectedDay)
        ? selectedDay
        : getCurrentVetDateIso();
    const targetMonth =
      selectedMonth && /^\d{4}-\d{2}$/.test(selectedMonth)
        ? selectedMonth
        : getCurrentVetMonthIso();

    const loadingId = `${scope}-${format}`;
    setDownloadingKey(loadingId);
    setStatusMessage(null);

    try {
      const searchParams = new URLSearchParams({
        scope,
        format,
      });

      if (scope === "DAY") {
        searchParams.set("date", targetDay);
      } else {
        searchParams.set("month", targetMonth);
      }

      const response = await fetch(
        `/api/p2p/export-closing?${searchParams.toString()}`,
        {
          method: "GET",
          credentials: "same-origin",
        }
      );

      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || contentType.includes("text/html")) {
        let errorText =
          "No se pudo generar el cierre. Verifica tu sesión o conexión con Binance.";
        if (contentType.includes("application/json")) {
          const jsonErr = (await response.json()) as { error?: string };
          if (jsonErr.error) errorText = jsonErr.error;
        }
        throw new Error(errorText);
      }

      const blob = await response.blob();
      const fallbackName =
        scope === "MONTH"
          ? `Cierre_Mensual_P2P_${targetMonth}.${format}`
          : `Cierre_Diario_P2P_${targetDay}.${format}`;
      const fileName = extractFilenameFromHeader(
        response.headers.get("content-disposition"),
        fallbackName
      );

      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);

      setStatusMessage({
        type: "success",
        text: `Reporte descargado: ${fileName}`,
      });
    } catch (error) {
      setStatusMessage({
        type: "error",
        text:
          error instanceof Error
            ? error.message
            : "Error inesperado descargando el archivo de cierre.",
      });
    } finally {
      setDownloadingKey(null);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {/* Base de cálculo del cierre */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#EAECEF]">
        <div>
          <p className="text-xs font-bold text-slate-800 dark:text-[#EAECEF]">
            Cálculo Ponderado Real (Σ Total Bs ÷ Σ Total USDT)
          </p>
          <p className="text-[11px] text-slate-500 dark:text-[#848E9C]">
            Incluye Sección 1 (Resumen Vuelta, Brecha, Insignia) + Sección 2 (Historial cronológico Binance).
          </p>
        </div>
        <span className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs dark:bg-[#0ECB81] dark:text-[#0B0E11]">
          Ponderado (Bs/USDT)
        </span>
      </div>

      {/* Dos módulos: Cierre Diario + Cierre del Mes Completo */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Card 1: Cierre del Día */}
        <div className="flex flex-col justify-between rounded-2xl border border-emerald-200/80 bg-white p-4 shadow-xs dark:border-[#0ECB81]/25 dark:bg-[#181A20] dark:text-[#EAECEF]">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-[#0ECB81]/15 dark:text-[#0ECB81]">
                  <CalendarDays className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-[#EAECEF]">
                    Descargar Cierre del Día
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-[#848E9C]">
                    00:00:00 a 23:59:59 VET (-4:00 UTC)
                  </p>
                </div>
              </div>
              {selectedDay && (
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 dark:bg-[#0ECB81]/15 dark:text-[#0ECB81]">
                  {formatDateIsoVe(selectedDay)}
                </span>
              )}
            </div>

            <div className="pt-1">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#848E9C]">
                Selecciona la fecha calendario (Venezuela)
              </label>
              <input
                type="date"
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-semibold text-slate-900 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-[#2B3139] dark:bg-[#0B0E11] dark:text-[#EAECEF] dark:focus:border-[#0ECB81] dark:focus:bg-[#0B0E11]"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleDownload("DAY", "xlsx")}
              disabled={downloadingKey !== null}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-xs transition-all hover:bg-emerald-700 disabled:opacity-60"
            >
              {downloadingKey === "DAY-xlsx" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5" />
              )}
              <span>Excel</span>
            </button>

            <button
              type="button"
              onClick={() => handleDownload("DAY", "pdf")}
              disabled={downloadingKey !== null}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-xs transition-all hover:bg-slate-800 disabled:opacity-60 dark:bg-[#2B3139] dark:text-[#EAECEF] dark:hover:bg-[#363D47]"
            >
              {downloadingKey === "DAY-pdf" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              <span>PDF</span>
            </button>

            <button
              type="button"
              onClick={() => handleDownload("DAY", "csv")}
              disabled={downloadingKey !== null}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-60 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#EAECEF] dark:hover:bg-[#2B3139]"
            >
              {downloadingKey === "DAY-csv" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>CSV</span>
            </button>
          </div>
        </div>

        {/* Card 2: Cierre del Mes Completo */}
        <div className="flex flex-col justify-between rounded-2xl border border-indigo-200/80 bg-white p-4 shadow-xs dark:border-indigo-500/30 dark:bg-[#181A20] dark:text-[#EAECEF]">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400">
                  <CalendarRange className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-[#EAECEF]">
                    Descargar Cierre del Mes Completo
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-[#848E9C]">
                    Resumen del Mes + Tabla Día por Día + Historial de Órdenes
                  </p>
                </div>
              </div>
              {selectedMonth && (
                <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                  {formatMonthIsoEs(selectedMonth)}
                </span>
              )}
            </div>

            <div className="pt-1">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-[#848E9C]">
                Selecciona Mes y Año
              </label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-semibold text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none dark:border-[#2B3139] dark:bg-[#0B0E11] dark:text-[#EAECEF] dark:focus:border-indigo-400 dark:focus:bg-[#0B0E11]"
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleDownload("MONTH", "xlsx")}
              disabled={downloadingKey !== null}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-xs transition-all hover:bg-indigo-700 disabled:opacity-60"
            >
              {downloadingKey === "MONTH-xlsx" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5" />
              )}
              <span>Excel</span>
            </button>

            <button
              type="button"
              onClick={() => handleDownload("MONTH", "pdf")}
              disabled={downloadingKey !== null}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white shadow-xs transition-all hover:bg-slate-800 disabled:opacity-60 dark:bg-[#2B3139] dark:text-[#EAECEF] dark:hover:bg-[#363D47]"
            >
              {downloadingKey === "MONTH-pdf" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              <span>PDF</span>
            </button>

            <button
              type="button"
              onClick={() => handleDownload("MONTH", "csv")}
              disabled={downloadingKey !== null}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-all hover:bg-slate-50 disabled:opacity-60 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#EAECEF] dark:hover:bg-[#2B3139]"
            >
              {downloadingKey === "MONTH-csv" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              <span>CSV</span>
            </button>
          </div>
        </div>
      </div>

      {/* Feedback de descarga o error */}
      {downloadingKey?.startsWith("MONTH") && (
        <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          <span>
            Recorriendo todas las páginas del historial mensual de Binance y compilando el cierre...
          </span>
        </div>
      )}

      {statusMessage && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold",
            statusMessage.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-[#0ECB81]/35 dark:bg-[#0ECB81]/10 dark:text-[#0ECB81]"
              : "border-rose-200 bg-rose-50 text-rose-800 dark:border-[#F6465D]/35 dark:bg-[#F6465D]/10 dark:text-[#F6465D]"
          )}
        >
          {statusMessage.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}
    </div>
  );
}

export function ClosingExportModal({
  defaultDate,
  defaultMonth,
}: {
  readonly defaultDate?: string;
  readonly defaultMonth?: string;
}) {
  const { isClosingExportModalOpen, setClosingExportModalOpen } =
    useLedgerUiStore();

  if (!isClosingExportModalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-xs dark:bg-black/70"
      onClick={() => setClosingExportModalOpen(false)}
    >
      <div
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-[#2B3139] dark:bg-[#181A20] dark:text-[#EAECEF]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-[#2B3139]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-[#0ECB81]/15 dark:text-[#0ECB81]">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-[#EAECEF]">
                Exportar Cierre Diario o Mensual P2P
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#848E9C]">
                Excel (.xlsx), PDF e historial CSV en hora exacta Venezuela (-4:00 UTC)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setClosingExportModalOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-[#848E9C] dark:hover:bg-[#1E2329] dark:hover:text-[#EAECEF]"
            title="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5">
          <ClosingExportPanel
            defaultDate={defaultDate}
            defaultMonth={defaultMonth}
          />
        </div>
      </div>
    </div>
  );
}
