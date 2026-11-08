"use client";

import * as React from "react";
import {
  TrendingUp,
  Landmark,
  Clock,
  FileSpreadsheet,
  Sparkles,
  CheckCircle2,
  ArrowUpRight,
  Wallet,
  PiggyBank,
  BadgeDollarSign,
  Filter,
  ArrowLeftRight,
} from "lucide-react";
import {
  useP2PSummaryQuery,
  useVenezuelanBanksQuery,
} from "@/features/p2p-ledger/api/use-p2p-queries";
import { useLedgerUiStore } from "@/features/p2p-ledger/store/use-ledger-ui-store";
import type {
  LotMethod,
  PeriodFilter,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import { cn } from "@/lib/utils";

interface BentoModulesGridProps {
  readonly period: PeriodFilter;
  readonly method: LotMethod;
  readonly selectedBank: string | null;
  readonly onPeriodChange: (period: PeriodFilter) => void;
  readonly onMethodChange: (method: LotMethod) => void;
  readonly onSelectBank: (bank: string | null) => void;
}

const BANK_COLOR_THEMES: Record<
  string,
  {
    bg: string;
    activeBg: string;
    border: string;
    activeRing: string;
    dot: string;
    titleText: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  Banesco: {
    bg: "bg-emerald-50/60 hover:bg-emerald-50",
    activeBg: "bg-emerald-50",
    border: "border-emerald-200/80",
    activeRing: "ring-2 ring-emerald-500 border-emerald-500",
    dot: "bg-emerald-500",
    titleText: "text-emerald-900",
    badgeBg: "bg-emerald-100/90",
    badgeText: "text-emerald-800",
  },
  "Pago Móvil": {
    bg: "bg-violet-50/60 hover:bg-violet-50",
    activeBg: "bg-violet-50",
    border: "border-violet-200/80",
    activeRing: "ring-2 ring-violet-500 border-violet-500",
    dot: "bg-violet-500",
    titleText: "text-violet-900",
    badgeBg: "bg-violet-100/90",
    badgeText: "text-violet-800",
  },
  Mercantil: {
    bg: "bg-blue-50/60 hover:bg-blue-50",
    activeBg: "bg-blue-50",
    border: "border-blue-200/80",
    activeRing: "ring-2 ring-blue-500 border-blue-500",
    dot: "bg-blue-600",
    titleText: "text-blue-900",
    badgeBg: "bg-blue-100/90",
    badgeText: "text-blue-800",
  },
  BBVA: {
    bg: "bg-sky-50/60 hover:bg-sky-50",
    activeBg: "bg-sky-50",
    border: "border-sky-200/80",
    activeRing: "ring-2 ring-sky-500 border-sky-500",
    dot: "bg-sky-500",
    titleText: "text-sky-900",
    badgeBg: "bg-sky-100/90",
    badgeText: "text-sky-800",
  },
  "Banco de Venezuela": {
    bg: "bg-rose-50/60 hover:bg-rose-50",
    activeBg: "bg-rose-50",
    border: "border-rose-200/80",
    activeRing: "ring-2 ring-rose-500 border-rose-500",
    dot: "bg-rose-600",
    titleText: "text-rose-950",
    badgeBg: "bg-rose-100/90",
    badgeText: "text-rose-800",
  },
  Bancamiga: {
    bg: "bg-teal-50/60 hover:bg-teal-50",
    activeBg: "bg-teal-50",
    border: "border-teal-200/80",
    activeRing: "ring-2 ring-teal-500 border-teal-500",
    dot: "bg-teal-500",
    titleText: "text-teal-950",
    badgeBg: "bg-teal-100/90",
    badgeText: "text-teal-800",
  },
  BNC: {
    bg: "bg-amber-50/60 hover:bg-amber-50",
    activeBg: "bg-amber-50",
    border: "border-amber-200/80",
    activeRing: "ring-2 ring-amber-500 border-amber-500",
    dot: "bg-amber-600",
    titleText: "text-amber-950",
    badgeBg: "bg-amber-100/90",
    badgeText: "text-amber-800",
  },
};

export function BentoModulesGrid({
  period,
  method,
  selectedBank,
  onPeriodChange,
  onSelectBank,
}: BentoModulesGridProps) {
  const { setActiveTab } = useLedgerUiStore();
  const [brechaAmount, setBrechaAmount] = React.useState<number>(5000);
  const [tempAmountInput, setTempAmountInput] = React.useState<string>("5000");

  const summaryQuery = useP2PSummaryQuery(period, method);
  const banksQuery = useVenezuelanBanksQuery(brechaAmount);

  const [primaryCurrency, setPrimaryCurrency] = React.useState<"USDT" | "VES">(
    "USDT"
  );
  const [downloadingReport, setDownloadingReport] = React.useState(false);

  const summary = summaryQuery.data;
  const banks = banksQuery.data ?? [];

  const periodLabel =
    period === "TODAY"
      ? "Hoy"
      : period === "7D"
        ? "en los últimos 7 días"
        : "en los últimos 30 días";

  const handleQuickExport = () => {
    setDownloadingReport(true);
    window.location.href = "/api/p2p/export-csv";
    setTimeout(() => setDownloadingReport(false), 1800);
  };

  return (
    <section
      aria-label="Resumen de Ganancias y Bancos"
      className="flex w-full flex-col gap-5 xl:flex-row xl:items-stretch"
    >
      {/* TARJETA PRINCIPAL IZQUIERDA: TU GANANCIA LIBRE (Compacta a 410px para dar más espacio a Brechas) */}
      <div className="flex w-full flex-col justify-between gap-5 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] xl:w-[410px] xl:shrink-0">
        <div className="flex flex-col gap-4">
          {/* Fila Superior: Título + Selector de Período */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <h1 className="font-display text-lg font-extrabold tracking-tight text-slate-900">
                  Tus Ganancias
                </h1>
                <p className="text-[11px] font-medium text-slate-500">
                  Libre {periodLabel} después de IVA
                </p>
              </div>
            </div>

            {/* Selector Hoy / 7 Días / 30 Días */}
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-0.5">
              {(
                [
                  { id: "TODAY", label: "Hoy" },
                  { id: "7D", label: "7D" },
                  { id: "30D", label: "30D" },
                ] as const satisfies readonly {
                  id: PeriodFilter;
                  label: string;
                }[]
              ).map((tab) => {
                const isSelected = period === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onPeriodChange(tab.id)}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-xs font-bold transition-all",
                      isSelected
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* CAJA HERO INTERACTIVA DE GANANCIA LIBRE */}
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#064E3B] via-[#047857] to-[#059669] p-4 text-white shadow-lg shadow-emerald-900/10">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">
                    Ganancia Libre
                  </span>
                </div>

                <div className="inline-flex rounded-lg bg-black/25 p-0.5 backdrop-blur-sm">
                  <button
                    type="button"
                    onClick={() => setPrimaryCurrency("USDT")}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[10px] font-bold transition-all",
                      primaryCurrency === "USDT"
                        ? "bg-white text-emerald-900 shadow-sm"
                        : "text-emerald-100 hover:text-white"
                    )}
                  >
                    USD ($)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrimaryCurrency("VES")}
                    className={cn(
                      "rounded-md px-2 py-0.5 text-[10px] font-bold transition-all",
                      primaryCurrency === "VES"
                        ? "bg-white text-emerald-900 shadow-sm"
                        : "text-emerald-100 hover:text-white"
                    )}
                  >
                    Bs.
                  </button>
                </div>
              </div>

              <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
                {primaryCurrency === "USDT" ? (
                  <>
                    <span className="font-display text-3xl font-extrabold tracking-tight text-white">
                      +${summary?.netFreeProfitUsdt ?? "0.00"}
                    </span>
                    <span className="rounded-lg bg-white/15 px-2 py-0.5 text-xs font-bold text-emerald-100 backdrop-blur-sm">
                      +{summary?.netFreeProfitVes ?? "0.00"} Bs.
                    </span>
                  </>
                ) : (
                  <>
                    <span className="font-display text-3xl font-extrabold tracking-tight text-white">
                      +{summary?.netFreeProfitVes ?? "0.00"} Bs.
                    </span>
                    <span className="rounded-lg bg-white/15 px-2 py-0.5 text-xs font-bold text-emerald-100 backdrop-blur-sm">
                      +${summary?.netFreeProfitUsdt ?? "0.00"} USDT
                    </span>
                  </>
                )}
              </div>

              <div className="text-[11px] font-medium text-emerald-100">
                Margen promedio:{" "}
                <strong className="font-extrabold text-white">
                  {summary?.averageSpreadPercent ?? "+0.00%"}
                </strong>{" "}
                ({summary?.reconciledOrdersCount ?? 0} órdenes)
              </div>
            </div>

            {/* Barra Visual de Reparto: 84% Tuyo vs 16% IVA */}
            <div className="mt-3 flex flex-col gap-1 border-t border-white/15 pt-2.5">
              <div className="flex items-center justify-between text-[10px] font-semibold text-emerald-100">
                <span>84% ganancia libre</span>
                <span>16% IVA SENIAT</span>
              </div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-black/25 p-0.5">
                <div
                  className="h-full rounded-l-full bg-emerald-300 transition-all duration-500"
                  style={{ width: "84%" }}
                />
                <div
                  className="h-full rounded-r-full bg-amber-400 transition-all duration-500"
                  style={{ width: "16%" }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 3 FILAS DE DESGLOSE CONTABLE FÁCILES DE ENTENDER */}
        <div className="flex flex-col gap-2">
          {/* 1. Ganancia Total Antes de IVA */}
          <div className="flex items-center justify-between rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-2.5 transition-all hover:bg-emerald-50">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <BadgeDollarSign className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-emerald-900">
                  Ganancia Bruta
                </span>
                <span className="text-[10px] font-medium text-emerald-700">
                  {summary?.grossProfitVes ?? "0.00"} Bs. (Antes de IVA)
                </span>
              </div>
            </div>
            <div className="text-sm font-extrabold text-emerald-950">
              +${summary?.grossProfitUsdt ?? "0.00"}
            </div>
          </div>

          {/* 2. Apartado para el IVA 16% */}
          <div className="flex items-center justify-between rounded-xl border border-amber-200/90 bg-amber-50/70 p-2.5 transition-all hover:bg-amber-50">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
                <PiggyBank className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-amber-900">
                  Apartado IVA (16%)
                </span>
                <span className="text-[10px] font-medium text-amber-800">
                  {summary?.seniatTax16Ves ?? "0.00"} Bs. para SENIAT
                </span>
              </div>
            </div>
            <div className="text-sm font-extrabold text-amber-700">
              -${summary?.seniatTax16Usdt ?? "0.00"}
            </div>
          </div>

          {/* 3. Tu Capital de Trabajo (Volumen de Dinero Movilizado en el Día) */}
          <div className="flex items-center justify-between rounded-xl border border-blue-200/80 bg-blue-50/50 p-2.5 transition-all hover:bg-blue-50">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                <Wallet className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold text-blue-900">
                  Capital de Trabajo
                </span>
                <span className="text-[10px] font-semibold text-blue-700">
                  Volumen {periodLabel} &bull; {summary?.workingCapitalVes ?? "0.00"} Bs
                </span>
              </div>
            </div>
            <div className="text-sm font-extrabold text-blue-950">
              ${summary?.workingCapitalUsdt ?? "0.00"}
            </div>
          </div>
        </div>
      </div>

      {/* COLUMNA DERECHA: BANCOS INTERACTIVOS + CIERRES + REPORTE EXCEL */}
      <div className="flex flex-1 flex-col justify-between gap-5">
        {/* MÓDULO 2: BRECHAS EN TUS BANCOS NACIONALES (2DO ANUNCIO BINANCE P2P) */}
        <div className="flex w-full flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          {/* Cabecera del Módulo */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-200/60 bg-indigo-50 text-indigo-600">
                <ArrowLeftRight className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-lg font-extrabold text-slate-900">
                    Brechas en Tus Bancos Nacionales
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Solo Comerciantes Verificados (2do Anuncio)
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-500">
                  Brecha real entre el 2do anuncio de compra y el 2do anuncio de venta de comerciantes verificados según el monto.
                </p>
              </div>
            </div>

            {selectedBank ? (
              <button
                type="button"
                onClick={() => onSelectBank(null)}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white transition-all hover:bg-slate-700"
              >
                <Filter className="h-3 w-3 text-emerald-400" />
                <span>Filtrando: {selectedBank} (Quitar filtro)</span>
              </button>
            ) : (
              <span className="text-xs font-semibold text-slate-400">
                {banksQuery.isFetching
                  ? "Actualizando tasas..."
                  : `${banks.length || 7} Bancos Conectados`}
              </span>
            )}
          </div>

          {/* Selector de Monto para cotizar la Brecha */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-bold text-slate-700">
                Monto a cotizar:
              </span>
              <div className="relative flex items-center">
                <input
                  type="number"
                  min={50}
                  max={10000000}
                  value={tempAmountInput}
                  onChange={(e) => setTempAmountInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const num = parseFloat(tempAmountInput);
                      if (!isNaN(num) && num > 0) setBrechaAmount(num);
                    }
                  }}
                  onBlur={() => {
                    const num = parseFloat(tempAmountInput);
                    if (!isNaN(num) && num > 0) setBrechaAmount(num);
                  }}
                  className="w-28 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-extrabold text-slate-900 focus:border-indigo-500 focus:outline-none"
                />
                <span className="ml-1.5 text-xs font-bold text-slate-500">Bs.</span>
              </div>

              {parseFloat(tempAmountInput) !== brechaAmount && (
                <button
                  type="button"
                  onClick={() => {
                    const num = parseFloat(tempAmountInput);
                    if (!isNaN(num) && num > 0) setBrechaAmount(num);
                  }}
                  className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:bg-indigo-500"
                >
                  Consultar
                </button>
              )}
            </div>

            {/* Chips Rápidos de Montos Habituales */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-400 mr-1 hidden sm:inline">
                Montos rápidos:
              </span>
              {[1000, 5000, 10000, 25000, 50000].map((preset) => {
                const isActive = brechaAmount === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      setBrechaAmount(preset);
                      setTempAmountInput(String(preset));
                    }}
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all",
                      isActive
                        ? "bg-slate-900 text-white shadow-sm"
                        : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                    )}
                  >
                    {preset.toLocaleString("es-VE")} Bs.
                  </button>
                );
              })}
            </div>
          </div>

          {/* Grid de Bancos con Puntos de Brecha y 2dos Anuncios */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {banks.map((bank) => {
              const isSelected = selectedBank === bank.bankName;
              const theme = BANK_COLOR_THEMES[bank.bankName] ?? {
                bg: "bg-slate-50 hover:bg-slate-100",
                activeBg: "bg-slate-100",
                border: "border-slate-200",
                activeRing: "ring-2 ring-slate-800",
                dot: "bg-slate-500",
                titleText: "text-slate-900",
                badgeBg: "bg-slate-200",
                badgeText: "text-slate-800",
              };

              return (
                <button
                  key={bank.bankName}
                  type="button"
                  onClick={() =>
                    onSelectBank(isSelected ? null : bank.bankName)
                  }
                  className={cn(
                    "group flex flex-col justify-between gap-3 rounded-xl border p-4 text-left transition-all duration-150 active:scale-[0.98]",
                    theme.border,
                    isSelected
                      ? cn(theme.activeBg, theme.activeRing, "shadow-md")
                      : theme.bg
                  )}
                >
                  {/* Fila 1: Nombre del Banco y Estado */}
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn("h-2.5 w-2.5 rounded-full", theme.dot)}
                      />
                      <span
                        className={cn(
                          "text-xs font-extrabold",
                          theme.titleText
                        )}
                      >
                        {bank.bankName}
                      </span>
                    </div>
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                        theme.badgeBg,
                        theme.badgeText
                      )}
                    >
                      {bank.reconciledOrdersToday} órd. hoy
                    </span>
                  </div>

                  {/* Fila 2: Puntos de Brecha en Grande */}
                  <div className="flex flex-col gap-0.5 my-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Puntos de Brecha:
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-2xl font-extrabold tracking-tight text-slate-900">
                        {bank.brechaPointsVes ?? "+6.40"}{" "}
                        <span className="text-xs font-bold text-slate-500">
                          Bs.
                        </span>
                      </span>
                      <span className="rounded-md border border-emerald-300 bg-emerald-100 px-1.5 py-0.5 text-[11px] font-extrabold text-emerald-800">
                        {bank.spreadPercent}
                      </span>
                    </div>
                  </div>

                  {/* Fila 3: Detalle de los 2dos Anuncios Compra y Venta */}
                  <div className="flex flex-col gap-1 rounded-lg border border-black/5 bg-white/70 p-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 font-medium">
                        Compra (2do):
                      </span>
                      <span className="font-bold text-slate-900">
                        {bank.buyRate2nd ?? bank.liveRateVes} Bs.
                      </span>
                    </div>
                    {bank.merchantBuyNick && (
                      <span className="text-[10px] text-slate-400 truncate">
                        por {bank.merchantBuyNick}
                      </span>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-black/5">
                      <span className="text-slate-500 font-medium">
                        Venta (2do):
                      </span>
                      <span className="font-bold text-slate-900">
                        {bank.sellRate2nd ?? bank.liveRateVes} Bs.
                      </span>
                    </div>
                    {bank.merchantSellNick && (
                      <span className="text-[10px] text-slate-400 truncate">
                        por {bank.merchantSellNick}
                      </span>
                    )}
                  </div>

                  {/* Fila 4: Footer */}
                  <div className="flex items-center justify-between border-t border-black/5 pt-1.5 text-[10px] font-semibold text-slate-500">
                    <span>
                      Monto:{" "}
                      {bank.filterAmountVes?.toLocaleString("es-VE") ??
                        brechaAmount}{" "}
                      Bs.
                    </span>
                    <span className="group-hover:text-slate-900 font-bold">
                      {isSelected ? "Filtro activo ✓" : "Filtrar operaciones →"}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* FILA INFERIOR DERECHA: CIERRE AUTOMÁTICO + REPORTE CONTADOR */}
        <div className="grid flex-1 grid-cols-1 gap-5 md:grid-cols-2">
          {/* MÓDULO 3: Cierre Automático del Día */}
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-600">
                  <Clock className="h-5 w-5" />
                </div>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                  Automático 11:59 PM
                </span>
              </div>
              <h3 className="font-display text-base font-extrabold text-slate-900 pt-1">
                Cierre Diario Automático
              </h3>
              <p className="text-xs leading-relaxed text-slate-500">
                Cada medianoche guardamos un resumen fijo con todo lo que
                ganaste en el día para que no tengas que anotar nada a mano.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-amber-200/70 bg-amber-50/50 px-3.5 py-3">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                  Horario de Cierre Fiscal
                </span>
                <span className="text-sm font-extrabold text-slate-900">
                  {summary?.nextClosingTimeVet ?? "11:59 PM VET"}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("VAULT_AND_CLOSINGS")}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-amber-500"
              >
                <span>Ver Cierres</span>
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* MÓDULO 4: Reporte para tu Contador */}
          <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                  Listo para el Contador
                </span>
              </div>
              <h3 className="font-display text-base font-extrabold text-slate-900 pt-1">
                Reporte de Impuestos (Excel)
              </h3>
              <p className="text-xs leading-relaxed text-slate-500">
                Descarga un archivo limpio que separa tu capital de trabajo de
                las ganancias, para pagar solo el 16% sobre lo que ganaste.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-emerald-200/70 bg-emerald-50/50 px-3.5 py-3">
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                  Libro Contable al Día
                </span>
                <span className="text-sm font-extrabold text-slate-900">
                  Formato Excel / CSV
                </span>
              </div>
              <button
                type="button"
                onClick={handleQuickExport}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-500"
              >
                {downloadingReport ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>¡Descargado!</span>
                  </>
                ) : (
                  <>
                    <span>Descargar</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
