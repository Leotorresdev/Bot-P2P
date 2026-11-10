"use client";

import * as React from "react";
import {
  FileSpreadsheet,
  ShieldCheck,
  Lock,
  Download,
  CalendarCheck,
  PiggyBank,
  Wallet,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  BadgePercent,
  Landmark,
  Calendar,
  X,
} from "lucide-react";
import {
  useDailyClosingsQuery,
  useP2POrdersQuery,
  useP2PSummaryQuery,
} from "@/features/p2p-ledger/api/use-p2p-queries";
import type { TradeTypeFilter } from "@/features/p2p-ledger/schemas/p2p.schemas";
import { cn } from "@/lib/utils";

export function AccountantTaxView() {
  const closingsQuery = useDailyClosingsQuery();
  const summaryQuery = useP2PSummaryQuery("TODAY", "FIFO");
  const [filterType, setFilterType] = React.useState<TradeTypeFilter>("ALL");
  const [dateFilter, setDateFilter] = React.useState<string>("");
  const [page, setPage] = React.useState<number>(1);
  const [expandedClosingId, setExpandedClosingId] = React.useState<
    string | null
  >(null);

  const ordersQuery = useP2POrdersQuery({
    period: "TODAY",
    tradeType: filterType,
    date: dateFilter || undefined,
    page,
  });

  const closings = closingsQuery.data?.closings ?? [];
  const closingsData = closingsQuery.data;
  const summary = summaryQuery.data;
  const orders = ordersQuery.data?.items ?? [];

  const handleDownloadExcel = () => {
    const url = dateFilter
      ? `/api/p2p/export-csv?date=${encodeURIComponent(dateFilter)}`
      : "/api/p2p/export-csv";
    window.location.href = url;
  };

  return (
    <div className="flex w-full flex-col gap-6">
      {/* 1. Banner de Seguridad Zero-Trust para el Contador */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-300/80 bg-gradient-to-r from-amber-50 via-amber-50/60 to-white p-5 shadow-sm">
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/20">
            <Lock className="h-5 w-5" />
          </div>
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="font-display text-base font-extrabold text-amber-950">
                Portal de Auditoría Fiscal SENIAT (Rol Contador)
              </span>
              <span className="rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-900">
                BA VEN-NIF
              </span>
            </div>
            <p className="text-xs leading-relaxed text-amber-800">
              Acceso restringido para el cálculo y declaración de impuestos. Por
              seguridad de la empresa, las claves API de Binance y las
              herramientas operativas de trading no están expuestas en esta
              sesión.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDownloadExcel}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 transition-all hover:from-emerald-500 hover:to-teal-500"
        >
          <Download className="h-4 w-4" />
          <span>Descargar Libro Fiscal (.XLSX)</span>
        </button>
      </div>

      {/* 2. Cuadrícula de Resumen Impositivo del Mes */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Caja 1: Provisión Débito Fiscal SENIAT */}
        <div className="flex flex-col justify-between gap-2 rounded-2xl border border-amber-200/90 bg-amber-50/60 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900">
              Provisión SENIAT ({summary?.seniatTaxRatePercent ?? "16"}%)
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <BadgePercent className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="font-display text-2xl font-extrabold tracking-tight text-amber-700">
              -${closingsData?.monthSeniatTax16Usdt ?? "0.00"}
            </div>
            <div className="text-xs font-bold text-amber-800">
              {closingsData?.monthSeniatTax16Ves ?? "0.00"} Bs. a declarar
            </div>
          </div>
          <span className="text-[11px] font-medium text-amber-800/80">
            Calculado estrictamente sobre el margen comercial realizado
          </span>
        </div>

        {/* Caja 2: Margen Bruto Realizado (Base Imponible) */}
        <div className="flex flex-col justify-between gap-2 rounded-2xl border border-emerald-200/90 bg-emerald-50/60 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-900">
              Base Imponible Realizada
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <PiggyBank className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="font-display text-2xl font-extrabold tracking-tight text-emerald-900">
              +${closingsData?.monthGrossUsdt ?? "0.00"}
            </div>
            <div className="text-xs font-bold text-emerald-800">
              {closingsData?.monthGrossVes ?? "0.00"} Bs. brutos
            </div>
          </div>
          <span className="text-[11px] font-medium text-emerald-700/80">
            Diferencia entre compra y venta antes de tributos
          </span>
        </div>

        {/* Caja 3: Ganancia Neta Realizada */}
        <div className="flex flex-col justify-between gap-2 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">
              Utilidad Neta del Comercio
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
          <div>
            <div className="font-display text-2xl font-extrabold tracking-tight text-slate-900">
              +${closingsData?.monthNetFreeUsdt ?? "0.00"}
            </div>
            <div className="text-xs font-bold text-slate-700">
              {closingsData?.monthNetFreeVes ?? "0.00"} Bs. netos
            </div>
          </div>
          <span className="text-[11px] font-medium text-slate-500">
            Margen libre disponible para la empresa
          </span>
        </div>
      </div>

      {/* 3. Sección: Actas Diarias de Cierre a las 11:59 PM VET */}
      <div className="flex w-full flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-600">
              <CalendarCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-lg font-extrabold text-slate-900">
                  Actas Diarias de Cierre (11:59 PM VET)
                </h3>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-extrabold text-amber-800">
                  Inmutables
                </span>
              </div>
              <p className="text-xs font-medium text-slate-500">
                Cada medianoche se congela el inventario y se emite el acta
                diaria con firma criptográfica SHA-256.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-extrabold text-emerald-800 border border-emerald-200">
              ✓ Cierres Conformes bajo BA VEN-NIF
            </span>
          </div>
        </div>

        {/* Lista de Actas */}
        <div className="flex flex-col gap-3">
          {closings.map((closing) => {
            const isExpanded = expandedClosingId === closing.id;
            return (
              <div
                key={closing.id}
                className={cn(
                  "overflow-hidden rounded-xl border transition-all duration-150",
                  isExpanded
                    ? "border-amber-400 bg-amber-50/20 shadow-md"
                    : "border-slate-200/80 bg-white hover:border-amber-300 hover:bg-slate-50/50"
                )}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    setExpandedClosingId(isExpanded ? null : closing.id)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedClosingId(isExpanded ? null : closing.id);
                    }
                  }}
                  className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3.5"
                >
                  <div className="flex w-[150px] shrink-0 flex-col gap-0.5">
                    <span className="text-sm font-extrabold text-slate-900">
                      {closing.closingDateLabel}
                    </span>
                    <span className="text-xs font-semibold text-amber-800">
                      Cierre 11:59 PM VET
                    </span>
                  </div>

                  <div className="flex w-[130px] shrink-0 flex-col gap-0.5">
                    <span className="text-xs font-bold text-slate-800">
                      {closing.reconciledOrders} Órdenes
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      Volumen: ${closing.totalVolumeUsdt}
                    </span>
                  </div>

                  <div className="flex w-[140px] shrink-0 flex-col gap-0.5">
                    <span className="text-xs font-extrabold text-amber-700">
                      Débito IVA: -${closing.seniatTax16Usdt}
                    </span>
                    <span className="text-xs font-bold text-amber-800">
                      -{closing.seniatTax16Ves} Bs. (16%)
                    </span>
                  </div>

                  <div className="flex w-[140px] shrink-0 flex-col items-end gap-0.5">
                    <span className="text-sm font-extrabold text-emerald-700">
                      +${closing.netFreeProfitUsdt} Libres
                    </span>
                    <span className="text-xs font-bold text-slate-700">
                      +{closing.netFreeProfitVes} Bs.
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadExcel();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                    >
                      <Download className="h-3.5 w-3.5 text-emerald-600" />
                      <span>Acta .XLSX</span>
                    </button>
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
                      <div className="flex items-center gap-2 text-slate-700">
                        <ShieldCheck className="h-4 w-4 text-emerald-600" />
                        <span>
                          Hash de Integridad Criptográfica:{" "}
                          <code className="rounded bg-white px-1.5 py-0.5 font-mono text-[11px] border border-slate-200">
                            {closing.integrityHashSha256}
                          </code>
                        </span>
                      </div>
                      <span className="text-xs font-bold text-slate-600">
                        Comprobante sellado a medianoche
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Sección: Libro Diario de Operaciones con Formato Fiscal */}
      <div className="flex w-full flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5">
              <h3 className="font-display text-lg font-extrabold text-slate-900">
                Libro Diario de Conciliación Impositiva
              </h3>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-extrabold text-emerald-700">
                {ordersQuery.data?.totalCount ?? orders.length} Comprobantes
              </span>
            </div>
            <p className="text-xs font-medium text-slate-500">
              Desglose contable con separación estricta de Capital Exento y
              Margen Sujeto a Retención/IVA del 16%.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1">
            {(
              [
                { id: "ALL", label: "Todas las Operaciones" },
                { id: "SELL", label: "Ventas (Débito IVA 16%)" },
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
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Selector y Filtros por Fecha (Contador) */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200/60 bg-amber-50/40 p-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 rounded-lg border border-amber-300/80 bg-white px-3 py-1.5 shadow-xs">
              <Calendar className="h-4 w-4 text-amber-700 shrink-0" />
              <span className="text-xs font-bold text-amber-950">Fecha Fiscal:</span>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
              />
              {dateFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setDateFilter("");
                    setPage(1);
                  }}
                  className="text-slate-400 hover:text-slate-600 transition-colors ml-1"
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
                    ? "bg-amber-900 text-white shadow-sm"
                    : "border border-amber-200 bg-white text-amber-900 hover:border-amber-300 hover:bg-amber-50"
                )}
              >
                Todas las Fechas
              </button>

              {ordersQuery.data?.availableDates?.map((dateStr) => {
                const [d, m, y] = dateStr.split("/");
                const isoDate = `${y}-${m}-${d}`;
                const isSelected = dateFilter === isoDate || dateFilter === dateStr;

                const nowVet = new Date();
                const todayStr = nowVet.toLocaleDateString("es-VE", {
                  timeZone: "America/Caracas",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                });
                const isToday = dateStr === todayStr;

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => {
                      setDateFilter(isSelected ? "" : isoDate);
                      setPage(1);
                    }}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs font-bold transition-all flex items-center gap-1",
                      isSelected
                        ? "bg-amber-700 text-white shadow-sm"
                        : "border border-amber-200 bg-white text-amber-900 hover:border-amber-300 hover:bg-amber-50"
                    )}
                  >
                    {isToday ? `🟢 Hoy (${dateStr})` : `📅 ${dateStr}`}
                  </button>
                );
              })}
            </div>
          </div>

          {dateFilter && (
            <span className="text-xs font-bold text-amber-900 bg-amber-100/90 border border-amber-300 px-2.5 py-1 rounded-lg">
              Libro Diario del {dateFilter.includes("-") ? dateFilter.split("-").reverse().join("/") : dateFilter} ({ordersQuery.data?.totalCount ?? orders.length} registros)
            </span>
          )}
        </div>

        {/* Tabla Contable Fiscal */}
        <div className="w-full overflow-x-auto">
          <div className="min-w-[1050px]">
            {/* Encabezados Fiscales */}
            <div className="grid grid-cols-12 items-center rounded-xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              <div className="col-span-2">N° Comprobante / Hora</div>
              <div className="col-span-1">Tipo</div>
              <div className="col-span-2">Banco Nacional</div>
              <div className="col-span-2">Monto Total Facturado</div>
              <div className="col-span-2">Capital Exento (Costo)</div>
              <div className="col-span-1">Base Gravable</div>
              <div className="col-span-2 text-right text-amber-900">
                Débito IVA (16%)
              </div>
            </div>

            {/* Filas Contables */}
            <div className="mt-2 flex flex-col gap-2">
              {orders.map((order) => {
                const isBuy = order.tradeType === "BUY";
                return (
                  <div
                    key={order.orderNumber}
                    className="grid grid-cols-12 items-center rounded-xl border border-slate-200/70 bg-white px-4 py-3 text-xs"
                  >
                    {/* Comprobante / Hora */}
                    <div className="col-span-2 flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-extrabold text-amber-900">
                          {order.timeVetLabel.includes("•")
                            ? order.timeVetLabel.split("•")[0]?.trim()
                            : order.timeVetLabel}
                        </span>
                        {order.timeVetLabel.includes("•") && (
                          <span className="text-[11px] font-semibold text-slate-500">
                            {order.timeVetLabel.split("•")[1]?.trim()}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] font-medium text-slate-400">
                        Orden #{order.orderNumber}
                      </span>
                    </div>

                    {/* Tipo */}
                    <div className="col-span-1">
                      {isBuy ? (
                        <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-extrabold text-blue-700">
                          Compra
                        </span>
                      ) : (
                        <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700">
                          Venta
                        </span>
                      )}
                    </div>

                    {/* Banco */}
                    <div className="col-span-2 flex items-center gap-1.5 font-bold text-slate-800">
                      <Landmark className="h-3.5 w-3.5 text-slate-400" />
                      <span>{order.payMethodName}</span>
                    </div>

                    {/* Monto Total Facturado */}
                    <div className="col-span-2 flex flex-col gap-0.5">
                      <span className="font-extrabold text-slate-900">
                        {order.totalPriceVes} Bs.
                      </span>
                      <span className="text-[11px] text-slate-500">
                        ({order.amountUsdt} USDT @ {order.unitPriceVes} Bs)
                      </span>
                    </div>

                    {/* Capital Exento */}
                    <div className="col-span-2 flex flex-col gap-0.5">
                      <span className="font-bold text-blue-900">
                        {isBuy
                          ? `${order.totalPriceVes} Bs. (100% Inversión)`
                          : `${order.exemptCapitalVes} Bs. (Exento)`}
                      </span>
                      <span className="text-[10px] text-blue-700">
                        {isBuy
                          ? "Costo de compra"
                          : `Base: ${order.costBasisRateVes} Bs/USDT`}
                      </span>
                    </div>

                    {/* Base Gravable */}
                    <div className="col-span-1 font-extrabold text-slate-900">
                      {isBuy ? (
                        <span className="text-slate-400">0.00 Bs.</span>
                      ) : (
                        <span>+{order.netFreeProfitVes} Bs.</span>
                      )}
                    </div>

                    {/* Débito IVA 16% */}
                    <div className="col-span-2 flex flex-col items-end gap-0.5">
                      {isBuy ? (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                          Exento de IVA
                        </span>
                      ) : (
                        <>
                          <span className="font-extrabold text-amber-700">
                            -{order.seniatTax16Ves} Bs.
                          </span>
                          <span className="text-[10px] font-semibold text-amber-800">
                            -${order.seniatTax16Usdt} (16% IVA SENIAT)
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Pie del Libro */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50 px-4 py-3 text-xs">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-emerald-600" />
            <span className="font-bold text-slate-700">
              Libro preparado conforme a normas contables venezolanas para
              declaración quincenal / mensual de IVA.
            </span>
          </div>

          <button
            type="button"
            onClick={handleDownloadExcel}
            className="font-bold text-emerald-700 hover:text-emerald-900 hover:underline"
          >
            Descargar este libro en Excel (.XLSX) &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
