"use client";

import * as React from "react";
import {
  Activity,
  ArrowDownUp,
  Award,
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  RefreshCw,
  Scale,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  useMerchantBadgeQuery,
  useP2PSummaryQuery,
  useUpdateMerchantBadgeMutation,
  useVenezuelanBanksQuery,
} from "@/features/p2p-ledger/api/use-p2p-queries";
import { TradingViewP2PChart } from "@/features/p2p-ledger/components/tradingview-p2p-chart";
import { CompactOperationsPanel } from "@/features/p2p-ledger/components/compact-operations-panel";
import {
  MERCHANT_BADGE_META,
  type AveragePriceMode,
  type LotMethod,
  type MerchantBadgeType,
  type PeriodFilter,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import { useLedgerUiStore } from "@/features/p2p-ledger/store/use-ledger-ui-store";
import {
  formatDecimalWithCommas,
  formatUsdtAmount,
  formatVesAmount,
  isDecimalNonNegative,
} from "@/lib/format-currency";
import { cn } from "@/lib/utils";

interface BentoModulesGridProps {
  readonly period: PeriodFilter;
  readonly onPeriodChange: (period: PeriodFilter) => void;
  readonly method: LotMethod;
  readonly avgMode: AveragePriceMode;
  readonly onAvgModeChange: (mode: AveragePriceMode) => void;
  readonly selectedDate: string;
  readonly onSelectedDateChange: (dateIso: string) => void;
  readonly selectedMonth: string;
  readonly onSelectedMonthChange: (monthIso: string) => void;
  readonly selectedBank: string | null;
  readonly onSelectBank: (bank: string | null) => void;
  readonly onOpenFullLedger: () => void;
}

const BADGE_ORDER: readonly MerchantBadgeType[] = ["BRONZE", "SILVER", "GOLD"];

const BADGE_STYLES: Record<
  MerchantBadgeType,
  { readonly active: string; readonly inactive: string }
> = {
  BRONZE: {
    active:
      "border-amber-600 bg-amber-950 text-amber-100 shadow-xs ring-1 ring-amber-400/50",
    inactive:
      "border-slate-200 bg-white text-slate-700 hover:border-amber-300 hover:bg-amber-50/70",
  },
  SILVER: {
    active:
      "border-slate-700 bg-slate-800 text-white shadow-xs ring-1 ring-slate-400/50",
    inactive:
      "border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50",
  },
  GOLD: {
    active:
      "border-yellow-500 bg-yellow-500 text-slate-950 shadow-xs ring-1 ring-yellow-300",
    inactive:
      "border-slate-200 bg-white text-slate-700 hover:border-yellow-400 hover:bg-yellow-50/70",
  },
};

export function BentoModulesGrid({
  period,
  onPeriodChange,
  method,
  avgMode,
  onAvgModeChange,
  selectedDate,
  onSelectedDateChange,
  selectedMonth,
  onSelectedMonthChange,
  selectedBank,
  onSelectBank,
  onOpenFullLedger,
}: BentoModulesGridProps) {
  const { setClosingExportModalOpen } = useLedgerUiStore();

  const [buyBrechaAmount, setBuyBrechaAmount] = React.useState<number>(100_000);
  const [sellBrechaAmount, setSellBrechaAmount] =
    React.useState<number>(100_000);
  const [badgeFeedback, setBadgeFeedback] = React.useState<string | null>(null);

  const summaryQuery = useP2PSummaryQuery({
    period,
    method,
    date: period === "DAY" ? selectedDate : undefined,
    month: period === "MONTH" ? selectedMonth : undefined,
    avgMode,
  });

  const badgeQuery = useMerchantBadgeQuery();
  const updateBadgeMutation = useUpdateMerchantBadgeMutation();
  const banksQuery = useVenezuelanBanksQuery(buyBrechaAmount, sellBrechaAmount);

  const summary = summaryQuery.data;
  const banks = banksQuery.data ?? [];
  const effectiveSelectedBank =
    selectedBank ?? (banks[0]?.bankName || "Banesco");

  const activeBadge: MerchantBadgeType =
    badgeQuery.data?.badge ?? summary?.merchantBadge ?? "BRONZE";
  const activeBadgeMeta = MERCHANT_BADGE_META[activeBadge];

  const handleSelectBadge = async (badge: MerchantBadgeType) => {
    if (badge === activeBadge || updateBadgeMutation.isPending) return;
    setBadgeFeedback(null);
    try {
      await updateBadgeMutation.mutateAsync(badge);
    } catch (error) {
      setBadgeFeedback(
        error instanceof Error
          ? error.message
          : "No se pudo cambiar la insignia."
      );
    }
  };

  const brechaPositive = isDecimalNonNegative(summary?.brechaPointsVes);
  const netPositive = !(summary?.isNetProfitNegative ?? false);

  return (
    <section className="flex flex-col gap-3">
      {/* ================================================================= */}
      {/* BARRA SUPERIOR PERSISTENTE: INSIGNIA + PERÍODO + PROMEDIO + CIERRE */}
      {/* ================================================================= */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-200/90 bg-white px-3.5 py-2.5 shadow-xs">
        {/* Selector Persistente de Insignia de Comerciante Verificado */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Award className="h-4 w-4 text-amber-500" />
            <span className="hidden sm:inline">Insignia Verificada:</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {BADGE_ORDER.map((badgeKey) => {
              const meta = MERCHANT_BADGE_META[badgeKey];
              const isSelected = activeBadge === badgeKey;
              return (
                <button
                  key={badgeKey}
                  type="button"
                  disabled={updateBadgeMutation.isPending}
                  onClick={() => void handleSelectBadge(badgeKey)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-all disabled:opacity-60",
                    isSelected
                      ? BADGE_STYLES[badgeKey].active
                      : BADGE_STYLES[badgeKey].inactive
                  )}
                >
                  <span>{meta.emoji}</span>
                  <span>{meta.label}</span>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 font-mono text-[10px]",
                      isSelected
                        ? "bg-white/20 text-current"
                        : "bg-slate-100 text-slate-600"
                    )}
                  >
                    {meta.feeLabel}
                  </span>
                </button>
              );
            })}
          </div>
          {badgeFeedback && (
            <span className="text-[11px] font-semibold text-rose-600">
              {badgeFeedback}
            </span>
          )}
        </div>

        {/* Selector de Período KPI, Promedio y Modal de Cierre */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Chips de Período */}
          <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5">
            {(
              [
                { id: "TODAY", label: "Hoy" },
                { id: "MONTH", label: "Mes" },
                { id: "DAY", label: "Día" },
                { id: "30D", label: "30D" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onPeriodChange(item.id)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all",
                  period === item.id
                    ? "bg-slate-900 text-white shadow-xs"
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
              value={selectedDate}
              onChange={(e) => onSelectedDateChange(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] font-bold text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none"
              title="Seleccionar día calendario (VET)"
            />
          )}

          {period === "MONTH" && (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => onSelectedMonthChange(e.target.value)}
              className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] font-bold text-slate-800 focus:border-emerald-500 focus:bg-white focus:outline-none"
              title="Seleccionar mes calendario (VET)"
            />
          )}

          {/* Selector Ponderado vs Simple */}
          <div
            className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 p-0.5"
            title="Por defecto Ponderado (Total Bs / Total USDT) para cierre exacto en Bolívares"
          >
            <button
              type="button"
              onClick={() => onAvgModeChange("WEIGHTED")}
              className={cn(
                "rounded-lg px-2 py-1 text-[11px] font-bold transition-all",
                avgMode === "WEIGHTED"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              Ponderado
            </button>
            <button
              type="button"
              onClick={() => onAvgModeChange("SIMPLE")}
              className={cn(
                "rounded-lg px-2 py-1 text-[11px] font-bold transition-all",
                avgMode === "SIMPLE"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              Simple
            </button>
          </div>

          {/* Botón Descargar Cierre del Día o Mes */}
          <button
            type="button"
            onClick={() => setClosingExportModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs transition-all hover:bg-emerald-700 active:scale-[0.98]"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Cierre Día / Mes</span>
          </button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* 8 TARJETAS KPI EN TIEMPO REAL (MOTOR DE VUELTA Y BRECHA)          */}
      {/* ================================================================= */}
      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
        {/* KPI 1: Ganancia Neta Final */}
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl border p-3.5 shadow-xs transition-all",
            netPositive
              ? "border-emerald-200/90 bg-gradient-to-br from-emerald-50/90 via-white to-white"
              : "border-rose-200/90 bg-gradient-to-br from-rose-50/90 via-white to-white"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Ganancia Neta Final
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                netPositive
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-rose-100 text-rose-800"
              )}
            >
              {netPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              <span>Neta Real</span>
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              className={cn(
                "font-mono text-xl font-extrabold tracking-tight sm:text-2xl",
                netPositive ? "text-emerald-700" : "text-rose-700"
              )}
            >
              {summary
                ? `${netPositive ? "+" : ""}${formatUsdtAmount(summary.netProfitUsdt)}`
                : "0.00 USDT"}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between text-xs font-semibold text-slate-600">
            <span className="font-mono">
              {summary
                ? `${netPositive ? "+" : ""}${formatVesAmount(summary.netProfitVes)}`
                : "0.00 Bs."}
            </span>
            <span className="text-[10px] text-slate-400">Bruta - Insignia</span>
          </div>
        </div>

        {/* KPI 2: Ganancia Bruta & Volumen de la Vuelta */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Ganancia Bruta (Vuelta)
            </span>
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-mono text-[10px] font-bold text-indigo-700">
              Vuelta:{" "}
              {summary
                ? formatDecimalWithCommas(summary.vueltaVolumeUsdt)
                : "0.00"}{" "}
              USDT
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="font-mono text-xl font-extrabold tracking-tight text-slate-900">
              {summary ? formatVesAmount(summary.grossProfitVes) : "0.00 Bs."}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center justify-between gap-1 text-xs">
            <span className="font-mono font-semibold text-slate-600">
              Eq:{" "}
              {summary
                ? formatUsdtAmount(summary.grossProfitUsdt)
                : "0.00 USDT"}
            </span>
            {summary?.pendingDirection === "BUY_BACK" && (
              <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                Por recomprar: {formatDecimalWithCommas(summary.pendingUsdt)}{" "}
                USDT
              </span>
            )}
            {summary?.pendingDirection === "SELL_OUT" && (
              <span className="rounded-md bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-800">
                Por vender: {formatDecimalWithCommas(summary.pendingUsdt)} USDT
              </span>
            )}
            {(!summary || summary.pendingDirection === "NONE") && (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
                <CheckCircle2 className="h-2.5 w-2.5" />
                Ciclo 100%
              </span>
            )}
          </div>
        </div>

        {/* KPI 3: Precio Promedio Venta vs Compra & Brecha de Puntos */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Promedios & Brecha
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] font-extrabold",
                brechaPositive
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-rose-100 text-rose-800"
              )}
            >
              <Scale className="h-3 w-3" />
              {summary
                ? `${brechaPositive ? "+" : ""}${formatDecimalWithCommas(summary.brechaPointsVes)} pts`
                : "+0.00 pts"}
            </span>
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-rose-50/70 px-2 py-1">
              <p className="text-[10px] font-bold text-rose-700">Prom. Venta</p>
              <p className="font-mono text-xs font-extrabold text-slate-900">
                {summary
                  ? formatDecimalWithCommas(summary.activeAvgSellRateVes)
                  : "0.00"}{" "}
                Bs
              </p>
            </div>
            <div className="rounded-xl bg-emerald-50/70 px-2 py-1">
              <p className="text-[10px] font-bold text-emerald-700">
                Prom. Compra
              </p>
              <p className="font-mono text-xs font-extrabold text-slate-900">
                {summary
                  ? formatDecimalWithCommas(summary.activeAvgBuyRateVes)
                  : "0.00"}{" "}
                Bs
              </p>
            </div>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            Modo:{" "}
            <strong className="text-slate-600">
              {avgMode === "WEIGHTED" ? "Ponderado (Σ Bs ÷ Σ USDT)" : "Aritmético simple"}
            </strong>{" "}
            {summary &&
              avgMode === "WEIGHTED" &&
              `(Simple: ${formatDecimalWithCommas(summary.avgSellRateSimpleVes)} / ${formatDecimalWithCommas(summary.avgBuyRateSimpleVes)})`}
          </p>
        </div>

        {/* KPI 4: Comisión por Volumen (Insignia Bronce / Plata / Oro) */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
              Comisión {activeBadgeMeta.emoji} {activeBadgeMeta.label}
            </span>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-800">
              {activeBadgeMeta.feeLabel} / vol
            </span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-mono text-xl font-extrabold tracking-tight text-amber-700">
              -
              {summary
                ? formatUsdtAmount(summary.volumeCommissionUsdt)
                : "0.00 USDT"}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between text-xs font-semibold text-slate-600">
            <span className="font-mono">
              -
              {summary
                ? formatVesAmount(summary.volumeCommissionVes)
                : "0.00 Bs."}
            </span>
            <span className="text-[10px] text-slate-400">Solo COMPLETED</span>
          </div>
        </div>

        {/* KPI 5: Total Vendidos (VENTA - Rojo Binance) */}
        <div className="rounded-2xl border border-slate-200/90 bg-white px-3.5 py-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500">
              Total Vendidos (VENTA)
            </span>
            <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
              {summary?.completedSellCount ?? 0} comp.
            </span>
          </div>
          <p className="mt-1 font-mono text-base font-extrabold text-rose-700">
            {summary ? formatUsdtAmount(summary.totalSoldUsdt) : "0.00 USDT"}
          </p>
          <p className="font-mono text-xs font-semibold text-slate-600">
            {summary ? formatVesAmount(summary.totalSoldVes) : "0.00 Bs."}
          </p>
        </div>

        {/* KPI 6: Total Comprados (COMPRA - Verde Binance) */}
        <div className="rounded-2xl border border-slate-200/90 bg-white px-3.5 py-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500">
              Total Comprados (COMPRA)
            </span>
            <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">
              {summary?.completedBuyCount ?? 0} comp.
            </span>
          </div>
          <p className="mt-1 font-mono text-base font-extrabold text-emerald-700">
            {summary ? formatUsdtAmount(summary.totalBoughtUsdt) : "0.00 USDT"}
          </p>
          <p className="font-mono text-xs font-semibold text-slate-600">
            {summary ? formatVesAmount(summary.totalBoughtVes) : "0.00 Bs."}
          </p>
        </div>

        {/* KPI 7: Volumen Total Movido (Compra + Venta) */}
        <div className="rounded-2xl border border-slate-200/90 bg-white px-3.5 py-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500">
              Volumen Total Movido
            </span>
            <ArrowDownUp className="h-3.5 w-3.5 text-indigo-600" />
          </div>
          <p className="mt-1 font-mono text-base font-extrabold text-slate-900">
            {summary ? formatUsdtAmount(summary.totalVolumeUsdt) : "0.00 USDT"}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-slate-500">
            <span>{summary?.totalOrdersInPeriod ?? 0} totales</span>
            <span>·</span>
            <span className="text-slate-600">
              {summary?.cancelledCount ?? 0} canc
            </span>
            {(summary?.appealCount ?? 0) > 0 && (
              <>
                <span>·</span>
                <span className="font-bold text-amber-700">
                  {summary?.appealCount} apel
                </span>
              </>
            )}
          </div>
        </div>

        {/* KPI 8: Período Activo y Corte VET */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white px-3.5 py-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500">
              Período & Corte VET
            </span>
            <CalendarDays className="h-3.5 w-3.5 text-emerald-600" />
          </div>
          <p className="mt-1 truncate text-sm font-extrabold text-slate-900">
            {summary?.periodLabel ?? "Cargando..."}
          </p>
          <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Cierre {summary?.nextClosingTimeVet ?? "23:59 VET"}
            </span>
            <button
              type="button"
              onClick={() => setClosingExportModalOpen(true)}
              className="font-bold text-emerald-700 underline-offset-2 hover:underline"
            >
              Exportar
            </button>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* ZONA CENTRAL: GRÁFICA LIVE TRADINGVIEW + MONITOR 7 BANCOS + ESPEJO */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        {/* Columna Izquierda (7/12): Gráfica 1H VET + Monitor en Vivo 7 Bancos */}
        <div className="flex flex-col gap-3 lg:col-span-7">
          <TradingViewP2PChart
            selectedBank={effectiveSelectedBank}
            onSelectBank={(bankName) => onSelectBank(bankName)}
            height={305}
            compact
          />

          {/* Monitor de Brechas en Vivo (7 Bancos Venezuela) */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-extrabold text-slate-900">
                    Brechas en Vivo por Banco (2do Anuncio Merchant Verificado)
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    Haz clic en un banco para ver su gráfica horaria 24/7 (-4:00 UTC)
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50/50 px-2 py-1 text-[10px] font-bold text-emerald-800">
                  <span>Compra Bs:</span>
                  <input
                    type="number"
                    min={50}
                    max={50_000_000}
                    step={5000}
                    value={buyBrechaAmount}
                    onChange={(e) =>
                      setBuyBrechaAmount(Math.max(50, Number(e.target.value) || 1000))
                    }
                    className="w-20 bg-transparent font-mono text-[11px] font-extrabold text-slate-900 focus:outline-none"
                  />
                </label>

                <label className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/50 px-2 py-1 text-[10px] font-bold text-rose-800">
                  <span>Venta Bs:</span>
                  <input
                    type="number"
                    min={50}
                    max={50_000_000}
                    step={5000}
                    value={sellBrechaAmount}
                    onChange={(e) =>
                      setSellBrechaAmount(Math.max(50, Number(e.target.value) || 1000))
                    }
                    className="w-20 bg-transparent font-mono text-[11px] font-extrabold text-slate-900 focus:outline-none"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => void banksQuery.refetch()}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-100"
                  title="Actualizar cotizaciones Binance C2C"
                >
                  <RefreshCw
                    className={cn(
                      "h-3 w-3",
                      banksQuery.isFetching && "animate-spin text-emerald-600"
                    )}
                  />
                  <span>Vivo</span>
                </button>
              </div>
            </div>

            {banksQuery.isLoading ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div
                    key={idx}
                    className="h-16 animate-pulse rounded-xl bg-slate-100"
                  />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
                {banks.map((bank) => {
                  const isActiveBank = effectiveSelectedBank === bank.bankName;
                  return (
                    <button
                      key={bank.bankName}
                      type="button"
                      onClick={() => onSelectBank(bank.bankName)}
                      className={cn(
                        "flex flex-col rounded-xl border p-2 text-left transition-all",
                        isActiveBank
                          ? "border-emerald-500 bg-emerald-50/70 ring-1 ring-emerald-400/50"
                          : "border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-white"
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-[10px] font-extrabold text-slate-800">
                          {bank.bankName}
                        </span>
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            bank.isLiveApi ? "bg-emerald-500" : "bg-amber-400"
                          )}
                        />
                      </div>
                      <div className="mt-1 space-y-0.5 font-mono text-[10px]">
                        <div className="flex items-center justify-between text-rose-700">
                          <span>V:</span>
                          <span className="font-bold">
                            {formatDecimalWithCommas(bank.sellRate2nd)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-emerald-700">
                          <span>C:</span>
                          <span className="font-bold">
                            {formatDecimalWithCommas(bank.buyRate2nd)}
                          </span>
                        </div>
                      </div>
                      <div className="mt-1 flex items-center justify-between border-t border-slate-200/70 pt-1 font-mono text-[9px] font-bold">
                        <span className="text-slate-500">
                          +{bank.brechaPointsVes}
                        </span>
                        <span className="text-emerald-700">
                          {bank.spreadPercent}%
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Columna Derecha (5/12): Espejo Exacto Binance P2P en Tiempo Real */}
        <div className="lg:col-span-5">
          <CompactOperationsPanel
            summary={summary}
            onOpenFullLedger={onOpenFullLedger}
          />
        </div>
      </div>

      {/* Pie informativo compacto */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200/70 bg-white/70 px-3.5 py-2 text-[11px] text-slate-500">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-emerald-600" />
          <span>
            Motor de Vuelta & Brecha activo · Comisión Insignia{" "}
            <strong className="text-slate-700">
              {activeBadgeMeta.emoji} {activeBadgeMeta.label} ({activeBadgeMeta.feeLabel})
            </strong>{" "}
            aplicada únicamente al volumen con estado <code className="font-mono font-bold text-emerald-700">COMPLETED</code>.
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenFullLedger}
          className="inline-flex items-center gap-1 font-bold text-slate-700 hover:text-emerald-700"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          <span>Abrir Espejo Completo Binance P2P</span>
        </button>
      </div>
    </section>
  );
}
