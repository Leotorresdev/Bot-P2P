"use client";

import * as React from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Filter,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  useP2POrdersQuery,
  useP2PSummaryQuery,
  useSyncBinanceMutation,
} from "@/features/p2p-ledger/api/use-p2p-queries";
import type {
  OrderStatusFilter,
  PeriodFilter,
  TradeTypeFilter,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import { useLedgerUiStore } from "@/features/p2p-ledger/store/use-ledger-ui-store";
import {
  formatDecimalWithCommas,
  formatUsdtAmount,
  formatVesAmount,
  getStatusCategoryBadgeStyle,
  getTradeTypeBadgeStyle,
} from "@/lib/format-currency";
import {
  getCurrentVetDateIso,
  getCurrentVetMonthIso,
} from "@/lib/timezone-utc4";
import { cn } from "@/lib/utils";

interface LiveOperationsLedgerProps {
  readonly onBackToTerminal?: () => void;
}

const BANKS = [
  "Banesco",
  "Pago Móvil",
  "Mercantil",
  "BBVA",
  "Banco de Venezuela",
  "Bancamiga",
  "BNC",
] as const;

export function LiveOperationsLedger({
  onBackToTerminal,
}: LiveOperationsLedgerProps) {
  const { setClosingExportModalOpen } = useLedgerUiStore();
  const [period, setPeriod] = React.useState<PeriodFilter>("ALL");
  const [tradeType, setTradeType] = React.useState<TradeTypeFilter>("ALL");
  const [statusFilter, setStatusFilter] =
    React.useState<OrderStatusFilter>("ALL");
  const [bankFilter, setBankFilter] = React.useState<string>("");
  const [dateFilter, setDateFilter] = React.useState<string>("");
  const [monthFilter, setMonthFilter] = React.useState<string>("");
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [page, setPage] = React.useState<number>(1);
  const limit = 50;

  React.useEffect(() => {
    setDateFilter((prev) => prev || getCurrentVetDateIso());
    setMonthFilter((prev) => prev || getCurrentVetMonthIso());
  }, []);

  const syncMutation = useSyncBinanceMutation();

  const ordersQuery = useP2POrdersQuery({
    period,
    tradeType,
    status: statusFilter,
    bank: bankFilter || undefined,
    date: period === "DAY" ? dateFilter : undefined,
    month: period === "MONTH" ? monthFilter : undefined,
    page,
    limit,
  });

  const summaryQuery = useP2PSummaryQuery({
    period: period === "ALL" ? "MONTH" : period,
    method: "FIFO",
    date: period === "DAY" ? dateFilter : undefined,
    month: period === "MONTH" ? monthFilter : undefined,
  });

  const ordersData = ordersQuery.data;
  const totalCount = ordersData?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / limit));

  const visibleItems = React.useMemo(() => {
    const items = ordersData?.items ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.advNo.toLowerCase().includes(q) ||
        o.counterPartNickName.toLowerCase().includes(q) ||
        o.payMethodName.toLowerCase().includes(q)
    );
  }, [ordersData?.items, searchQuery]);

  const handleResetFilters = () => {
    setPeriod("ALL");
    setTradeType("ALL");
    setStatusFilter("ALL");
    setBankFilter("");
    setSearchQuery("");
    setPage(1);
  };

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs sm:p-5">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <h2 className="text-base font-extrabold text-slate-900">
              Historial Íntegro de Órdenes Binance P2P (Espejo Cronológico)
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            Cero alteración ni reordenamiento interno · Ordenado por `createTime` descendente en hora oficial de Venezuela (`America/Caracas`).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onBackToTerminal && (
            <button
              type="button"
              onClick={onBackToTerminal}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Centro de Comando</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                (syncMutation.isPending || ordersQuery.isFetching) &&
                  "animate-spin text-emerald-600"
              )}
            />
            <span>Sincronizar Binance</span>
          </button>
          <button
            type="button"
            onClick={() => setClosingExportModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-700"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Cierre Día / Mes (Excel / PDF)</span>
          </button>
        </div>
      </div>

      {/* Contadores rápidos del resultado filtrado */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-slate-500">
            Órdenes Totales
          </p>
          <p className="font-mono text-base font-extrabold text-slate-900">
            {totalCount}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-emerald-700">
            Completadas
          </p>
          <p className="font-mono text-base font-extrabold text-emerald-800">
            {ordersData?.completedCount ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-100/70 px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-slate-600">
            Canceladas
          </p>
          <p className="font-mono text-base font-extrabold text-slate-800">
            {ordersData?.cancelledCount ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-amber-700">
            Apeladas
          </p>
          <p className="font-mono text-base font-extrabold text-amber-800">
            {ordersData?.appealCount ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-rose-700">
            Ventas (VENTA)
          </p>
          <p className="font-mono text-base font-extrabold text-rose-800">
            {ordersData?.sellCount ?? 0}
          </p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2">
          <p className="text-[10px] font-bold uppercase text-emerald-700">
            Compras (COMPRA)
          </p>
          <p className="font-mono text-base font-extrabold text-emerald-800">
            {ordersData?.buyCount ?? 0}
          </p>
        </div>
      </div>

      {/* Barra de Filtros Explícitos */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500">
            <Filter className="h-3.5 w-3.5" />
            Período:
          </span>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            {(
              [
                { id: "ALL", label: "Todo el Espejo" },
                { id: "TODAY", label: "Hoy" },
                { id: "MONTH", label: "Este Mes" },
                { id: "DAY", label: "Día" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setPeriod(item.id);
                  setPage(1);
                }}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-bold transition-all",
                  period === item.id
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          {period === "DAY" && (
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs font-bold text-slate-800"
            />
          )}

          {period === "MONTH" && (
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => {
                setMonthFilter(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-mono text-xs font-bold text-slate-800"
            />
          )}

          {/* Tipo */}
          <select
            value={tradeType}
            onChange={(e) => {
              setTradeType(e.target.value as TradeTypeFilter);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700"
          >
            <option value="ALL">Tipo: Todas</option>
            <option value="BUY">Solo COMPRA (Verde)</option>
            <option value="SELL">Solo VENTA (Rojo)</option>
          </select>

          {/* Estado */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as OrderStatusFilter);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700"
          >
            <option value="ALL">Estado: Todos</option>
            <option value="COMPLETED">Completadas</option>
            <option value="CANCELLED">Canceladas</option>
            <option value="IN_APPEAL">Apeladas / Disputa</option>
            <option value="IN_PROGRESS">En curso</option>
          </select>

          {/* Banco opcional */}
          <select
            value={bankFilter}
            onChange={(e) => {
              setBankFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700"
          >
            <option value="">Todos los bancos</option>
            {BANKS.map((bank) => (
              <option key={bank} value={bank}>
                {bank}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar orden, advNo, alias..."
              className="w-52 rounded-lg border border-slate-200 bg-white py-1 pl-8 pr-7 text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {(period !== "ALL" ||
            tradeType !== "ALL" ||
            statusFilter !== "ALL" ||
            bankFilter !== "" ||
            searchQuery !== "") && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-900"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Resumen de Brecha del período en el pie/cabecera */}
      {summaryQuery.data && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200/70 bg-emerald-50/40 px-3.5 py-2 text-xs">
          <span className="font-semibold text-slate-700">
            Resumen Motor Vuelta ({summaryQuery.data.periodLabel}):{" "}
            <strong className="font-mono text-slate-900">
              Brecha {summaryQuery.data.brechaPointsVes} pts
            </strong>{" "}
            ·{" "}
            <strong className="font-mono text-emerald-700">
              Neta {formatUsdtAmount(summaryQuery.data.netProfitUsdt)} (
              {formatVesAmount(summaryQuery.data.netProfitVes)})
            </strong>
          </span>
          <span className="font-mono text-[11px] font-bold text-slate-600">
            Insignia: {summaryQuery.data.merchantBadgeLabel}
          </span>
        </div>
      )}

      {/* Tabla Exacta de 8 Columnas (7 Obligatorias + Banco/Contraparte) */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[960px] border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
              <th className="px-3.5 py-2.5">N° Orden / N° Anuncio</th>
              <th className="px-3.5 py-2.5">Fecha y Hora (VET -4:00)</th>
              <th className="px-3.5 py-2.5">Tipo</th>
              <th className="px-3.5 py-2.5">Estado</th>
              <th className="px-3.5 py-2.5">Banco / Contraparte</th>
              <th className="px-3.5 py-2.5 text-right">Precio / Tasa (Bs)</th>
              <th className="px-3.5 py-2.5 text-right">Cantidad (USDT)</th>
              <th className="px-3.5 py-2.5 text-right">Monto Total (Bs)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ordersQuery.isLoading ? (
              Array.from({ length: 8 }).map((_, idx) => (
                <tr key={idx}>
                  <td colSpan={8} className="px-3.5 py-3">
                    <div className="h-5 animate-pulse rounded bg-slate-100" />
                  </td>
                </tr>
              ))
            ) : visibleItems.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-xs font-semibold text-slate-500"
                >
                  No hay órdenes registradas en este filtro.
                </td>
              </tr>
            ) : (
              visibleItems.map((order) => {
                const typeStyle = getTradeTypeBadgeStyle(order.tradeType);
                const statusStyle = getStatusCategoryBadgeStyle(
                  order.statusCategory
                );
                return (
                  <tr
                    key={order.orderNumber}
                    className="transition-colors hover:bg-slate-50/80"
                  >
                    <td className="px-3.5 py-2.5 font-mono">
                      <p className="font-bold text-slate-900">
                        {order.orderNumber}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Adv: {order.advNo}
                      </p>
                    </td>
                    <td className="px-3.5 py-2.5 font-mono text-slate-700">
                      {order.timeVetLabel}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span
                        className={cn(
                          "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-extrabold",
                          typeStyle.badgeClass
                        )}
                      >
                        {typeStyle.label}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold",
                          statusStyle.badgeClass
                        )}
                        title={`Binance raw status: ${order.orderStatus}`}
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
                    <td className="px-3.5 py-2.5">
                      <p className="font-semibold text-slate-800">
                        {order.payMethodName}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {order.counterPartNickName}
                      </p>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-bold text-slate-800">
                      {formatDecimalWithCommas(order.unitPriceVes)} Bs.
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-extrabold text-slate-900">
                      {formatUsdtAmount(order.amountUsdt)}
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono font-extrabold text-slate-900">
                      {formatVesAmount(order.totalPriceVes)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <span>
          Página <strong>{page}</strong> de <strong>{totalPages}</strong> ·{" "}
          <strong>{totalCount}</strong> órdenes totales
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Anterior</span>
          </button>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            <span>Siguiente</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
