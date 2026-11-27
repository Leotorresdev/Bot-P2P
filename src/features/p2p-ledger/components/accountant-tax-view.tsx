"use client";

import * as React from "react";
import {
  BadgePercent,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Landmark,
  Loader2,
  Lock,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  useP2POrdersQuery,
  useP2PSummaryQuery,
  useTaxConfigQuery,
} from "@/features/p2p-ledger/api/use-p2p-queries";
import type { TradeTypeFilter } from "@/features/p2p-ledger/schemas/p2p.schemas";
import {
  formatDateIsoVe,
  getCurrentVetDateIso,
  getCurrentVetMonthIso,
} from "@/lib/timezone-utc4";
import {
  formatBinanceAppOrderUsdt,
  formatDecimalWithCommas,
  formatUsdtAmount,
  formatVesAmount,
  getStatusCategoryBadgeStyle,
  getTradeTypeBadgeStyle,
} from "@/lib/format-currency";
import { cn } from "@/lib/utils";

const ORDERS_PER_PAGE = 50;

export function AccountantTaxView() {
  const [selectedMonth, setSelectedMonth] = React.useState<string>("");
  const [filterType, setFilterType] = React.useState<TradeTypeFilter>("ALL");
  const [dateFilter, setDateFilter] = React.useState<string>("");
  const [todayVeLabel, setTodayVeLabel] = React.useState<string>("");
  const [page, setPage] = React.useState<number>(1);
  const [isDownloadingExcel, setIsDownloadingExcel] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);
  const [downloadWarning, setDownloadWarning] = React.useState<string | null>(null);

  React.useEffect(() => {
    setSelectedMonth((prev) => prev || getCurrentVetMonthIso());
    setTodayVeLabel(formatDateIsoVe(getCurrentVetDateIso()));
  }, []);

  const taxConfigQuery = useTaxConfigQuery();
  const summaryQuery = useP2PSummaryQuery({
    period: "MONTH",
    method: "FIFO",
    month: selectedMonth || undefined,
  });

  const ordersQuery = useP2POrdersQuery({
    period: dateFilter ? "DAY" : "MONTH",
    tradeType: filterType,
    status: "ALL",
    date: dateFilter || undefined,
    month: !dateFilter && selectedMonth ? selectedMonth : undefined,
    page,
    limit: ORDERS_PER_PAGE,
  });

  const summary = summaryQuery.data;
  const orders = ordersQuery.data?.items ?? [];
  const totalCount = ordersQuery.data?.totalCount ?? orders.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / ORDERS_PER_PAGE));

  const configuredSeniatPct =
    taxConfigQuery.data?.seniatTaxPercent ??
    (summary?.seniatTaxRatePercent
      ? Number(summary.seniatTaxRatePercent)
      : 16);
  const seniatRateLabel = Number.isFinite(configuredSeniatPct)
    ? String(configuredSeniatPct)
    : "16";

  const effectiveMonth = selectedMonth || getCurrentVetMonthIso();

  const monthChips = React.useMemo(() => {
    const allDates = ordersQuery.data?.availableDates ?? [];
    const targetSuffix = `/${effectiveMonth.slice(5, 7)}/${effectiveMonth.slice(0, 4)}`;
    return allDates.filter((dateStr) => dateStr.endsWith(targetSuffix));
  }, [ordersQuery.data?.availableDates, effectiveMonth]);

  const handleDownloadMonthlyExcel = async () => {
    setIsDownloadingExcel(true);
    setDownloadError(null);
    setDownloadWarning(null);
    try {
      const monthParam = effectiveMonth;
      const url = `/api/p2p/export-closing?scope=MONTH&month=${encodeURIComponent(monthParam)}&format=xlsx`;
      const res = await fetch(url, {
        method: "GET",
        credentials: "same-origin",
      });
      if (!res.ok) {
        throw new Error("No se pudo generar el libro fiscal mensual en Excel.");
      }
      const rawWarning = res.headers.get("x-p2p-sync-warning");
      if (rawWarning) {
        setDownloadWarning(decodeURIComponent(rawWarning));
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `Libro_Fiscal_Mensual_P2P_${monthParam}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      setDownloadError(
        error instanceof Error
          ? error.message
          : "Error descargando el Libro Fiscal Mensual (.XLSX)."
      );
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-5">
      {/* 1. Cabecera Limpia: Rol Contador + Mes + Botón Único de Libro Fiscal Mensual (.XLSX) */}
      <section className="flex flex-col gap-4 rounded-2xl border border-amber-200/90 bg-gradient-to-r from-amber-50/90 via-white to-white p-5 shadow-xs dark:border-[#FCD535]/25 dark:from-[#FCD535]/10 dark:via-[#181A20] dark:to-[#181A20]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm dark:bg-[#FCD535] dark:text-[#0B0E11]">
              <Lock className="h-5 w-5" />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-base font-extrabold text-slate-900 dark:text-[#EAECEF]">
                  Portal Fiscal SENIAT (Modo Contador)
                </h2>
                <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-900 dark:border-[#FCD535]/35 dark:bg-[#FCD535]/15 dark:text-[#FCD535]">
                  Solo Lectura · BA VEN-NIF
                </span>
              </div>
              <p className="max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-[#848E9C]">
                Registra todas las transacciones y ganancias desde que se
                vinculó la cuenta de Binance. Las claves API y herramientas
                operativas permanecen ocultas por seguridad.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#EAECEF]">
              <span className="text-[11px] text-slate-500 dark:text-[#848E9C]">
                Mes:
              </span>
              <input
                type="month"
                value={effectiveMonth}
                onChange={(e) => {
                  setSelectedMonth(e.target.value);
                  setDateFilter("");
                  setPage(1);
                }}
                aria-label="Seleccionar mes fiscal"
                className="cursor-pointer bg-transparent font-mono text-xs font-bold text-slate-900 focus:outline-none dark:text-[#EAECEF]"
              />
            </label>

            <button
              type="button"
              onClick={handleDownloadMonthlyExcel}
              disabled={isDownloadingExcel}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-extrabold text-white shadow-sm transition-all hover:bg-emerald-700 disabled:opacity-60 dark:bg-[#FCD535] dark:text-[#0B0E11] dark:hover:bg-[#F0B90B]"
            >
              {isDownloadingExcel ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span>
                {isDownloadingExcel
                  ? "Generando Excel..."
                  : "Descargar Libro Fiscal Mensual (.XLSX)"}
              </span>
            </button>
          </div>
        </div>

        {downloadWarning && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 dark:border-[#FCD535]/35 dark:bg-[#FCD535]/10 dark:text-[#FCD535]">
            {downloadWarning}
          </div>
        )}

        {downloadError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-semibold text-rose-700 dark:border-[#F6465D]/35 dark:bg-[#F6465D]/10 dark:text-[#F6465D]">
            {downloadError}
          </div>
        )}
      </section>

      {/* 2. Tarjeta Única: Provisión SENIAT Seleccionada por el Dueño */}
      <section className="rounded-2xl border border-amber-200/90 bg-white p-5 shadow-xs dark:border-[#2B3139] dark:bg-[#181A20]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-[#FCD535]/15 dark:text-[#FCD535]">
              <BadgePercent className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-[#EAECEF]">
                  Provisión SENIAT ({seniatRateLabel}%)
                </h3>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:border-[#0ECB81]/30 dark:bg-[#0ECB81]/10 dark:text-[#0ECB81]">
                  <ShieldCheck className="h-3 w-3" />
                  Seleccionada por el dueño: {seniatRateLabel}%
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-[#848E9C]">
                Calculada sobre las ganancias realizadas del mes (
                {summary?.periodLabel ?? effectiveMonth}) con las transacciones
                guardadas desde la vinculación de Binance.
              </p>
            </div>
          </div>

          {summaryQuery.isLoading ? (
            <div className="flex flex-col items-end gap-2 animate-pulse">
              <div className="h-7 w-32 rounded-lg bg-slate-200 dark:bg-[#1E2329]" />
              <div className="h-4 w-40 rounded bg-slate-200 dark:bg-[#1E2329]" />
            </div>
          ) : (
            <div className="flex flex-col items-start sm:items-end">
              <div className="font-mono text-2xl font-extrabold tracking-tight tabular-nums text-amber-700 dark:text-[#FCD535]">
                -{summary?.seniatTax16Usdt ?? "0.00"} USDT
              </div>
              <div className="font-mono text-xs font-bold tabular-nums text-slate-700 dark:text-[#EAECEF]">
                {summary?.seniatTax16Ves ?? "0.00"} Bs. a declarar (
                {seniatRateLabel}%)
              </div>
              <span className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-[#848E9C]">
                {summary?.reconciledOrdersCount ?? 0} órdenes completadas de{" "}
                {summary?.totalOrdersInPeriod ?? 0} registradas en el mes
              </span>
            </div>
          )}
        </div>
      </section>

      {/* 3. Libro Diario de Conciliación Impositiva por Fechas */}
      <section className="flex w-full flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs dark:border-[#2B3139] dark:bg-[#181A20] sm:p-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-[#2B3139] lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="font-display text-lg font-extrabold text-slate-900 dark:text-[#EAECEF]">
                Libro Diario de Conciliación Impositiva
              </h3>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-extrabold text-emerald-700 dark:border-[#0ECB81]/30 dark:bg-[#0ECB81]/10 dark:text-[#0ECB81]">
                {totalCount} Comprobantes
              </span>
            </div>
            <p className="text-xs font-medium text-slate-500 dark:text-[#848E9C]">
              Historial de operaciones sincronizadas desde Binance con desglose
              cronológico y filtro por fechas VET (-04:00).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-[#2B3139] dark:bg-[#0B0E11]">
            {(
              [
                { id: "ALL", label: "Todas las Operaciones" },
                { id: "SELL", label: `Ventas (Débito ${seniatRateLabel}%)` },
                { id: "BUY", label: "Compras de Inventario" },
              ] as const satisfies readonly {
                id: TradeTypeFilter;
                label: string;
              }[]
            ).map((item) => {
              const isActive = filterType === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setFilterType(item.id);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                    isActive
                      ? "bg-slate-900 text-white shadow-xs dark:bg-[#FCD535] dark:text-[#0B0E11]"
                      : "text-slate-600 hover:text-slate-900 dark:text-[#848E9C] dark:hover:text-[#EAECEF]"
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selector y Filtros por Fecha (Contador) */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/90 p-3 dark:border-[#2B3139] dark:bg-[#1E2329]">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 shadow-xs dark:border-[#2B3139] dark:bg-[#0B0E11]">
              <Calendar className="h-4 w-4 shrink-0 text-amber-600 dark:text-[#FCD535]" />
              <span className="text-xs font-bold text-slate-800 dark:text-[#EAECEF]">
                Fecha Fiscal:
              </span>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setPage(1);
                }}
                aria-label="Filtrar por fecha fiscal"
                className="cursor-pointer bg-transparent font-mono text-xs font-semibold text-slate-800 focus:outline-none dark:text-[#EAECEF]"
              />
              {dateFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setDateFilter("");
                    setPage(1);
                  }}
                  className="ml-1 text-slate-400 transition-colors hover:text-slate-600 dark:text-[#848E9C] dark:hover:text-[#EAECEF]"
                  title="Quitar filtro de fecha"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Chips rápidos de fechas disponibles */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setDateFilter("");
                  setPage(1);
                }}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-bold transition-all",
                  !dateFilter
                    ? "bg-slate-900 text-white shadow-xs dark:bg-[#FCD535] dark:text-[#0B0E11]"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-[#2B3139] dark:bg-[#181A20] dark:text-[#EAECEF] dark:hover:bg-[#2B3139]"
                )}
              >
                Todo el Mes
              </button>

              {monthChips.map((dateStr) => {
                const parts = dateStr.split("/");
                const d = parts[0] ?? "";
                const m = parts[1] ?? "";
                const y = parts[2] ?? "";
                const isoDate = d && m && y ? `${y}-${m}-${d}` : "";
                if (!isoDate) return null;

                const isSelected =
                  dateFilter === isoDate || dateFilter === dateStr;
                const isToday =
                  todayVeLabel !== "" && dateStr === todayVeLabel;

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => {
                      setDateFilter(isSelected ? "" : isoDate);
                      setPage(1);
                    }}
                    className={cn(
                      "flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all",
                      isSelected
                        ? "bg-amber-600 text-white shadow-xs dark:bg-[#FCD535] dark:text-[#0B0E11]"
                        : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-[#2B3139] dark:bg-[#181A20] dark:text-[#EAECEF] dark:hover:bg-[#2B3139]"
                    )}
                  >
                    {isToday ? `🟢 Hoy (${dateStr})` : `📅 ${dateStr}`}
                  </button>
                );
              })}
            </div>
          </div>

          {dateFilter && (
            <span className="rounded-lg border border-amber-300 bg-amber-100/90 px-2.5 py-1 text-xs font-bold text-amber-900 dark:border-[#FCD535]/35 dark:bg-[#FCD535]/15 dark:text-[#FCD535]">
              Día{" "}
              {dateFilter.includes("-")
                ? dateFilter.split("-").reverse().join("/")
                : dateFilter}{" "}
              ({totalCount} registros)
            </span>
          )}
        </div>

        {/* Tabla Contable Fiscal */}
        <div className="w-full overflow-x-auto">
          <div className="min-w-[1050px]">
            <div className="grid grid-cols-12 items-center rounded-xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#848E9C]">
              <div className="col-span-3">Fecha VET / N° Orden y Anuncio</div>
              <div className="col-span-1">Tipo</div>
              <div className="col-span-2">Estado</div>
              <div className="col-span-2">Banco Nacional</div>
              <div className="col-span-2">Tasa y Cantidad USDT</div>
              <div className="col-span-2 text-right">Monto Total (Bs.)</div>
            </div>

            <div className="mt-2 flex flex-col gap-2">
              {ordersQuery.isLoading ? (
                Array.from({ length: 6 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-14 animate-pulse rounded-xl border border-slate-200/60 bg-slate-100 dark:border-[#2B3139] dark:bg-[#1E2329]"
                  />
                ))
              ) : orders.length === 0 ? (
                <div className="rounded-xl border border-slate-200/70 bg-slate-50/70 px-4 py-10 text-center text-xs font-semibold text-slate-500 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#848E9C]">
                  No hay transacciones registradas para este filtro o período.
                </div>
              ) : (
                orders.map((order) => {
                  const typeStyle = getTradeTypeBadgeStyle(order.tradeType);
                  const statusStyle = getStatusCategoryBadgeStyle(
                    order.statusCategory
                  );
                  return (
                    <div
                      key={order.orderNumber}
                      className="grid grid-cols-12 items-center rounded-xl border border-slate-200/70 bg-white px-4 py-3 text-xs transition-colors hover:bg-slate-50/80 dark:border-[#2B3139] dark:bg-[#0B0E11] dark:hover:bg-[#1E2329]"
                    >
                      {/* Comprobante / Hora VET */}
                      <div className="col-span-3 flex flex-col gap-1">
                        <span className="w-fit rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] font-extrabold text-amber-900 dark:border-[#FCD535]/30 dark:bg-[#FCD535]/10 dark:text-[#FCD535]">
                          {order.timeVetLabel}
                        </span>
                        <span className="font-mono text-[11px] font-medium text-slate-500 dark:text-[#848E9C]">
                          Orden #{order.orderNumber} · Adv {order.advNo || "-"}
                        </span>
                      </div>

                      {/* Tipo */}
                      <div className="col-span-1">
                        <span
                          className={cn(
                            "rounded-md border px-2 py-0.5 text-[11px] font-extrabold",
                            typeStyle.badgeClass
                          )}
                        >
                          {typeStyle.label}
                        </span>
                      </div>

                      {/* Estado */}
                      <div className="col-span-2">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-bold",
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
                      </div>

                      {/* Banco */}
                      <div className="col-span-2 flex items-center gap-1.5 font-bold text-slate-800 dark:text-[#EAECEF]">
                        <Landmark className="h-3.5 w-3.5 text-slate-400 dark:text-[#848E9C]" />
                        <span>{order.payMethodName}</span>
                      </div>

                      {/* Tasa / Cantidad */}
                      <div className="col-span-2 flex flex-col gap-0.5 font-mono">
                        <span className="font-extrabold text-slate-900 dark:text-[#EAECEF]">
                          {formatBinanceAppOrderUsdt(order)}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-[#848E9C]">
                          @ {formatDecimalWithCommas(order.unitPriceVes)} Bs/USDT
                        </span>
                      </div>

                      {/* Monto Total Facturado */}
                      <div className="col-span-2 flex flex-col items-end gap-0.5 font-mono">
                        <span className="text-sm font-extrabold text-slate-900 dark:text-[#EAECEF]">
                          {formatVesAmount(order.totalPriceVes)}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-[#848E9C]">
                          {order.counterPartNickName}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Paginación si hay más de 50 comprobantes */}
        {totalPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
            <span className="font-medium text-slate-500 dark:text-[#848E9C]">
              Página {page} de {totalPages} ({totalCount} transacciones)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#EAECEF] dark:hover:bg-[#2B3139]"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Anterior</span>
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#EAECEF] dark:hover:bg-[#2B3139]"
              >
                <span>Siguiente</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Pie del Libro */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs dark:border-[#2B3139] dark:bg-[#1E2329]">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-600 dark:text-[#0ECB81]" />
            <span className="font-semibold text-slate-700 dark:text-[#EAECEF]">
              Libro fiscal mensual preparado con provisión SENIAT del{" "}
              {seniatRateLabel}% sobre las operaciones sincronizadas desde
              Binance.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
