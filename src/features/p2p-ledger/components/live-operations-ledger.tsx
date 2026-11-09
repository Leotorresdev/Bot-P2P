"use client";

import * as React from "react";
import {
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Wallet,
  PiggyBank,
  CheckCircle2,
  X,
  RefreshCw,
} from "lucide-react";
import {
  useP2POrdersQuery,
  useP2PSummaryQuery,
  useSyncBinanceMutation,
} from "@/features/p2p-ledger/api/use-p2p-queries";
import type {
  PeriodFilter,
  TradeTypeFilter,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import { cn } from "@/lib/utils";

interface LiveOperationsLedgerProps {
  readonly period: PeriodFilter;
  readonly selectedBank: string | null;
  readonly onSelectBank: (bank: string | null) => void;
}

const BANK_BADGE_STYLES: Record<
  string,
  { bg: string; text: string; border: string; dot: string }
> = {
  Banesco: {
    bg: "bg-emerald-50",
    text: "text-emerald-800",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
  },
  "Pago Móvil": {
    bg: "bg-violet-50",
    text: "text-violet-800",
    border: "border-violet-200",
    dot: "bg-violet-500",
  },
  Mercantil: {
    bg: "bg-blue-50",
    text: "text-blue-800",
    border: "border-blue-200",
    dot: "bg-blue-600",
  },
  BBVA: {
    bg: "bg-sky-50",
    text: "text-sky-800",
    border: "border-sky-200",
    dot: "bg-sky-500",
  },
  "Banco de Venezuela": {
    bg: "bg-rose-50",
    text: "text-rose-800",
    border: "border-rose-200",
    dot: "bg-rose-600",
  },
  Bancamiga: {
    bg: "bg-teal-50",
    text: "text-teal-800",
    border: "border-teal-200",
    dot: "bg-teal-600",
  },
  BNC: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
    dot: "bg-amber-600",
  },
};

function formatVes(val: string | number): string {
  const num = typeof val === "string" ? parseFloat(val.replace(/,/g, "")) : val;
  if (isNaN(num)) return String(val);
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function LiveOperationsLedger({
  period,
  selectedBank,
  onSelectBank,
}: LiveOperationsLedgerProps) {
  const [tradeType, setTradeType] = React.useState<TradeTypeFilter>("ALL");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [expandedOrder, setExpandedOrder] = React.useState<string | null>(null);
  const [page, setPage] = React.useState<number>(1);

  const ordersQuery = useP2POrdersQuery({
    period,
    tradeType,
    bank: selectedBank ?? undefined,
    page,
  });

  const summaryQuery = useP2PSummaryQuery(period, "FIFO");
  const syncMutation = useSyncBinanceMutation();
  const [syncFeedback, setSyncFeedback] = React.useState<string | null>(null);

  const handleManualSync = () => {
    setSyncFeedback(null);
    syncMutation.mutate(undefined, {
      onSuccess: (res) => {
        setSyncFeedback(res.message);
        setTimeout(() => setSyncFeedback(null), 4000);
      },
      onError: (err) => {
        setSyncFeedback(`Error: ${err.message}`);
        setTimeout(() => setSyncFeedback(null), 5000);
      },
    });
  };

  const data = ordersQuery.data;
  const allRows = data?.items ?? [];

  const filteredRows = React.useMemo(() => {
    if (!searchQuery.trim()) return allRows;
    const q = searchQuery.toLowerCase().trim();
    return allRows.filter(
      (r) =>
        r.orderNumber.toLowerCase().includes(q) ||
        r.counterPartNickName.toLowerCase().includes(q) ||
        r.payMethodName.toLowerCase().includes(q)
    );
  }, [allRows, searchQuery]);

  const toggleExpand = (orderNum: string) => {
    setExpandedOrder((prev) => (prev === orderNum ? null : orderNum));
  };

  return (
    <section
      aria-label="Tus Operaciones de Hoy"
      className="flex w-full flex-col gap-5 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
    >
      {/* Cabecera: Título + Buscador + Filtros de Tipo */}
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="font-display text-xl font-extrabold tracking-tight text-slate-900">
              Historial de Compras y Ventas
            </h2>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-0.5 text-xs font-extrabold text-emerald-700">
              {filteredRows.length} operaciones
            </span>
            <button
              type="button"
              onClick={handleManualSync}
              disabled={syncMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100/70 px-3 py-1 text-xs font-bold text-emerald-800 transition-all hover:bg-emerald-200 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                className={cn(
                  "h-3 w-3 text-emerald-700",
                  syncMutation.isPending && "animate-spin"
                )}
              />
              <span>
                {syncMutation.isPending
                  ? "Sincronizando..."
                  : "Sincronizar con Binance"}
              </span>
            </button>
            {syncFeedback && (
              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                {syncFeedback}
              </span>
            )}
          </div>
          <p className="text-xs font-medium text-slate-500">
            Haz clic sobre cualquier operación para ver la explicación paso a
            paso de tu ganancia.
          </p>
        </div>

        {/* Barra de Búsqueda + Selector Todas / Ventas / Compras */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Buscador */}
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar cliente u orden..."
              className="w-52 rounded-xl border border-slate-200 bg-slate-50 py-2 pl-8 pr-7 text-xs font-medium text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filtros de Tipo de Operación */}
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1">
            {(
              [
                {
                  id: "ALL",
                  label: `Todas (${data?.totalCount ?? 0})`,
                  activeClass: "bg-slate-900 text-white shadow-sm",
                },
                {
                  id: "SELL",
                  label: `Solo Ventas (${data?.sellCount ?? 0})`,
                  activeClass: "bg-emerald-600 text-white shadow-sm",
                },
                {
                  id: "BUY",
                  label: `Solo Compras (${data?.buyCount ?? 0})`,
                  activeClass: "bg-blue-600 text-white shadow-sm",
                },
              ] as const satisfies readonly {
                id: TradeTypeFilter;
                label: string;
                activeClass: string;
              }[]
            ).map((filter) => {
              const isActive = tradeType === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => {
                    setTradeType(filter.id);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                    isActive
                      ? filter.activeClass
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Píldoras Rápidas de Bancos */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-500 mr-1">
          Filtrar por banco:
        </span>
        <button
          type="button"
          onClick={() => onSelectBank(null)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-bold transition-all",
            selectedBank === null
              ? "bg-slate-900 text-white shadow-sm"
              : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
          )}
        >
          Todos
        </button>
        {(
          [
            "Banesco",
            "Pago Móvil",
            "Mercantil",
            "BBVA",
            "Banco de Venezuela",
            "Bancamiga",
            "BNC",
          ] as const
        ).map((bankName) => {
            const isActive = selectedBank === bankName;
            const style = BANK_BADGE_STYLES[bankName];
            return (
              <button
                key={bankName}
                type="button"
                onClick={() => onSelectBank(isActive ? null : bankName)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition-all",
                  isActive
                    ? cn(
                        style?.bg,
                        style?.text,
                        style?.border,
                        "ring-2 ring-offset-1 ring-slate-800"
                      )
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", style?.dot)} />
                {bankName}
              </button>
            );
          }
        )}
      </div>

      {/* Tabla Interactiva y Clara */}
      <div className="w-full overflow-x-auto">
        <div className="min-w-[1050px]">
          {/* Encabezados Simples */}
          <div className="grid grid-cols-12 items-center rounded-xl border border-slate-200/80 bg-slate-50/90 px-4 py-3 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
            <div className="col-span-2">Hora y Orden</div>
            <div className="col-span-1">Operación</div>
            <div className="col-span-2">Banco y Cliente</div>
            <div className="col-span-2">Cantidad USDT</div>
            <div className="col-span-2">Tasa de Cambio (USDT/VES)</div>
            <div className="col-span-1">Monto en Bs.</div>
            <div className="col-span-2 text-right text-emerald-800">
              Tu Ganancia Libre
            </div>
          </div>

          {/* Lista de Operaciones */}
          <div className="mt-2 flex flex-col gap-2">
            {filteredRows.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/50 py-10 text-center">
                <span className="text-sm font-bold text-slate-700">
                  Aún no tienes operaciones registradas en este período
                </span>
                <span className="max-w-md text-xs font-medium text-slate-500">
                  Conecta tu API Key de Solo Lectura de Binance en la pestaña
                  &quot;Conexión y Cierres&quot; para sincronizar tus compras y
                  ventas automáticamente.
                </span>
              </div>
            ) : null}
            {filteredRows.map((order) => {
              const isBuy = order.tradeType === "BUY";
              const isExpanded = expandedOrder === order.orderNumber;
              const bankStyle = BANK_BADGE_STYLES[order.payMethodName] ?? {
                bg: "bg-slate-100",
                text: "text-slate-800",
                border: "border-slate-200",
                dot: "bg-slate-500",
              };

              return (
                <div
                  key={order.orderNumber}
                  className={cn(
                    "overflow-hidden rounded-xl border transition-all duration-150",
                    isExpanded
                      ? "border-emerald-400 bg-white shadow-md"
                      : isBuy
                        ? "border-slate-200/70 bg-slate-50/40 hover:border-blue-300 hover:bg-blue-50/20"
                        : "border-slate-200/80 bg-white hover:border-emerald-300 hover:bg-emerald-50/20"
                  )}
                >
                  {/* Fila Principal Clickable */}
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleExpand(order.orderNumber)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleExpand(order.orderNumber);
                      }
                    }}
                    className="grid cursor-pointer grid-cols-12 items-center px-4 py-3.5"
                  >
                    {/* 1. Hora y Orden */}
                    <div className="col-span-2 flex flex-col gap-0.5">
                      <span className="text-xs font-extrabold text-slate-900">
                        {order.timeVetLabel}
                      </span>
                      <span className="font-mono text-[11px] font-medium text-slate-400">
                        Orden #{order.orderNumber}
                      </span>
                    </div>

                    {/* 2. Operación: Venta vs Compra */}
                    <div className="col-span-1">
                      {isBuy ? (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-extrabold text-blue-700">
                          <ArrowDownLeft className="h-3.5 w-3.5" />
                          Compra
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-700">
                          <ArrowUpRight className="h-3.5 w-3.5" />
                          Venta
                        </span>
                      )}
                    </div>

                    {/* 3. Banco y Cliente */}
                    <div className="col-span-2 flex flex-col items-start gap-1">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-bold",
                          bankStyle.bg,
                          bankStyle.text,
                          bankStyle.border
                        )}
                      >
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            bankStyle.dot
                          )}
                        />
                        {order.payMethodName}
                      </span>
                      <span className="text-[11px] font-medium text-slate-500 pl-1">
                        Cliente: {order.counterPartNickName}
                      </span>
                    </div>

                    {/* 4. Cantidad USDT */}
                    <div className="col-span-2 flex flex-col gap-0.5">
                      <span className="text-sm font-extrabold text-slate-900">
                        {order.amountUsdt} USDT
                      </span>
                      <span className="text-[11px] font-medium text-slate-500">
                        {isBuy
                          ? `Recibiste: ${order.netBuyUsdt} USDT`
                          : `Comisión: -${order.commissionUsdt} USDT`}
                      </span>
                    </div>

                    {/* 5. Tasa de Cambio */}
                    <div className="col-span-2 flex flex-col gap-0.5">
                      <span className="text-sm font-extrabold text-slate-900">
                        {formatVes(order.unitPriceVes)} Bs.
                      </span>
                      <span className="text-[11px] font-medium text-slate-500">
                        {isBuy
                          ? "Tasa de compra inventario"
                          : `Comprado a ${formatVes(order.costBasisRateVes)} Bs.`}
                      </span>
                    </div>

                    {/* 6. Monto en Bs */}
                    <div className="col-span-1 flex flex-col gap-0.5">
                      <span
                        className={cn(
                          "text-xs font-extrabold",
                          isBuy ? "text-slate-600" : "text-slate-900"
                        )}
                      >
                        {isBuy
                          ? `-${formatVes(order.totalPriceVes)} Bs.`
                          : `+${formatVes(order.totalPriceVes)} Bs.`}
                      </span>
                      <span className="text-[10px] font-semibold text-amber-700">
                        {isBuy
                          ? "Recarga"
                          : `IVA: -${formatVes(order.seniatTax16Ves)} Bs.`}
                      </span>
                    </div>

                    {/* 7. Tu Ganancia Libre + Botón Expandir */}
                    <div className="col-span-2 flex items-center justify-end gap-3">
                      {isBuy ? (
                        <div className="flex flex-col items-end">
                          <span className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-800">
                            USDT Guardados
                          </span>
                          <span className="mt-0.5 text-[10px] font-medium text-slate-500">
                            Para próximas ventas
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-end">
                          <div className="flex items-center gap-1.5">
                            <span className="text-base font-extrabold text-emerald-600">
                              +${order.netFreeProfitUsdt}
                            </span>
                            <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-extrabold text-emerald-800">
                              +{order.marginPercent}%
                            </span>
                          </div>
                          <span className="text-xs font-bold text-slate-700">
                            +{formatVes(order.netFreeProfitVes)} Bs. libres
                          </span>
                        </div>
                      )}

                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* PANEL DESPLEGABLE INTERACTIVO: "¿CÓMO SE CALCULÓ ESTA OPERACIÓN?" */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-gradient-to-r from-slate-50 via-emerald-50/30 to-slate-50 px-5 py-4">
                      {isBuy ? (
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
                              <Wallet className="h-5 w-5" />
                            </div>
                            <div>
                              <h4 className="text-sm font-extrabold text-slate-900">
                                Compra de Inventario (No paga impuesto)
                              </h4>
                              <p className="text-xs text-slate-600">
                                Invertiste{" "}
                                <strong>
                                  {formatVes(order.totalPriceVes)} Bs.
                                </strong>{" "}
                                por <strong>{order.payMethodName}</strong> para
                                recargar{" "}
                                <strong>{order.netBuyUsdt} USDT</strong> a una
                                tasa de{" "}
                                <strong>
                                  {formatVes(order.unitPriceVes)} Bs.
                                </strong>
                              </p>
                            </div>
                          </div>
                          <span className="rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-800">
                            {order.lotRemainingLabel}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-900">
                            <Sparkles className="h-4 w-4 text-emerald-600" />
                            <span>
                              Explicación fácil de tu ganancia en esta venta:
                            </span>
                          </div>

                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                            <div className="rounded-xl border border-slate-200 bg-white p-3">
                              <span className="text-[11px] font-bold text-slate-500">
                                1. Recibiste en {order.payMethodName}
                              </span>
                              <div className="mt-1 text-base font-extrabold text-slate-900">
                                +{formatVes(order.totalPriceVes)} Bs.
                              </div>
                              <span className="text-[11px] text-slate-500">
                                Vendiste {order.amountUsdt} USDT a{" "}
                                {formatVes(order.unitPriceVes)} Bs.
                              </span>
                            </div>

                            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3">
                              <span className="text-[11px] font-bold text-blue-900">
                                2. Recuperas tu Capital
                              </span>
                              <div className="mt-1 text-base font-extrabold text-blue-950">
                                {formatVes(order.exemptCapitalVes)} Bs.
                              </div>
                              <span className="text-[11px] font-medium text-blue-700">
                                Los habías comprado a{" "}
                                {formatVes(order.costBasisRateVes)} Bs. (Sin
                                IVA)
                              </span>
                            </div>

                            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                              <span className="text-[11px] font-bold text-amber-900">
                                3. Apartado IVA (16%)
                              </span>
                              <div className="mt-1 text-base font-extrabold text-amber-700">
                                -{formatVes(order.seniatTax16Ves)} Bs.
                              </div>
                              <span className="text-[11px] font-medium text-amber-800">
                                Equivale a -${order.seniatTax16Usdt} USDT
                              </span>
                            </div>

                            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3">
                              <span className="text-[11px] font-extrabold text-emerald-900">
                                4. Ganancia Libre Para Ti
                              </span>
                              <div className="mt-1 text-base font-extrabold text-emerald-700">
                                +${order.netFreeProfitUsdt} USDT
                              </div>
                              <span className="text-[11px] font-bold text-emerald-800">
                                +{formatVes(order.netFreeProfitVes)} Bs. libres
                                en tu bolsillo
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Pie de Tabla: Resumen Rápido de tu Inventario */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-slate-50 px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span className="text-xs font-medium text-slate-600">
              USDT disponibles para vender:
            </span>
            <span className="text-sm font-extrabold text-slate-900">
              {summaryQuery.data?.availableVaultUsdt ?? "0.00"} USDT
            </span>
          </div>

          <div className="hidden h-4 w-px bg-slate-300 sm:block" />

          <div className="flex items-center gap-2">
            <PiggyBank className="h-4 w-4 text-blue-600" />
            <span className="text-xs font-medium text-slate-600">
              Precio promedio al que compraste:
            </span>
            <span className="text-sm font-extrabold text-slate-900">
              {summaryQuery.data?.currentWacCostVes ?? "1,021.60"} Bs.
            </span>
          </div>
        </div>

        <span className="text-xs font-semibold text-slate-500">
          Mostrando {filteredRows.length} operaciones recientes
        </span>
      </div>
    </section>
  );
}
