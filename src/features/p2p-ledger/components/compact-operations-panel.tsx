"use client";

import * as React from "react";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  useP2POrdersQuery,
  useSyncBinanceMutation,
} from "@/features/p2p-ledger/api/use-p2p-queries";
import type {
  OrderStatusFilter,
  P2POrderRowDto,
  PnlSummaryDto,
  TradeTypeFilter,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import {
  formatDecimalWithCommas,
  formatUsdtAmount,
  formatVesAmount,
  getStatusCategoryBadgeStyle,
  getTradeTypeBadgeStyle,
} from "@/lib/format-currency";
import { cn } from "@/lib/utils";

interface CompactOperationsPanelProps {
  readonly summary?: PnlSummaryDto;
  readonly onOpenFullLedger?: () => void;
}

export function CompactOperationsPanel({
  summary,
  onOpenFullLedger,
}: CompactOperationsPanelProps) {
  const [tradeType, setTradeType] = React.useState<TradeTypeFilter>("ALL");
  const [statusFilter, setStatusFilter] =
    React.useState<OrderStatusFilter>("ALL");
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [selectedOrder, setSelectedOrder] =
    React.useState<P2POrderRowDto | null>(null);

  const syncMutation = useSyncBinanceMutation();

  // Espejo Exacto de Binance P2P: period="ALL", orden estrictamente createTime DESC
  const { data: ordersData, isLoading, isFetching } = useP2POrdersQuery({
    period: "ALL",
    tradeType,
    status: statusFilter,
    page: 1,
    limit: 30,
  });

  const visibleOrders = React.useMemo(() => {
    const items = ordersData?.items ?? [];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (o) =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.advNo.toLowerCase().includes(q) ||
        o.counterPartNickName.toLowerCase().includes(q) ||
        o.payMethodName.toLowerCase().includes(q) ||
        o.statusLabel.toLowerCase().includes(q)
    );
  }, [ordersData?.items, searchQuery]);

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-slate-200/90 bg-white shadow-xs dark:border-[#2B3139] dark:bg-[#181A20]">
      {/* Cabecera Espejo Exacto */}
      <div>
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5 dark:border-[#2B3139]">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500 dark:bg-[#0ECB81]" />
              <h3 className="text-xs font-extrabold text-slate-900 dark:text-[#EAECEF]">
                Espejo Exacto Binance P2P (Tiempo Real)
              </h3>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-[#848E9C]">
              Orden cronológico idéntico (`createTime DESC`) · Todas las órdenes y estados
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              title="Sincronizar historial completo desde Binance C2C"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#EAECEF] dark:hover:border-[#FCD535]/50"
            >
              <RefreshCw
                className={cn(
                  "h-3 w-3",
                  (syncMutation.isPending || isFetching) &&
                    "animate-spin text-emerald-600 dark:text-[#FCD535]"
                )}
              />
              <span>Sync</span>
            </button>
            {onOpenFullLedger && (
              <button
                type="button"
                onClick={onOpenFullLedger}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-slate-800 dark:bg-[#FCD535] dark:text-[#0B0E11] dark:hover:bg-[#F0B90B]"
              >
                <span>Ver Todo</span>
                <ExternalLink className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        </div>

        {/* Barra compacta de búsqueda y filtros explícitos */}
        <div className="space-y-2 border-b border-slate-100 px-3.5 py-2 dark:border-[#2B3139]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-[#848E9C]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar N° Orden, Anuncio, contraparte o banco..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-7 text-[11px] text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#EAECEF] dark:placeholder:text-[#848E9C] dark:focus:border-[#FCD535]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:text-[#848E9C] dark:hover:text-[#EAECEF]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-1.5">
            {/* Tipo */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-[#2B3139] dark:bg-[#0B0E11]">
              {(
                [
                  { id: "ALL", label: "Todas" },
                  { id: "BUY", label: "COMPRA" },
                  { id: "SELL", label: "VENTA" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTradeType(item.id)}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] font-bold transition-all",
                    tradeType === item.id
                      ? item.id === "BUY"
                        ? "bg-emerald-600 text-white dark:bg-[#0ECB81] dark:text-[#0B0E11]"
                        : item.id === "SELL"
                          ? "bg-rose-600 text-white dark:bg-[#F6465D] dark:text-white"
                          : "bg-slate-900 text-white dark:bg-[#FCD535] dark:text-[#0B0E11]"
                      : "text-slate-600 hover:text-slate-900 dark:text-[#848E9C] dark:hover:text-[#EAECEF]"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Estado */}
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as OrderStatusFilter)
              }
              className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-700 focus:border-emerald-500 focus:outline-none dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#EAECEF] dark:focus:border-[#FCD535]"
            >
              <option value="ALL">Todos los estados</option>
              <option value="COMPLETED">Completadas</option>
              <option value="CANCELLED">Canceladas</option>
              <option value="IN_APPEAL">Apeladas / Disputa</option>
              <option value="IN_PROGRESS">En curso</option>
            </select>
          </div>
        </div>
      </div>

      {/* Lista Scrollable del Espejo Cronológico */}
      <div className="max-h-[430px] flex-1 divide-y divide-slate-100 overflow-y-auto px-3 py-1 dark:divide-[#2B3139]">
        {isLoading ? (
          <div className="space-y-2 py-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-14 animate-pulse rounded-xl bg-slate-100 dark:bg-[#1E2329]"
              />
            ))}
          </div>
        ) : visibleOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="h-7 w-7 text-slate-300 dark:text-[#2B3139]" />
            <p className="mt-2 text-xs font-bold text-slate-600 dark:text-[#EAECEF]">
              Sin órdenes que coincidan con la vista
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-[#848E9C]">
              Haz clic en Sync o verifica tus credenciales en la Bóveda.
            </p>
          </div>
        ) : (
          visibleOrders.map((order) => {
            const typeStyle = getTradeTypeBadgeStyle(order.tradeType);
            const statusStyle = getStatusCategoryBadgeStyle(
              order.statusCategory
            );
            return (
              <button
                key={order.orderNumber}
                type="button"
                onClick={() => setSelectedOrder(order)}
                className="flex w-full flex-col gap-1 rounded-xl px-2 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-[#1E2329]"
              >
                {/* Línea 1: Tipo + Estado + Cantidad USDT + Total Bs */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={cn(
                        "rounded-md border px-1.5 py-0.5 text-[10px] font-extrabold",
                        typeStyle.badgeClass
                      )}
                    >
                      {typeStyle.label}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold",
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

                  <div className="text-right font-mono tabular-nums">
                    <span className="text-xs font-extrabold text-slate-900 dark:text-[#EAECEF]">
                      {formatUsdtAmount(order.amountUsdt)}
                    </span>
                    <span className="ml-1.5 text-[11px] font-bold text-slate-500 dark:text-[#848E9C]">
                      · {formatVesAmount(order.totalPriceVes)}
                    </span>
                  </div>
                </div>

                {/* Línea 2: Fecha/Hora VET exacta + N° Orden + AdvNo + Tasa + Banco */}
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[10px] text-slate-500 dark:text-[#848E9C]">
                  <span className="font-mono font-medium text-slate-600 dark:text-[#848E9C]">
                    {order.timeVetLabel}
                  </span>
                  <span className="font-mono">
                    #{order.orderNumber.slice(-8)} · Adv {order.advNo && order.advNo !== "---" ? `#${order.advNo.slice(-6)}` : "---"}
                  </span>
                  <span className="font-mono font-bold tabular-nums text-slate-700 dark:text-[#EAECEF]">
                    @ {formatDecimalWithCommas(order.unitPriceVes)} Bs
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Pie del Espejo */}
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-3.5 py-2 text-[10px] font-semibold text-slate-500 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#848E9C]">
        <span>
          Mostrando {visibleOrders.length} de {ordersData?.totalCount ?? 0} órdenes
        </span>
        <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-700 dark:text-[#EAECEF]">
          <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-[#0ECB81]" />
          Vol. Período: {summary ? formatUsdtAmount(summary.totalVolumeUsdt) : "0.00 USDT"}
        </span>
      </div>

      {/* Modal de Detalle Íntegro de Orden */}
      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-xs dark:bg-black/70"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#2B3139] dark:bg-[#181A20]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-[#2B3139]">
              <div>
                <p className="text-[11px] font-bold uppercase text-slate-400 dark:text-[#848E9C]">
                  Registro Íntegro Binance C2C
                </p>
                <h4 className="font-mono text-sm font-extrabold text-slate-900 dark:text-[#EAECEF]">
                  Orden #{selectedOrder.orderNumber}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-[#848E9C] dark:hover:bg-[#1E2329] dark:hover:text-[#EAECEF]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 dark:text-[#848E9C]">Operación / Estado:</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[10px] font-extrabold",
                      getTradeTypeBadgeStyle(selectedOrder.tradeType).badgeClass
                    )}
                  >
                    {getTradeTypeBadgeStyle(selectedOrder.tradeType).label}
                  </span>
                  <span
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[10px] font-bold",
                      getStatusCategoryBadgeStyle(selectedOrder.statusCategory)
                        .badgeClass
                    )}
                  >
                    {selectedOrder.statusLabel} ({selectedOrder.orderStatus})
                  </span>
                </div>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-[#848E9C]">Número de Anuncio (`advNo`):</span>
                <span className="font-mono font-bold text-slate-800 dark:text-[#EAECEF]">
                  {selectedOrder.advNo}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-[#848E9C]">Fecha y Hora (VET -4:00):</span>
                <span className="font-mono font-bold text-slate-800 dark:text-[#EAECEF]">
                  {selectedOrder.timeVetLabel}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-[#848E9C]">Tasa / Precio Exacto:</span>
                <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-[#EAECEF]">
                  {formatVesAmount(selectedOrder.unitPriceVes)}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-[#848E9C]">Cantidad Exacta USDT:</span>
                <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-[#EAECEF]">
                  {formatUsdtAmount(selectedOrder.amountUsdt)}
                </span>
              </div>

              <div className="flex justify-between border-t border-slate-100 pt-2 dark:border-[#2B3139]">
                <span className="font-bold text-slate-700 dark:text-[#EAECEF]">Monto Total en Bs.:</span>
                <span className="font-mono text-sm font-extrabold tabular-nums text-slate-900 dark:text-[#FCD535]">
                  {formatVesAmount(selectedOrder.totalPriceVes)}
                </span>
              </div>

              <div className="flex justify-between pt-1">
                <span className="text-slate-500 dark:text-[#848E9C]">Banco / Método:</span>
                <span className="font-semibold text-slate-800 dark:text-[#EAECEF]">
                  {selectedOrder.payMethodName}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-[#848E9C]">Contraparte:</span>
                <span className="font-semibold text-slate-800 dark:text-[#EAECEF]">
                  {selectedOrder.counterPartNickName}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
