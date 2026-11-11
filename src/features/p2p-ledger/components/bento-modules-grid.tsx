"use client";

import * as React from "react";
import {
  TrendingUp,
  Wallet,
  PiggyBank,
  Sparkles,
  Sliders,
  CheckCircle2,
  Filter,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  Landmark,
  FileSpreadsheet,
} from "lucide-react";
import {
  useP2PSummaryQuery,
  useVenezuelanBanksQuery,
  useUpdateTaxConfigMutation,
} from "@/features/p2p-ledger/api/use-p2p-queries";
import { TradingViewP2PChart } from "@/features/p2p-ledger/components/tradingview-p2p-chart";
import { CompactOperationsPanel } from "@/features/p2p-ledger/components/compact-operations-panel";
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
  readonly onOpenFullLedger?: () => void;
}

const BANK_COLOR_MAP: Record<
  string,
  {
    bg: string;
    activeBorder: string;
    activeRing: string;
    dot: string;
    badgeBg: string;
    badgeText: string;
  }
> = {
  Banesco: {
    bg: "hover:bg-emerald-50/60",
    activeBorder: "border-emerald-500 bg-emerald-50/80 ring-1 ring-emerald-500",
    activeRing: "text-emerald-950 font-black",
    dot: "bg-emerald-500",
    badgeBg: "bg-emerald-100",
    badgeText: "text-emerald-800",
  },
  "Pago Móvil": {
    bg: "hover:bg-violet-50/60",
    activeBorder: "border-violet-500 bg-violet-50/80 ring-1 ring-violet-500",
    activeRing: "text-violet-950 font-black",
    dot: "bg-violet-500",
    badgeBg: "bg-violet-100",
    badgeText: "text-violet-800",
  },
  Mercantil: {
    bg: "hover:bg-blue-50/60",
    activeBorder: "border-blue-500 bg-blue-50/80 ring-1 ring-blue-500",
    activeRing: "text-blue-950 font-black",
    dot: "bg-blue-600",
    badgeBg: "bg-blue-100",
    badgeText: "text-blue-800",
  },
  BBVA: {
    bg: "hover:bg-sky-50/60",
    activeBorder: "border-sky-500 bg-sky-50/80 ring-1 ring-sky-500",
    activeRing: "text-sky-950 font-black",
    dot: "bg-sky-500",
    badgeBg: "bg-sky-100",
    badgeText: "text-sky-800",
  },
  "Banco de Venezuela": {
    bg: "hover:bg-rose-50/60",
    activeBorder: "border-rose-500 bg-rose-50/80 ring-1 ring-rose-500",
    activeRing: "text-rose-950 font-black",
    dot: "bg-rose-600",
    badgeBg: "bg-rose-100",
    badgeText: "text-rose-800",
  },
  Bancamiga: {
    bg: "hover:bg-teal-50/60",
    activeBorder: "border-teal-500 bg-teal-50/80 ring-1 ring-teal-500",
    activeRing: "text-teal-950 font-black",
    dot: "bg-teal-500",
    badgeBg: "bg-teal-100",
    badgeText: "text-teal-800",
  },
  BNC: {
    bg: "hover:bg-amber-50/60",
    activeBorder: "border-amber-500 bg-amber-50/80 ring-1 ring-amber-500",
    activeRing: "text-amber-950 font-black",
    dot: "bg-amber-600",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-800",
  },
};

export function BentoModulesGrid({
  period,
  method,
  selectedBank,
  onPeriodChange,
  onMethodChange,
  onSelectBank,
  onOpenFullLedger,
}: BentoModulesGridProps) {
  const [sellBrechaAmount, setSellBrechaAmount] = React.useState<number>(100_000);
  const [buyBrechaAmount, setBuyBrechaAmount] = React.useState<number>(50_000);
  const [tempSellInput, setTempSellInput] = React.useState<string>("100000");
  const [tempBuyInput, setTempBuyInput] = React.useState<string>("50000");
  const [isVolumeSettingsOpen, setIsVolumeSettingsOpen] = React.useState(false);

  const [primaryCurrency, setPrimaryCurrency] = React.useState<"USDT" | "VES">("USDT");
  const [isEditingTaxes, setIsEditingTaxes] = React.useState(false);
  const [taxInput, setTaxInput] = React.useState("16");
  const [feeInput, setFeeInput] = React.useState("0.163");

  const summaryQuery = useP2PSummaryQuery(period, method);
  const banksQuery = useVenezuelanBanksQuery(buyBrechaAmount, sellBrechaAmount);
  const updateTaxMutation = useUpdateTaxConfigMutation();

  const summary = summaryQuery.data;
  const banks = banksQuery.data ?? [];

  const effectiveSelectedBank = selectedBank ?? (banks[0]?.bankName || "Banesco");

  const handleSaveTaxes = async (e: React.FormEvent) => {
    e.preventDefault();
    const tNum = parseFloat(taxInput);
    const fNum = parseFloat(feeInput);
    if (!isNaN(tNum) && !isNaN(fNum) && tNum >= 0 && fNum >= 0) {
      await updateTaxMutation.mutateAsync({
        seniatTaxPercent: tNum,
        makerFeePercent: fNum,
      });
      setIsEditingTaxes(false);
    }
  };

  const handleApplyAmounts = () => {
    const bNum = parseFloat(tempBuyInput);
    const sNum = parseFloat(tempSellInput);
    if (!isNaN(bNum) && bNum >= 50) setBuyBrechaAmount(bNum);
    if (!isNaN(sNum) && sNum >= 50) setSellBrechaAmount(sNum);
    setIsVolumeSettingsOpen(false);
  };

  return (
    <div className="flex w-full flex-col gap-5">
      {/* ======================================================== */}
      {/* 1. FILA SUPERIOR: 4 TARJETAS DE KPIS COMPACTAS (FINTECH) */}
      {/* ======================================================== */}
      <section
        aria-label="Indicadores Clave"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {/* KPI 1: Ganancia Libre (Neta) */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#064E3B] via-[#047857] to-[#059669] p-4 text-white shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">
                Ganancia Libre
              </span>
            </div>
            {/* Toggle USD / Bs. */}
            <div className="inline-flex rounded-lg bg-black/25 p-0.5 backdrop-blur-xs">
              <button
                type="button"
                onClick={() => setPrimaryCurrency("USDT")}
                className={cn(
                  "rounded-md px-2 py-0.5 text-[10px] font-bold transition-all",
                  primaryCurrency === "USDT"
                    ? "bg-white text-emerald-900 shadow-xs"
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
                    ? "bg-white text-emerald-900 shadow-xs"
                    : "text-emerald-100 hover:text-white"
                )}
              >
                Bs.
              </button>
            </div>
          </div>

          <div className="mt-2 flex items-baseline gap-2">
            {primaryCurrency === "USDT" ? (
              <>
                <span className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
                  +${summary?.netFreeProfitUsdt ?? "0.00"}
                </span>
                <span className="text-xs font-bold text-emerald-200">
                  (+{summary?.netFreeProfitVes ?? "0.00"} Bs.)
                </span>
              </>
            ) : (
              <>
                <span className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
                  +{summary?.netFreeProfitVes ?? "0.00"} Bs.
                </span>
                <span className="text-xs font-bold text-emerald-200">
                  (+${summary?.netFreeProfitUsdt ?? "0.00"})
                </span>
              </>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2 text-[11px]">
            <span className="text-emerald-200">
              Margen neto: <strong className="text-white">{summary?.averageSpreadPercent ?? "+1.82%"}</strong>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-900/60 px-2 py-0.5 text-[10px] font-extrabold text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Ciclo 24h
            </span>
          </div>
        </div>

        {/* KPI 2: Capital de Trabajo Rotado (Volumen Diario) */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Capital de Trabajo
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Wallet className="h-4 w-4" />
            </div>
          </div>

          <div className="mt-2 flex flex-col">
            <span className="font-display text-2xl font-extrabold tracking-tight text-slate-900">
              ${summary?.workingCapitalUsdt ?? summary?.exemptCapitalUsdt ?? "0.00"}
            </span>
            <span className="text-xs font-bold text-slate-500">
              {summary?.workingCapitalVes ?? summary?.exemptCapitalVes ?? "0.00"} Bs.
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
            <span>Volumen rotado hoy</span>
            <span className="font-bold text-slate-800">
              {summary?.reconciledOrdersCount ?? 0} órdenes
            </span>
          </div>
        </div>

        {/* KPI 3: Provisión SENIAT (16% Legal BA VEN-NIF) */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Provisión SENIAT
            </span>
            <button
              type="button"
              onClick={() => setIsEditingTaxes(!isEditingTaxes)}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-all hover:bg-slate-200"
              title="Ajustar porcentaje de IVA o Comisión Maker"
            >
              <Sliders className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-2 flex flex-col">
            <span className="font-display text-2xl font-extrabold tracking-tight text-slate-800">
              {summary?.seniatTax16Ves ?? "0.00"} Bs.
            </span>
            <span className="text-xs font-bold text-slate-500">
              (${summary?.seniatTax16Usdt ?? "0.00"} USDT)
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
            <span className="text-slate-500">
              Tasa: <strong className="text-slate-800">{summary?.seniatTaxRatePercent ?? "16"}%</strong>
            </span>
            <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md">
              Cap. Exento
            </span>
          </div>
        </div>

        {/* KPI 4: Monitor de Spread Promedio y Cierre */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Tasa Referencia P2P
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>

          <div className="mt-2 flex flex-col">
            <span className="font-display text-2xl font-extrabold tracking-tight text-slate-900">
              {banks[0]?.sellRate2nd ?? "1,085.00"} Bs.
            </span>
            <span className="text-xs font-bold text-emerald-700">
              Spread Medio: +{summary?.averageSpreadPercent ?? "1.82%"}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
            <span>Cierre automático:</span>
            <span className="font-bold text-slate-900">
              {summary?.nextClosingTimeVet ?? "11:59 PM VET"}
            </span>
          </div>
        </div>
      </section>

      {/* Editor Rápido Desplegable de Tasas SENIAT / Maker */}
      {isEditingTaxes && (
        <form
          onSubmit={handleSaveTaxes}
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50/70 p-4 shadow-xs"
        >
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-emerald-700" />
            <span className="text-xs font-bold text-emerald-950">
              Configuración de Tasas Automáticas:
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-bold text-slate-700">Provisión SENIAT:</label>
              <div className="relative flex items-center w-20">
                <input
                  type="number"
                  step="0.5"
                  value={taxInput}
                  onChange={(e) => setTaxInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-900"
                />
                <span className="absolute right-2 text-xs text-slate-400">%</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-xs font-bold text-slate-700">Comisión Maker:</label>
              <div className="relative flex items-center w-24">
                <input
                  type="number"
                  step="0.001"
                  value={feeInput}
                  onChange={(e) => setFeeInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-900"
                />
                <span className="absolute right-2 text-xs text-slate-400">%</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={updateTaxMutation.isPending}
              className="rounded-lg bg-emerald-600 px-3.5 py-1 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50 cursor-pointer"
            >
              {updateTaxMutation.isPending ? "Guardando..." : "Aplicar"}
            </button>

            <button
              type="button"
              onClick={() => setIsEditingTaxes(false)}
              className="rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              Cerrar
            </button>
          </div>
        </form>
      )}

      {/* ======================================================== */}
      {/* 2. CENTRO DE COMANDO (SPLIT VIEW COORDINADO SIN SCROLL) */}
      {/* ======================================================== */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12 xl:items-start">
        {/* COLUMNA IZQUIERDA: GRÁFICA TRADINGVIEW + SELECTOR DE 7 BANCOS (7 cols en XL) */}
        <div className="flex flex-col gap-4 xl:col-span-7">
          {/* Gráfica TradingView Lightweight Charts en Vivo */}
          <TradingViewP2PChart
            selectedBank={effectiveSelectedBank}
            onSelectBank={onSelectBank}
            height={320}
          />

          {/* Tira Interactiva de Bancos Nacionales (7 Bancos en Pills Fintech) */}
          <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-slate-600" />
                <span className="text-xs font-extrabold text-slate-900">
                  Brechas por Banco Nacional (2do Anuncio Verificado)
                </span>
              </div>

              {/* Botón para Desplegar Cotizador de Volumen */}
              <button
                type="button"
                onClick={() => setIsVolumeSettingsOpen(!isVolumeSettingsOpen)}
                className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <span>Cotizar por Monto</span>
                {isVolumeSettingsOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {/* Selector de Montos Colapsable */}
            {isVolumeSettingsOpen && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-rose-500" />
                    <label className="font-bold text-slate-700">Monto Venta:</label>
                    <input
                      type="number"
                      value={tempSellInput}
                      onChange={(e) => setTempSellInput(e.target.value)}
                      className="w-24 rounded-md border border-slate-300 bg-white px-2 py-0.5 font-bold"
                    />
                    <span className="text-slate-400 font-medium">Bs.</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    <label className="font-bold text-slate-700">Monto Compra:</label>
                    <input
                      type="number"
                      value={tempBuyInput}
                      onChange={(e) => setTempBuyInput(e.target.value)}
                      className="w-24 rounded-md border border-slate-300 bg-white px-2 py-0.5 font-bold"
                    />
                    <span className="text-slate-400 font-medium">Bs.</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleApplyAmounts}
                  className="rounded-lg bg-emerald-600 px-3 py-1 font-bold text-white shadow-xs hover:bg-emerald-500 cursor-pointer"
                >
                  Recalcular Brechas
                </button>
              </div>
            )}

            {/* Grid Compacto de los 7 Bancos */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              {banks.map((b) => {
                const isSelected = effectiveSelectedBank.toLowerCase() === b.bankName.toLowerCase();
                const theme = BANK_COLOR_MAP[b.bankName] ?? {
                  bg: "hover:bg-slate-50",
                  activeBorder: "border-slate-800 bg-slate-50 ring-1 ring-slate-800",
                  activeRing: "text-slate-900 font-black",
                  dot: "bg-slate-500",
                  badgeBg: "bg-slate-100",
                  badgeText: "text-slate-800",
                };

                return (
                  <button
                    key={b.bankName}
                    type="button"
                    onClick={() => onSelectBank(b.bankName)}
                    className={cn(
                      "flex flex-col gap-1 rounded-xl border p-2 text-left transition-all cursor-pointer",
                      isSelected
                        ? theme.activeBorder
                        : cn("border-slate-200/80 bg-white", theme.bg)
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className={cn("h-2 w-2 shrink-0 rounded-full", theme.dot)} />
                        <span className="text-[11px] font-extrabold text-slate-800 truncate">
                          {b.bankName}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-baseline justify-between mt-0.5">
                      <span className="font-display text-sm font-extrabold text-slate-900">
                        {b.brechaPointsVes}
                      </span>
                      <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded-xs">
                        {b.spreadPercent}
                      </span>
                    </div>

                    <div className="flex flex-col text-[9px] text-slate-400 mt-0.5 border-t border-slate-100 pt-1">
                      <span className="truncate">V: {b.sellRate2nd} Bs.</span>
                      <span className="truncate">C: {b.buyRate2nd} Bs.</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA: CENTRO DE OPERACIONES & CONCILIACIÓN CON TABS (5 cols en XL) */}
        <div className="xl:col-span-5 h-full">
          <CompactOperationsPanel
            period={period}
            method={method}
            selectedBank={selectedBank}
            onSelectBank={onSelectBank}
            onOpenFullLedger={onOpenFullLedger}
          />
        </div>
      </div>
    </div>
  );
}
