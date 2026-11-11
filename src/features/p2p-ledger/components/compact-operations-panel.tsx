"use client";

import * as React from "react";
import {
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  RefreshCw,
  Download,
  CheckCircle2,
  X,
  FileCheck2,
  Clock,
  Layers,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";
import {
  useP2POrdersQuery,
  useP2PSummaryQuery,
  useSyncBinanceMutation,
} from "@/features/p2p-ledger/api/use-p2p-queries";
import type {
  PeriodFilter,
  TradeTypeFilter,
  P2POrderRowDto,
  LotMethod,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import { useLedgerUiStore } from "@/features/p2p-ledger/store/use-ledger-ui-store";
import { cn } from "@/lib/utils";

interface CompactOperationsPanelProps {
  readonly period: PeriodFilter;
  readonly method?: LotMethod;
  readonly selectedBank: string | null;
  readonly onSelectBank: (bank: string | null) => void;
  readonly onOpenFullLedger?: () => void;
}

const BANK_STYLES: Record<string, { bg: string; text: string; dot: string }> = {
  Banesco: { bg: "bg-emerald-50", text: "text-emerald-800", dot: "bg-emerald-500" },
  "Pago Móvil": { bg: "bg-violet-50", text: "text-violet-800", dot: "bg-violet-500" },
  Mercantil: { bg: "bg-blue-50", text: "text-blue-800", dot: "bg-blue-600" },
  BBVA: { bg: "bg-sky-50", text: "text-sky-800", dot: "bg-sky-500" },
  "Banco de Venezuela": { bg: "bg-rose-50", text: "text-rose-800", dot: "bg-rose-600" },
  Bancamiga: { bg: "bg-teal-50", text: "text-teal-800", dot: "bg-teal-600" },
  BNC: { bg: "bg-amber-50", text: "text-amber-800", dot: "bg-amber-600" },
};

export function CompactOperationsPanel({
  period,
  method = "FIFO",
  selectedBank,
  onSelectBank,
  onOpenFullLedger,
}: CompactOperationsPanelProps) {
  const { setActiveTab } = useLedgerUiStore();
  const [activeTab, setActivePanelTab] = React.useState<"ORDERS" | "LOTS" | "CLOSING">("ORDERS");
  const [tradeType, setTradeType] = React.useState<TradeTypeFilter>("ALL");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedOrder, setSelectedOrder] = React.useState<P2POrderRowDto | null>(null);

  const syncMutation = useSyncBinanceMutation();
  const [syncFeedback, setSyncFeedback] = React.useState<string | null>(null);

  const { data: ordersData, isLoading, isFetching } = useP2POrdersQuery({
    period,
    tradeType,
    bank: selectedBank ?? undefined,
    page: 1,
  });

  const { data: summary } = useP2PSummaryQuery(period, method);

  const handleManualSync = async () => {
    try {
      const res = await syncMutation.mutateAsync();
      setSyncFeedback(res.message);
      setTimeout(() => setSyncFeedback(null), 3000);
    } catch (err) {
      setSyncFeedback(err instanceof Error ? err.message : "Error al sincronizar");
      setTimeout(() => setSyncFeedback(null), 3500);
    }
  };

  const orders = (ordersData?.items ?? []) as readonly P2POrderRowDto[];
  const filteredOrders = React.useMemo(() => {
    if (!searchQuery.trim()) return orders;
    const q = searchQuery.toLowerCase();
    return orders.filter(
      (o: P2POrderRowDto) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.counterPartNickName.toLowerCase().includes(q) ||
        o.payMethodName.toLowerCase().includes(q)
    );
  }, [orders, searchQuery]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
      {/* Cabecera del Panel con Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 sm:px-5">
        {/* Selector de Pestaña */}
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={() => setActivePanelTab("ORDERS")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition-all",
              activeTab === "ORDERS"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <span>Órdenes</span>
            <span className={cn(
              "rounded-full px-1.5 py-0.2 text-[10px] font-extrabold",
              activeTab === "ORDERS" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-600"
            )}>
              {ordersData?.totalCount ?? orders.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActivePanelTab("LOTS")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition-all",
              activeTab === "LOTS"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <Layers className="h-3 w-3" />
            <span>Lotes FIFO</span>
          </button>

          <button
            type="button"
            onClick={() => setActivePanelTab("CLOSING")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold transition-all",
              activeTab === "CLOSING"
                ? "bg-slate-900 text-white shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <Clock className="h-3 w-3" />
            <span>Cierre 11:59</span>
          </button>
        </div>

        {/* Acciones Rápidas: Sincronizar + Descargar Excel */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleManualSync}
            disabled={syncMutation.isPending}
            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 transition-all hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
            title="Sincronizar órdenes con Binance P2P"
          >
            <RefreshCw
              className={cn("h-3 w-3", syncMutation.isPending && "animate-spin text-emerald-600")}
            />
            <span className="hidden sm:inline">
              {syncMutation.isPending ? "Sincronizando..." : "Sincronizar"}
            </span>
          </button>

          <a
            href="/api/p2p/export-csv"
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-2xs transition-all hover:bg-emerald-500"
            title="Descargar libro de órdenes en Excel/CSV"
          >
            <Download className="h-3 w-3" />
            <span className="hidden sm:inline">Excel</span>
          </a>
        </div>
      </div>

      {/* Contenido según Pestaña Activa */}
      {activeTab === "ORDERS" && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Sub-barra: Buscador + Filtro Compra/Venta */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-white px-4 py-2">
            {/* Buscador */}
            <div className="relative flex flex-1 items-center max-w-[200px]">
              <Search className="pointer-events-none absolute left-2.5 h-3 w-3 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar cliente u orden..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1 pl-7 pr-6 text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Filtros Tipo */}
            <div className="flex items-center gap-1">
              {(
                [
                  { id: "ALL", label: "Todas" },
                  { id: "SELL", label: "Ventas" },
                  { id: "BUY", label: "Compras" },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTradeType(f.id)}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] font-bold transition-all",
                    tradeType === f.id
                      ? f.id === "SELL"
                        ? "bg-emerald-600 text-white"
                        : f.id === "BUY"
                          ? "bg-blue-600 text-white"
                          : "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  )}
                >
                  {f.label}
                </button>
              ))}

              {selectedBank && (
                <button
                  type="button"
                  onClick={() => onSelectBank(null)}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-slate-700"
                  title="Quitar filtro de banco"
                >
                  <span>{selectedBank}</span>
                  <X className="h-2.5 w-2.5 text-emerald-400" />
                </button>
              )}
            </div>
          </div>

          {/* Feedback de Sincronización */}
          {syncFeedback && (
            <div className="bg-emerald-50 px-4 py-1 text-center text-xs font-bold text-emerald-800 border-b border-emerald-200">
              {syncFeedback}
            </div>
          )}

          {/* Lista de Órdenes con Scroll Interno Controlado */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 px-3 py-1.5 max-h-[380px] sm:max-h-[420px]">
            {isLoading ? (
              <div className="flex h-40 items-center justify-center text-xs font-bold text-slate-400">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin text-emerald-500" />
                Cargando libro de órdenes...
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-1 text-center text-slate-400">
                <FileCheck2 className="h-8 w-8 text-slate-300" />
                <span className="text-xs font-bold text-slate-600">
                  Sin operaciones registradas
                </span>
                <span className="text-[11px] text-slate-400 max-w-[240px]">
                  {selectedBank
                    ? `No hay órdenes para ${selectedBank} en este ciclo.`
                    : "Tus compras y ventas en Binance aparecerán aquí en vivo."}
                </span>
              </div>
            ) : (
              filteredOrders.map((order: P2POrderRowDto) => {
                const isBuy = order.tradeType === "BUY";
                const bStyle = BANK_STYLES[order.payMethodName] ?? {
                  bg: "bg-slate-100",
                  text: "text-slate-700",
                  dot: "bg-slate-400",
                };

                return (
                  <div
                    key={order.orderNumber}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedOrder(order)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setSelectedOrder(order);
                    }}
                    className="group flex items-center justify-between gap-3 px-2 py-2.5 transition-all hover:bg-slate-50/80 rounded-xl cursor-pointer"
                  >
                    {/* Lado Izquierdo: Tipo + Banco + Hora */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={cn(
                          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-bold",
                          isBuy
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        )}
                      >
                        {isBuy ? (
                          <ArrowDownLeft className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        )}
                      </div>

                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-extrabold text-slate-900 truncate">
                            {isBuy ? "Compra USDT" : "Venta USDT"}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.2 text-[9px] font-bold",
                              bStyle.bg,
                              bStyle.text
                            )}
                          >
                            <span className={cn("h-1.5 w-1.5 rounded-full", bStyle.dot)} />
                            {order.payMethodName}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 truncate">
                          {order.timeVetLabel.split("•")[0]?.trim()} • #{order.orderNumber.slice(-6)}
                        </span>
                      </div>
                    </div>

                    {/* Lado Derecho: Montos + Ganancia Libre */}
                    <div className="flex flex-col items-end shrink-0">
                      <span className="text-xs font-extrabold text-slate-900">
                        {isBuy ? "-" : "+"}${order.amountUsdt} USDT
                      </span>
                      <div className="flex items-center gap-1 text-[10px]">
                        <span className="text-slate-500 font-medium">
                          @{parseFloat(order.unitPriceVes).toFixed(2)} Bs.
                        </span>
                        {!isBuy && (
                          <span className="font-extrabold text-emerald-700 bg-emerald-50 px-1 rounded-xs">
                            +{order.netFreeProfitVes} Bs.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pie del Panel: Acceso al Libro Completo */}
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-2 text-[11px]">
            <span className="text-slate-500 font-medium">
              Mostrando {filteredOrders.length} de {ordersData?.totalCount ?? orders.length}
            </span>
            {onOpenFullLedger && (
              <button
                type="button"
                onClick={onOpenFullLedger}
                className="flex items-center gap-1 font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
              >
                <span>Ver Libro Extendido</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Lotes FIFO e Inventario */}
      {activeTab === "LOTS" && (
        <div className="flex flex-1 flex-col gap-4 p-4 text-xs">
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 border border-emerald-200">
            <Sparkles className="h-5 w-5 text-emerald-600 shrink-0" />
            <div className="flex flex-col">
              <span className="font-bold text-emerald-950">Inventario FIFO Activo</span>
              <span className="text-[11px] text-emerald-800">
                Cada venta deduce USDT del lote de compra más antiguo deduciendo la comisión de 0.163%.
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Costo Base WAC:</span>
              <p className="font-display text-lg font-extrabold text-slate-900 mt-1">
                {summary?.currentWacCostVes ?? "0.00"} Bs.
              </p>
              <span className="text-[10px] text-slate-400">Por USDT disponible</span>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Bóveda Disponible:</span>
              <p className="font-display text-lg font-extrabold text-emerald-700 mt-1">
                ${summary?.availableVaultUsdt ?? "0.00"}
              </p>
              <span className="text-[10px] text-slate-400">USDT para rotar</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 bg-white">
            <span className="text-xs font-bold text-slate-800">Comisiones Binance Deducidas:</span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-extrabold text-slate-900">
                ${summary?.totalBinanceFeesUsdt ?? "0.00"} USDT
              </span>
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                Tasa Maker: {summary?.makerFeeRatePercent ?? "0.163"}%
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Cierre 11:59 PM VET */}
      {activeTab === "CLOSING" && (
        <div className="flex flex-1 flex-col gap-4 p-4 text-xs">
          <div className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 border border-amber-200">
            <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="flex flex-col">
              <span className="font-bold text-amber-950">Acta Inmutable 11:59 PM VET</span>
              <span className="text-[11px] text-amber-800">
                Todos los días a las 23:59:00 se sella criptográficamente el libro con hash SHA-256.
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase text-slate-500">Próximo Cierre:</span>
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-white">
                {summary?.nextClosingTimeVet ?? "11:59 PM VET"}
              </span>
            </div>
            <p className="text-[11px] text-slate-600">
              Genera automáticamente el acta fiscal en cumplimiento de la norma contable BA VEN-NIF.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab("VAULT_AND_CLOSINGS")}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-slate-800"
          >
            <span>Ver Historial de Cierres Diarios</span>
            <ExternalLink className="h-3.5 w-3.5 text-emerald-400" />
          </button>
        </div>
      )}

      {/* Modal de Detalle de Orden */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="font-display font-extrabold text-slate-900">
                  Orden #{selectedOrder.orderNumber}
                </span>
                <span
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] font-bold",
                    selectedOrder.tradeType === "BUY"
                      ? "bg-blue-100 text-blue-800"
                      : "bg-emerald-100 text-emerald-800"
                  )}
                >
                  {selectedOrder.tradeType === "BUY" ? "Compra" : "Venta"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2.5 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Banco:</span>
                <span className="font-bold text-slate-900">{selectedOrder.payMethodName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Contraparte:</span>
                <span className="font-bold text-slate-900">{selectedOrder.counterPartNickName}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Monto USDT:</span>
                <span className="font-extrabold text-slate-900">${selectedOrder.amountUsdt}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Tasa de Operación:</span>
                <span className="font-bold text-slate-900">
                  {parseFloat(selectedOrder.unitPriceVes).toFixed(2)} Bs./USDT
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Total Bolívares:</span>
                <span className="font-extrabold text-slate-900">
                  {parseFloat(selectedOrder.totalPriceVes).toLocaleString("es-VE", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  Bs.
                </span>
              </div>

              {selectedOrder.tradeType === "SELL" && (
                <>
                  <div className="flex justify-between py-1 border-b border-slate-100 bg-emerald-50/50 px-2 rounded-md">
                    <span className="text-emerald-800 font-semibold">Ganancia Neta Libre:</span>
                    <span className="font-extrabold text-emerald-700">
                      +{selectedOrder.netFreeProfitVes} Bs. (${selectedOrder.netFreeProfitUsdt})
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 px-2">
                    <span className="text-slate-500">Provisión SENIAT (16%):</span>
                    <span className="font-bold text-slate-700">
                      {selectedOrder.seniatTax16Ves} Bs.
                    </span>
                  </div>
                  <div className="flex justify-between py-1 px-2">
                    <span className="text-slate-500">Capital Exento de IVA:</span>
                    <span className="font-bold text-slate-700">
                      {parseFloat(selectedOrder.exemptCapitalVes).toLocaleString("es-VE", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      Bs.
                    </span>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSelectedOrder(null)}
              className="mt-4 w-full rounded-xl bg-slate-900 py-2 text-xs font-bold text-white hover:bg-slate-800"
            >
              Cerrar Detalle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
