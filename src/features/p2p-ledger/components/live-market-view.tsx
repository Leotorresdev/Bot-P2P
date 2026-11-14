"use client";

import * as React from "react";
import { Building2, RefreshCw } from "lucide-react";
import { useVenezuelanBanksQuery } from "@/features/p2p-ledger/api/use-p2p-queries";
import { TradingViewP2PChart } from "@/features/p2p-ledger/components/tradingview-p2p-chart";
import { formatDecimalWithCommas } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

interface LiveMarketViewProps {
  readonly selectedBank: string | null;
  readonly onSelectBank: (bank: string | null) => void;
  readonly sellBrechaAmount: number;
  readonly onSellBrechaAmountChange: (amount: number) => void;
  readonly buyBrechaAmount: number;
  readonly onBuyBrechaAmountChange: (amount: number) => void;
}

const SUGGESTED_AMOUNTS = [
  { label: "20k", value: 20_000 },
  { label: "50k", value: 50_000 },
  { label: "100k", value: 100_000 },
] as const;

interface BankCardTheme {
  readonly lightBg: string;
  readonly lightActiveBg: string;
  readonly lightBorder: string;
  readonly lightActiveRing: string;
  readonly dot: string;
  readonly lightTitle: string;
  readonly lightBadgeBg: string;
  readonly lightBadgeText: string;
}

const DEFAULT_BANK_THEME: BankCardTheme = {
  lightBg: "bg-slate-50/70 hover:bg-slate-50",
  lightActiveBg: "bg-slate-50",
  lightBorder: "border-slate-200",
  lightActiveRing: "ring-2 ring-emerald-500 border-emerald-500",
  dot: "bg-slate-500",
  lightTitle: "text-slate-900",
  lightBadgeBg: "bg-slate-200/80",
  lightBadgeText: "text-slate-800",
};

const BANK_COLOR_THEMES: Record<string, BankCardTheme> = {
  Banesco: {
    lightBg: "bg-emerald-50/60 hover:bg-emerald-50",
    lightActiveBg: "bg-emerald-50",
    lightBorder: "border-emerald-200/80",
    lightActiveRing: "ring-2 ring-emerald-500 border-emerald-500",
    dot: "bg-emerald-500",
    lightTitle: "text-emerald-900",
    lightBadgeBg: "bg-emerald-100/90",
    lightBadgeText: "text-emerald-800",
  },
  "Pago Móvil": {
    lightBg: "bg-violet-50/60 hover:bg-violet-50",
    lightActiveBg: "bg-violet-50",
    lightBorder: "border-violet-200/80",
    lightActiveRing: "ring-2 ring-violet-500 border-violet-500",
    dot: "bg-violet-500",
    lightTitle: "text-violet-900",
    lightBadgeBg: "bg-violet-100/90",
    lightBadgeText: "text-violet-800",
  },
  Mercantil: {
    lightBg: "bg-blue-50/60 hover:bg-blue-50",
    lightActiveBg: "bg-blue-50",
    lightBorder: "border-blue-200/80",
    lightActiveRing: "ring-2 ring-blue-500 border-blue-500",
    dot: "bg-blue-600",
    lightTitle: "text-blue-900",
    lightBadgeBg: "bg-blue-100/90",
    lightBadgeText: "text-blue-800",
  },
  BBVA: {
    lightBg: "bg-sky-50/60 hover:bg-sky-50",
    lightActiveBg: "bg-sky-50",
    lightBorder: "border-sky-200/80",
    lightActiveRing: "ring-2 ring-sky-500 border-sky-500",
    dot: "bg-sky-500",
    lightTitle: "text-sky-900",
    lightBadgeBg: "bg-sky-100/90",
    lightBadgeText: "text-sky-800",
  },
  "Banco de Venezuela": {
    lightBg: "bg-rose-50/60 hover:bg-rose-50",
    lightActiveBg: "bg-rose-50",
    lightBorder: "border-rose-200/80",
    lightActiveRing: "ring-2 ring-rose-500 border-rose-500",
    dot: "bg-rose-600",
    lightTitle: "text-rose-950",
    lightBadgeBg: "bg-rose-100/90",
    lightBadgeText: "text-rose-800",
  },
  Bancamiga: {
    lightBg: "bg-teal-50/60 hover:bg-teal-50",
    lightActiveBg: "bg-teal-50",
    lightBorder: "border-teal-200/80",
    lightActiveRing: "ring-2 ring-teal-500 border-teal-500",
    dot: "bg-teal-500",
    lightTitle: "text-teal-950",
    lightBadgeBg: "bg-teal-100/90",
    lightBadgeText: "text-teal-800",
  },
  BNC: {
    lightBg: "bg-amber-50/60 hover:bg-amber-50",
    lightActiveBg: "bg-amber-50",
    lightBorder: "border-amber-200/80",
    lightActiveRing: "ring-2 ring-amber-500 border-amber-500",
    dot: "bg-amber-600",
    lightTitle: "text-amber-950",
    lightBadgeBg: "bg-amber-100/90",
    lightBadgeText: "text-amber-800",
  },
};

function formatSignedBankMetric(
  rawValue: string | undefined,
  suffix: string
): { readonly label: string; readonly isPositive: boolean } {
  const cleaned = (rawValue ?? "0")
    .replace(/Bs\.?/gi, "")
    .replace(/%/g, "")
    .trim();
  const formatted = formatDecimalWithCommas(cleaned, 2);
  const isPositive = !formatted.startsWith("-");
  const signed = isPositive ? `+${formatted}` : formatted;
  return {
    label: `${signed}${suffix}`,
    isPositive,
  };
}

export function LiveMarketView({
  selectedBank,
  onSelectBank,
  sellBrechaAmount,
  onSellBrechaAmountChange,
  buyBrechaAmount,
  onBuyBrechaAmountChange,
}: LiveMarketViewProps) {
  const [sellInputText, setSellInputText] = React.useState(
    String(sellBrechaAmount)
  );
  const [buyInputText, setBuyInputText] = React.useState(
    String(buyBrechaAmount)
  );

  React.useEffect(() => {
    setSellInputText(String(sellBrechaAmount));
  }, [sellBrechaAmount]);

  React.useEffect(() => {
    setBuyInputText(String(buyBrechaAmount));
  }, [buyBrechaAmount]);

  const banksQuery = useVenezuelanBanksQuery(buyBrechaAmount, sellBrechaAmount);
  const banks = banksQuery.data ?? [];
  const effectiveSelectedBank =
    selectedBank ?? (banks[0]?.bankName || "Banesco");

  const handleSellTextChange = (raw: string) => {
    const sanitized = raw.replace(/[^\d]/g, "");
    setSellInputText(sanitized);
    const parsed = Number(sanitized);
    if (sanitized !== "" && Number.isFinite(parsed) && parsed > 0) {
      onSellBrechaAmountChange(parsed);
    }
  };

  const handleSellBlur = () => {
    const parsed = Number(sellInputText);
    if (!sellInputText || !Number.isFinite(parsed) || parsed <= 0) {
      setSellInputText(String(sellBrechaAmount));
    } else {
      onSellBrechaAmountChange(parsed);
    }
  };

  const handleBuyTextChange = (raw: string) => {
    const sanitized = raw.replace(/[^\d]/g, "");
    setBuyInputText(sanitized);
    const parsed = Number(sanitized);
    if (sanitized !== "" && Number.isFinite(parsed) && parsed > 0) {
      onBuyBrechaAmountChange(parsed);
    }
  };

  const handleBuyBlur = () => {
    const parsed = Number(buyInputText);
    if (!buyInputText || !Number.isFinite(parsed) || parsed <= 0) {
      setBuyInputText(String(buyBrechaAmount));
    } else {
      onBuyBrechaAmountChange(parsed);
    }
  };

  const handleApplySuggested = (amount: number) => {
    setSellInputText(String(amount));
    setBuyInputText(String(amount));
    onSellBrechaAmountChange(amount);
    onBuyBrechaAmountChange(amount);
  };

  return (
    <section className="grid grid-cols-1 items-start gap-3 lg:grid-cols-12">
      {/* IZQUIERDA: Gráfica TradingView en Vivo (estática junto a las brechas) */}
      <div className="lg:col-span-6">
        <TradingViewP2PChart
          selectedBank={effectiveSelectedBank}
          onSelectBank={(bankName) => onSelectBank(bankName)}
          height={470}
          compact
        />
      </div>

      {/* DERECHA: Monitor de Brechas en Vivo (7 Bancos Venezuela) sin scroll */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs transition-colors dark:border-[#2B3139] dark:bg-[#181A20] lg:col-span-6">
        <div className="flex flex-col gap-2.5 border-b border-slate-100 pb-3 dark:border-[#2B3139]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-[#FCD535]/10 dark:text-[#FCD535]">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-xs font-extrabold text-slate-900 dark:text-[#EAECEF]">
                  Brechas en Vivo por Banco (Merchant Verificado)
                </h2>
                <p className="text-[10px] text-slate-500 dark:text-[#848E9C]">
                  Clic en un banco para ver su gráfica horaria 24/7 (-4:00 UTC)
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void banksQuery.refetch()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#EAECEF] dark:hover:border-[#FCD535]/50"
              title="Actualizar cotizaciones Binance C2C"
            >
              <RefreshCw
                className={cn(
                  "h-3 w-3",
                  banksQuery.isFetching &&
                    "animate-spin text-emerald-600 dark:text-[#FCD535]"
                )}
              />
              <span>Vivo</span>
            </button>
          </div>

          {/* Filtros de Monto: Venta a la IZQUIERDA, Compra a la DERECHA + Sugeridos 20k/50k/100k */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Input VENTA (IZQUIERDA) */}
              <label className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50/60 px-2 py-1 text-[10px] font-bold text-rose-800 transition-colors focus-within:border-rose-400 dark:border-[#F6465D]/40 dark:bg-[#F6465D]/10 dark:text-[#F6465D]">
                <span>Venta Bs:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={sellInputText}
                  onChange={(e) => handleSellTextChange(e.target.value)}
                  onBlur={handleSellBlur}
                  placeholder="100000"
                  className="w-20 bg-transparent font-mono text-[11px] font-extrabold tabular-nums text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-[#EAECEF]"
                />
              </label>

              {/* Input COMPRA (DERECHA) */}
              <label className="flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50/60 px-2 py-1 text-[10px] font-bold text-emerald-800 transition-colors focus-within:border-emerald-400 dark:border-[#0ECB81]/40 dark:bg-[#0ECB81]/10 dark:text-[#0ECB81]">
                <span>Compra Bs:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={buyInputText}
                  onChange={(e) => handleBuyTextChange(e.target.value)}
                  onBlur={handleBuyBlur}
                  placeholder="100000"
                  className="w-20 bg-transparent font-mono text-[11px] font-extrabold tabular-nums text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-[#EAECEF]"
                />
              </label>
            </div>

            {/* Montos sugeridos rápidos */}
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-[#2B3139] dark:bg-[#1E2329]">
              <span className="px-1 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#848E9C]">
                Sug:
              </span>
              {SUGGESTED_AMOUNTS.map((preset) => {
                const isActive =
                  sellBrechaAmount === preset.value &&
                  buyBrechaAmount === preset.value;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleApplySuggested(preset.value)}
                    className={cn(
                      "rounded-md px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums transition-all",
                      isActive
                        ? "bg-slate-900 text-white shadow-xs dark:bg-[#FCD535] dark:text-[#0B0E11]"
                        : "text-slate-600 hover:bg-white hover:text-slate-900 dark:text-[#848E9C] dark:hover:bg-[#2B3139] dark:hover:text-[#EAECEF]"
                    )}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Grid compacto de 7 Bancos (cabe completo sin scroll) */}
        <div className="pt-3">
          {banksQuery.isLoading ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 7 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-32 animate-pulse rounded-xl bg-slate-100 dark:bg-[#1E2329]"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {banks.map((bank) => {
                const isActiveBank = effectiveSelectedBank === bank.bankName;
                const theme =
                  BANK_COLOR_THEMES[bank.bankName] ?? DEFAULT_BANK_THEME;
                const brechaFormatted = formatSignedBankMetric(
                  bank.brechaPointsVes,
                  " Bs"
                );
                const spreadFormatted = formatSignedBankMetric(
                  bank.spreadPercent,
                  "%"
                );

                return (
                  <button
                    key={bank.bankName}
                    type="button"
                    onClick={() => onSelectBank(bank.bankName)}
                    className={cn(
                      "group flex flex-col justify-between gap-1.5 rounded-xl border p-2.5 text-left transition-all duration-150 active:scale-[0.98]",
                      theme.lightBorder,
                      isActiveBank
                        ? cn(theme.lightActiveBg, theme.lightActiveRing, "shadow-md")
                        : theme.lightBg,
                      "dark:border-[#2B3139] dark:bg-[#1E2329] dark:hover:border-[#FCD535]/50 dark:hover:bg-[#222730]",
                      isActiveBank &&
                        "dark:border-[#FCD535] dark:ring-1 dark:ring-[#FCD535]/70 dark:bg-[#222730]"
                    )}
                  >
                    {/* Fila 1: Nombre del banco + estado API */}
                    <div className="flex w-full items-center justify-between gap-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            theme.dot
                          )}
                        />
                        <span
                          className={cn(
                            "truncate text-[11px] font-extrabold leading-tight dark:text-[#EAECEF]",
                            theme.lightTitle
                          )}
                        >
                          {bank.bankName}
                        </span>
                      </div>
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-bold dark:bg-[#0B0E11]/70 dark:text-[#EAECEF]",
                          theme.lightBadgeBg,
                          theme.lightBadgeText
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            bank.isLiveApi
                              ? "bg-emerald-500 dark:bg-[#0ECB81]"
                              : "bg-amber-400 dark:bg-[#FCD535]"
                          )}
                        />
                        <span>{bank.isLiveApi ? "Vivo" : "Base"}</span>
                      </span>
                    </div>

                    {/* Fila 2: Puntos de Brecha & Spread % */}
                    <div className="flex flex-wrap items-baseline justify-between gap-1">
                      <span
                        className={cn(
                          "font-mono text-base font-extrabold tracking-tight tabular-nums",
                          brechaFormatted.isPositive
                            ? "text-slate-900 dark:text-[#EAECEF]"
                            : "text-rose-700 dark:text-[#F6465D]"
                        )}
                      >
                        {brechaFormatted.label}
                      </span>
                      <span
                        className={cn(
                          "rounded border px-1 py-0.5 font-mono text-[10px] font-extrabold tabular-nums",
                          spreadFormatted.isPositive
                            ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-[#0ECB81]/30 dark:bg-[#0ECB81]/15 dark:text-[#0ECB81]"
                            : "border-rose-300 bg-rose-100 text-rose-800 dark:border-[#F6465D]/30 dark:bg-[#F6465D]/15 dark:text-[#F6465D]"
                        )}
                      >
                        {spreadFormatted.label}
                      </span>
                    </div>

                    {/* Fila 3: Venta y Compra compactos */}
                    <div className="flex flex-col gap-1 rounded-lg border border-black/5 bg-white/80 px-2 py-1.5 text-[10px] dark:border-[#2B3139] dark:bg-[#181A20]">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-extrabold text-rose-700 dark:text-[#F6465D]">
                          Venta:
                        </span>
                        <span className="font-mono font-extrabold tabular-nums text-slate-900 dark:text-[#EAECEF]">
                          {formatDecimalWithCommas(bank.sellRate2nd)} Bs
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1 border-t border-black/5 pt-1 dark:border-[#2B3139]">
                        <span className="font-extrabold text-emerald-700 dark:text-[#0ECB81]">
                          Compra:
                        </span>
                        <span className="font-mono font-extrabold tabular-nums text-slate-900 dark:text-[#EAECEF]">
                          {formatDecimalWithCommas(bank.buyRate2nd)} Bs
                        </span>
                      </div>
                    </div>

                    {/* Fila 4: Footer */}
                    <div className="flex items-center justify-between gap-1 text-[9px] font-semibold text-slate-500 dark:text-[#848E9C]">
                      <span className="truncate font-mono tabular-nums">
                        {bank.merchantSellNick || "Merchant"}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 font-bold",
                          isActiveBank
                            ? "text-slate-900 dark:text-[#FCD535]"
                            : "text-slate-600 group-hover:text-slate-950 dark:text-[#848E9C] dark:group-hover:text-[#EAECEF]"
                        )}
                      >
                        {isActiveBank ? "Activa ✓" : "Gráfica →"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
