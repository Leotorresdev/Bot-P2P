"use client";

import * as React from "react";
import Link from "next/link";
import Decimal from "decimal.js";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  BarChart2,
  Bell,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Layers,
  Lock,
  MessageCircle,
  PieChart,
  Play,
  Radio,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Square,
  Volume2,
} from "lucide-react";
import { toast } from "sonner";
import { FinanceLogo } from "@/components/ui/finance-logo";
import {
  MERCHANT_BADGE_META,
  type MerchantBadgeType,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import {
  playBrechaImprovedSound,
  playShiftCloseSound,
  playShiftStartSound,
  unlockAudioContext,
} from "@/lib/notification-sound";
import { cn } from "@/lib/utils";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const SUPPORT_WHATSAPP_DISPLAY = "0424-7807851";
const SUPPORT_WHATSAPP_URL =
  "https://wa.me/584247807851?text=" +
  encodeURIComponent(
    "Hola, acabo de probar la Demo Interactiva de Bot P2P Venezuela y quiero activar mi cuenta."
  );

interface DemoBankItem {
  readonly name: string;
  readonly baseSell: string;
  readonly baseBuy: string;
}

const DEMO_BANKS_BASE: readonly DemoBankItem[] = [
  { name: "Banesco", baseSell: "53.85", baseBuy: "52.95" },
  { name: "Pago Móvil", baseSell: "53.72", baseBuy: "52.88" },
  { name: "Mercantil", baseSell: "53.68", baseBuy: "52.92" },
  { name: "BBVA", baseSell: "53.60", baseBuy: "52.85" },
  { name: "Banco de Venezuela", baseSell: "53.55", baseBuy: "52.80" },
  { name: "Bancamiga", baseSell: "53.62", baseBuy: "52.90" },
  { name: "BNC", baseSell: "53.50", baseBuy: "52.78" },
];

const DEMO_STEPS = [
  {
    id: 1,
    shortLabel: "1. Brechas & Alertas",
    title: "Monitor de Brechas en Vivo (7 Bancos VE) + Alertas Sonoras",
    subtitle:
      "Compara en vivo el 2do anuncio de comerciantes verificados en Binance C2C y suena cuando mejora la brecha.",
    icon: Building2,
  },
  {
    id: 2,
    shortLabel: "2. Gráfica 5m",
    title: "Gráfica de Mercado cada 5 Minutos (Curva y Velas)",
    subtitle:
      "Visualiza la tendencia real de Venta (verde), Compra (rojo) y promedio móvil SMA(6) en hora Venezuela (-4:00 UTC).",
    icon: BarChart2,
  },
  {
    id: 3,
    shortLabel: "3. Jornadas",
    title: "Control de Jornadas 100% Manual + Segundo Plano Activo",
    subtitle:
      "Inicia y cierra cuando quieras (horas o varios días), con notificación sonora y pulso activo en segundo plano.",
    icon: Play,
  },
  {
    id: 4,
    shortLabel: "4. Ganancias",
    title: "Resultados Reales — Motor por Vuelta e Insignias Binance",
    subtitle:
      "Calcula tu ganancia neta exacta en USDT y Bs. usando promedios ponderados reales y tu nivel de insignia.",
    icon: PieChart,
  },
  {
    id: 5,
    shortLabel: "5. Contador & Excel",
    title: "Modo Contador SENIAT y Excel Multi-Hoja de 3 Pestañas",
    subtitle:
      "Suma exacta día por día (sin falsos negativos), descarta canceladas y monedas ≠ USDT, listo para auditar.",
    icon: FileSpreadsheet,
  },
  {
    id: 6,
    shortLabel: "6. App & Soporte",
    title: "Instálalo como App en tu Teléfono y Actívalo Hoy",
    subtitle:
      "Sesión abierta hasta que decidas salir, acceso directo en Android/iPhone y soporte directo por WhatsApp.",
    icon: Smartphone,
  },
] as const;

function formatMoney(dec: Decimal, decimals: number = 2): string {
  const fixed = dec.toFixed(decimals);
  const isNeg = fixed.startsWith("-");
  const unsigned = isNeg ? fixed.slice(1) : fixed;
  const [intPart = "0", fracPart] = unsigned.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const out = fracPart !== undefined ? `${withCommas}.${fracPart}` : withCommas;
  return isNeg ? `-${out}` : out;
}

export function InteractiveDemoScreen() {
  const [stepIndex, setStepIndex] = React.useState<number>(0);

  // Paso 1: Brechas simuladas
  const [filterAmountVes, setFilterAmountVes] = React.useState<number>(100_000);
  const [selectedBank, setSelectedBank] = React.useState<string>("Banesco");
  const [banescoBoostBs, setBanescoBoostBs] = React.useState<string>("0");

  // Paso 2: Gráfica modo Curva vs Velas
  const [chartMode, setChartMode] = React.useState<"CURVE" | "CANDLES">("CURVE");

  // Paso 3: Jornada interactiva
  const [demoShiftActive, setDemoShiftActive] = React.useState<boolean>(false);
  const [demoShiftSeconds, setDemoShiftSeconds] = React.useState<number>(0);
  const [demoClosedCount, setDemoClosedCount] = React.useState<number>(0);

  // Paso 4: Resultados & Insignia
  const [demoBadge, setDemoBadge] = React.useState<MerchantBadgeType>("GOLD");

  // Paso 5: Modo Contador & Excel 3 hojas
  const [demoSeniatPct, setDemoSeniatPct] = React.useState<number>(16);
  const [excelTab, setExcelTab] = React.useState<"RESUMEN" | "COMPLETADAS" | "ESPEJO">("RESUMEN");

  React.useEffect(() => {
    if (!demoShiftActive) return;
    const id = setInterval(() => {
      setDemoShiftSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [demoShiftActive]);

  const currentStep = DEMO_STEPS[stepIndex] ?? DEMO_STEPS[0];

  // Cálculo de bancos simulados según monto filtro
  const computedBanks = React.useMemo(() => {
    const amountFactor =
      filterAmountVes === 20_000
        ? new Decimal("0.12")
        : filterAmountVes === 50_000
          ? new Decimal("0.05")
          : new Decimal("0");

    return DEMO_BANKS_BASE.map((b) => {
      const extraBoost =
        b.name === "Banesco" ? new Decimal(banescoBoostBs) : new Decimal(0);
      const sell = new Decimal(b.baseSell).plus(amountFactor).plus(extraBoost);
      const buy = new Decimal(b.baseBuy).minus(amountFactor.mul("0.3"));
      const pts = sell.minus(buy);
      const spreadPct = buy.gt(0) ? pts.div(buy).mul(100) : new Decimal(0);
      return {
        name: b.name,
        sellStr: formatMoney(sell, 2),
        buyStr: formatMoney(buy, 2),
        ptsStr: `+${pts.toFixed(2)}`,
        spreadPctStr: `+${spreadPct.toFixed(2)}%`,
      };
    });
  }, [filterAmountVes, banescoBoostBs]);

  // Cálculo real del Motor por Vuelta en Paso 4 usando Decimal.js
  const demoResults = React.useMemo(() => {
    const soldUsdt = new Decimal("18500.00");
    const soldVes = new Decimal("995300.00"); // 53.80 Bs/USDT
    const boughtUsdt = new Decimal("18000.00");
    const boughtVes = new Decimal("952200.00"); // 52.90 Bs/USDT

    const avgSell = soldVes.div(soldUsdt);
    const avgBuy = boughtVes.div(boughtUsdt);
    const brecha = avgSell.minus(avgBuy);
    const vuelta = Decimal.min(soldUsdt, boughtUsdt);
    const grossBs = boughtUsdt.mul(brecha);
    const grossUsdt = grossBs.div(avgBuy);

    const badgeMeta = MERCHANT_BADGE_META[demoBadge];
    const totalVol = soldUsdt.plus(boughtUsdt);
    const commUsdt = totalVol.mul(new Decimal(badgeMeta.feeFactor));
    const commBs = commUsdt.mul(avgBuy);
    const netUsdt = grossUsdt.minus(commUsdt);
    const netBs = grossBs.minus(commBs);
    const seniatUsdt = Decimal.max(0, netUsdt).mul(
      new Decimal(demoSeniatPct).div(100)
    );
    const seniatBs = Decimal.max(0, netBs).mul(
      new Decimal(demoSeniatPct).div(100)
    );

    return {
      badgeMeta,
      soldUsdt: formatMoney(soldUsdt),
      soldVes: formatMoney(soldVes),
      boughtUsdt: formatMoney(boughtUsdt),
      boughtVes: formatMoney(boughtVes),
      avgSell: formatMoney(avgSell),
      avgBuy: formatMoney(avgBuy),
      brecha: `+${brecha.toFixed(2)}`,
      vuelta: formatMoney(vuelta),
      totalVol: formatMoney(totalVol),
      grossUsdt: formatMoney(grossUsdt),
      grossBs: formatMoney(grossBs),
      commUsdt: formatMoney(commUsdt),
      commBs: formatMoney(commBs),
      netUsdt: formatMoney(netUsdt),
      netBs: formatMoney(netBs),
      seniatUsdt: formatMoney(seniatUsdt),
      seniatBs: formatMoney(seniatBs),
    };
  }, [demoBadge, demoSeniatPct]);

  const handleSimulateBrechaAlert = async () => {
    await unlockAudioContext();
    setSelectedBank("Banesco");
    setBanescoBoostBs((prev) => (prev === "0" ? "0.45" : "0.72"));
    await playBrechaImprovedSound();
    toast.success("Brecha mejoró en Banesco: +2.55% (+0.45%)", {
      description:
        "Venta 54.30 Bs · Compra 52.95 Bs (+1.35 pts) — Alerta sonora de demostración",
      duration: 5000,
    });
  };

  const handleDemoStartShift = async () => {
    await unlockAudioContext();
    setDemoShiftSeconds(0);
    setDemoShiftActive(true);
    await playShiftStartSound();
    toast.success("Jornada Demo iniciada", {
      description:
        "Sonido de arranque reproducido y monitoreo en segundo plano activado.",
    });
  };

  const handleDemoCloseShift = async () => {
    await unlockAudioContext();
    setDemoShiftActive(false);
    setDemoClosedCount((prev) => prev + 1);
    await playShiftCloseSound();
    toast.info("Jornada Demo cerrada y guardada", {
      description:
        "El corte quedó almacenado en tu historial y el tablero volvió a 0.00.",
    });
  };

  const formatTimer = (sec: number) => {
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    return `00:${mm}:${ss}`;
  };

  return (
    <div className="min-h-screen w-full bg-[#0B0E11] text-[#EAECEF] antialiased selection:bg-[#FCD535] selection:text-[#0B0E11]">
      {/* Header Sticky */}
      <header className="sticky top-0 z-30 border-b border-[#2B3139] bg-[#0B0E11]/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/planes" className="flex items-center gap-3">
              <FinanceLogo
                size={36}
                className="h-9 w-9 rounded-xl shadow-md shadow-[#0ECB81]/15"
              />
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-display text-base font-extrabold text-[#EAECEF]">
                    Bot P2P
                  </span>
                  <span className="rounded-full border border-[#0ECB81]/40 bg-[#0ECB81]/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#0ECB81]">
                    Demo Interactiva
                  </span>
                </div>
                <span className="text-[11px] text-[#848E9C]">
                  Simulador guiado sin cuenta ni API Key de Binance
                </span>
              </div>
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/planes"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#2B3139] bg-[#1E2329] px-3.5 py-2 text-xs font-bold text-[#EAECEF] transition-all hover:border-[#FCD535]/50"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-[#848E9C]" />
              <span>Ver Planes</span>
            </Link>
            <a
              href={SUPPORT_WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] px-3.5 py-2 text-xs font-extrabold text-[#0B0E11] transition-all hover:bg-[#22c35e]"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>WhatsApp {SUPPORT_WHATSAPP_DISPLAY}</span>
            </a>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#FCD535] px-4 py-2 text-xs font-extrabold text-[#0B0E11] transition-all hover:bg-[#F0B90B]"
            >
              <span>Crear Cuenta</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1320px] flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        {/* Barra de Pasos del Tour Interactivo */}
        <section className="rounded-2xl border border-[#2B3139] bg-[#181A20] p-4 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#FCD535]" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-[#FCD535]">
                Recorrido Interactivo · Paso {stepIndex + 1} de{" "}
                {DEMO_STEPS.length}
              </span>
            </div>
            <span className="text-[11px] font-medium text-[#848E9C]">
              Toca los botones de cada paso para probar el comportamiento real del bot
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {DEMO_STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isActive = idx === stepIndex;
              const isDone = idx < stepIndex;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setStepIndex(idx)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-bold transition-all",
                    isActive
                      ? "border-[#FCD535] bg-[#FCD535]/15 text-[#FCD535]"
                      : isDone
                        ? "border-[#0ECB81]/35 bg-[#0ECB81]/10 text-[#0ECB81]"
                        : "border-[#2B3139] bg-[#0B0E11] text-[#848E9C] hover:border-[#848E9C]/40 hover:text-[#EAECEF]"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{step.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Escenario Interactivo del Paso Actual */}
        <section className="overflow-hidden rounded-2xl border border-[#2B3139] bg-[#181A20] shadow-2xl">
          <div className="h-1 w-full bg-gradient-to-r from-[#0ECB81] via-[#FCD535] to-[#0ECB81]" />

          <div className="flex flex-col gap-5 p-5 sm:p-7">
            {/* Título del Paso */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#2B3139] pb-4">
              <div>
                <h1 className="font-display text-xl font-extrabold text-[#EAECEF] sm:text-2xl">
                  {currentStep.title}
                </h1>
                <p className="mt-1 text-xs leading-relaxed text-[#848E9C] sm:text-sm">
                  {currentStep.subtitle}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
                  disabled={stepIndex === 0}
                  className="inline-flex items-center gap-1 rounded-xl border border-[#2B3139] bg-[#0B0E11] px-3 py-2 text-xs font-bold text-[#EAECEF] hover:border-[#FCD535]/50 disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Anterior</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setStepIndex((prev) =>
                      Math.min(DEMO_STEPS.length - 1, prev + 1)
                    )
                  }
                  disabled={stepIndex === DEMO_STEPS.length - 1}
                  className="inline-flex items-center gap-1 rounded-xl bg-[#FCD535] px-3.5 py-2 text-xs font-extrabold text-[#0B0E11] hover:bg-[#F0B90B] disabled:opacity-40"
                >
                  <span>Siguiente</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* PASO 1: BRECHAS EN VIVO & ALERTA SONORA */}
            {stepIndex === 0 && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[#848E9C]">
                      Monto filtro en Bs.:
                    </span>
                    {[20_000, 50_000, 100_000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setFilterAmountVes(amt)}
                        className={cn(
                          "rounded-lg px-3 py-1.5 font-mono text-xs font-extrabold transition-all",
                          filterAmountVes === amt
                            ? "bg-[#FCD535] text-[#0B0E11]"
                            : "border border-[#2B3139] bg-[#181A20] text-[#EAECEF] hover:border-[#FCD535]/50"
                        )}
                      >
                        {(amt / 1000).toFixed(0)}k Bs.
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleSimulateBrechaAlert()}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#0ECB81] px-4 py-2 text-xs font-extrabold text-[#0B0E11] shadow-sm transition-all hover:bg-[#0ECB81]/90 active:scale-[0.98]"
                  >
                    <Volume2 className="h-4 w-4" />
                    <span>Simular mejora de brecha (con sonido)</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {computedBanks.map((bank) => {
                    const isSelected = selectedBank === bank.name;
                    return (
                      <button
                        key={bank.name}
                        type="button"
                        onClick={() => setSelectedBank(bank.name)}
                        className={cn(
                          "flex flex-col gap-2 rounded-xl border p-3.5 text-left transition-all",
                          isSelected
                            ? "border-[#0ECB81] bg-[#0ECB81]/10 ring-1 ring-[#0ECB81]"
                            : "border-[#2B3139] bg-[#0B0E11] hover:border-[#FCD535]/40"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-extrabold text-[#EAECEF]">
                            {bank.name}
                          </span>
                          <span className="rounded-md bg-[#0ECB81]/20 px-2 py-0.5 font-mono text-[11px] font-extrabold text-[#0ECB81]">
                            {bank.spreadPctStr}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                          <div className="rounded-lg bg-[#181A20] px-2 py-1.5">
                            <span className="block text-[10px] text-[#848E9C]">
                              Venta (2do)
                            </span>
                            <span className="font-extrabold text-[#0ECB81]">
                              {bank.sellStr} Bs
                            </span>
                          </div>
                          <div className="rounded-lg bg-[#181A20] px-2 py-1.5">
                            <span className="block text-[10px] text-[#848E9C]">
                              Compra (2do)
                            </span>
                            <span className="font-extrabold text-[#F6465D]">
                              {bank.buyStr} Bs
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-[#848E9C]">
                          <span>Brecha neta</span>
                          <span className="font-mono font-bold text-[#FCD535]">
                            {bank.ptsStr} pts
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PASO 2: GRÁFICA 5M CURVA VS VELAS */}
            {stepIndex === 1 && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-lg bg-[#0ECB81]/15 px-2.5 py-1 font-bold text-[#0ECB81]">
                      ● Venta (Verde)
                    </span>
                    <span className="rounded-lg bg-[#F6465D]/15 px-2.5 py-1 font-bold text-[#F6465D]">
                      ● Compra (Rojo)
                    </span>
                    <span className="rounded-lg bg-[#FCD535]/15 px-2.5 py-1 font-bold text-[#FCD535]">
                      ● Tendencia SMA(6)
                    </span>
                  </div>
                  <div className="flex items-center gap-1 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-1">
                    <button
                      type="button"
                      onClick={() => setChartMode("CURVE")}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-extrabold transition-all",
                        chartMode === "CURVE"
                          ? "bg-[#FCD535] text-[#0B0E11]"
                          : "text-[#848E9C] hover:text-[#EAECEF]"
                      )}
                    >
                      Curva 5m (Suave)
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartMode("CANDLES")}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-xs font-extrabold transition-all",
                        chartMode === "CANDLES"
                          ? "bg-[#FCD535] text-[#0B0E11]"
                          : "text-[#848E9C] hover:text-[#EAECEF]"
                      )}
                    >
                      Velas 5m (OHLC)
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#2B3139] bg-[#0B0E11] p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-[#EAECEF]">
                      Banesco · Intervalo exacto 5 minutos (-4:00 UTC)
                    </span>
                    <span className="font-mono text-[#0ECB81]">
                      Brecha Promedio: +0.92 Bs (+1.73%)
                    </span>
                  </div>

                  <svg
                    viewBox="0 0 800 240"
                    className="h-[220px] w-full overflow-visible"
                    aria-label="Vista previa interactiva de gráfica 5m"
                  >
                    {[40, 95, 150, 205].map((y) => (
                      <line
                        key={y}
                        x1="0"
                        y1={y}
                        x2="800"
                        y2={y}
                        stroke="#2B3139"
                        strokeDasharray="4 4"
                      />
                    ))}

                    {chartMode === "CURVE" ? (
                      <>
                        <path
                          d="M 10 120 C 90 110, 140 85, 220 92 C 300 100, 360 65, 450 58 C 540 52, 620 75, 700 45 C 745 30, 775 38, 790 32"
                          fill="none"
                          stroke="#0ECB81"
                          strokeWidth="3.2"
                          strokeLinecap="round"
                        />
                        <path
                          d="M 10 175 C 90 168, 140 152, 220 158 C 300 162, 360 135, 450 130 C 540 125, 620 142, 700 118 C 745 106, 775 110, 790 105"
                          fill="none"
                          stroke="#F6465D"
                          strokeWidth="2.8"
                          strokeLinecap="round"
                        />
                        <path
                          d="M 10 148 C 120 136, 260 122, 420 100 C 580 82, 690 78, 790 68"
                          fill="none"
                          stroke="#FCD535"
                          strokeWidth="2"
                          strokeDasharray="6 4"
                        />
                      </>
                    ) : (
                      Array.from({ length: 18 }).map((_, idx) => {
                        const x = 28 + idx * 43;
                        const up = idx % 3 !== 1;
                        const yTop = 55 + ((idx * 17) % 70);
                        const h = 24 + ((idx * 11) % 36);
                        const color = up ? "#0ECB81" : "#F6465D";
                        return (
                          <g key={idx}>
                            <line
                              x1={x}
                              y1={yTop - 14}
                              x2={x}
                              y2={yTop + h + 14}
                              stroke={color}
                              strokeWidth="2"
                            />
                            <rect
                              x={x - 7}
                              y={yTop}
                              width="14"
                              height={h}
                              rx="2.5"
                              fill={color}
                            />
                          </g>
                        );
                      })
                    )}
                  </svg>
                </div>
              </div>
            )}

            {/* PASO 3: JORNADA MANUAL + 2DO PLANO */}
            {stepIndex === 2 && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#2B3139] bg-[#0B0E11] p-5">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold",
                          demoShiftActive
                            ? "border border-[#0ECB81]/50 bg-[#0ECB81]/20 text-[#0ECB81]"
                            : "border border-[#FCD535]/40 bg-[#FCD535]/15 text-[#FCD535]"
                        )}
                      >
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full",
                            demoShiftActive
                              ? "animate-ping bg-[#0ECB81]"
                              : "bg-[#FCD535]"
                          )}
                        />
                        {demoShiftActive
                          ? `EN CURSO · JORNADA DEMO #${demoClosedCount + 1}`
                          : "EN ESPERA (0.00)"}
                      </span>
                      {demoShiftActive && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#0ECB81]/35 bg-[#0ECB81]/10 px-2.5 py-1 text-[11px] font-bold text-[#0ECB81]">
                          <Radio className="h-3 w-3" />
                          2do plano activo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#848E9C]">
                      {demoShiftActive ? (
                        <>
                          Cronómetro en vivo:{" "}
                          <strong className="font-mono text-[#EAECEF]">
                            {formatTimer(demoShiftSeconds)}
                          </strong>{" "}
                          · Sin auto-cierre nocturno, puedes dejarla abierta 1 o
                          más días.
                        </>
                      ) : (
                        "Pulsa Iniciar Jornada para escuchar el sonido de arranque y ver cómo trabaja el control de turno."
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDemoStartShift()}
                      disabled={demoShiftActive}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#0ECB81] px-4 py-2.5 text-xs font-extrabold text-[#0B0E11] transition-all hover:bg-[#0ECB81]/90 disabled:opacity-40"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      <span>Iniciar Jornada</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDemoCloseShift()}
                      disabled={!demoShiftActive}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#F6465D] px-4 py-2.5 text-xs font-extrabold text-white transition-all hover:bg-[#F6465D]/90 disabled:opacity-40"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                      <span>Cerrar Jornada</span>
                    </button>
                  </div>
                </div>

                {demoClosedCount > 0 && (
                  <div className="flex items-center gap-2.5 rounded-xl border border-[#0ECB81]/35 bg-[#0ECB81]/10 px-4 py-3 text-xs font-bold text-[#0ECB81]">
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                    <span>
                      ¡Excelente! Cerraste {demoClosedCount} jornada(s) de
                      prueba. En el bot real cada corte queda guardado con su
                      propio Excel y PDF, separado del libro mensual calendario.
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* PASO 4: RESULTADOS & MOTOR POR VUELTA */}
            {stepIndex === 3 && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#2B3139] bg-[#0B0E11] p-3.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#EAECEF]">
                    <Award className="h-4 w-4 text-[#FCD535]" />
                    <span>Elige tu Insignia Binance para ver el recálculo real:</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(["BRONZE", "SILVER", "GOLD"] as const).map((b) => {
                      const meta = MERCHANT_BADGE_META[b];
                      return (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setDemoBadge(b)}
                          className={cn(
                            "rounded-xl border px-3 py-1.5 text-xs font-extrabold transition-all",
                            demoBadge === b
                              ? "border-[#FCD535] bg-[#FCD535] text-[#0B0E11]"
                              : "border-[#2B3139] bg-[#181A20] text-[#EAECEF] hover:border-[#FCD535]/50"
                          )}
                        >
                          {meta.emoji} {meta.label} ({meta.feeLabel})
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-4">
                    <span className="text-[11px] font-bold text-[#848E9C]">
                      Total Vendido (USDT)
                    </span>
                    <p className="mt-1 font-mono text-lg font-extrabold text-[#0ECB81]">
                      {demoResults.soldUsdt} USDT
                    </p>
                    <p className="font-mono text-[11px] text-[#848E9C]">
                      Prom. {demoResults.avgSell} Bs · {demoResults.soldVes} Bs
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-4">
                    <span className="text-[11px] font-bold text-[#848E9C]">
                      Total Comprado (USDT)
                    </span>
                    <p className="mt-1 font-mono text-lg font-extrabold text-[#F6465D]">
                      {demoResults.boughtUsdt} USDT
                    </p>
                    <p className="font-mono text-[11px] text-[#848E9C]">
                      Prom. {demoResults.avgBuy} Bs · {demoResults.boughtVes} Bs
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-4">
                    <span className="text-[11px] font-bold text-[#848E9C]">
                      Comisión {demoResults.badgeMeta.label} (
                      {demoResults.badgeMeta.feeLabel})
                    </span>
                    <p className="mt-1 font-mono text-lg font-extrabold text-[#FCD535]">
                      -{demoResults.commUsdt} USDT
                    </p>
                    <p className="font-mono text-[11px] text-[#848E9C]">
                      Sobre vol. movido {demoResults.totalVol} USDT
                    </p>
                  </div>
                  <div className="rounded-xl border border-[#0ECB81]/50 bg-[#0ECB81]/10 p-4">
                    <span className="text-[11px] font-extrabold text-[#0ECB81]">
                      GANANCIA NETA REAL
                    </span>
                    <p className="mt-1 font-mono text-xl font-extrabold text-[#0ECB81]">
                      +{demoResults.netUsdt} USDT
                    </p>
                    <p className="font-mono text-xs font-bold text-[#EAECEF]">
                      +{demoResults.netBs} Bs. (Brecha {demoResults.brecha} pts)
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* PASO 5: MODO CONTADOR & EXCEL 3 HOJAS */}
            {stepIndex === 4 && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#FCD535]/35 bg-[#FCD535]/10 p-4">
                  <div className="flex items-center gap-3">
                    <Lock className="h-5 w-5 text-[#FCD535]" />
                    <div>
                      <p className="text-xs font-extrabold text-[#EAECEF]">
                        Provisión SENIAT Configurable por el Dueño (Solo Lectura
                        para tu Contador)
                      </p>
                      <p className="text-[11px] text-[#848E9C]">
                        Tu contador nunca ve tus API Keys ni puede tocar tus
                        jornadas; solo descarga el libro fiscal mensual.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 rounded-lg border border-[#2B3139] bg-[#0B0E11] px-3 py-1.5 text-xs font-bold">
                      <span className="text-[#848E9C]">SENIAT %:</span>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={demoSeniatPct}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v) && v >= 0 && v <= 50) {
                            setDemoSeniatPct(v);
                          }
                        }}
                        className="w-12 bg-transparent font-mono font-extrabold text-[#FCD535] focus:outline-none"
                      />
                    </label>
                    <div className="text-right font-mono">
                      <div className="text-sm font-extrabold text-[#FCD535]">
                        -{demoResults.seniatUsdt} USDT
                      </div>
                      <div className="text-[11px] text-[#EAECEF]">
                        {demoResults.seniatBs} Bs.
                      </div>
                    </div>
                  </div>
                </div>

                {/* Vista previa interactiva de las 3 hojas del Excel */}
                <div className="rounded-xl border border-[#2B3139] bg-[#0B0E11] p-4">
                  <div className="flex flex-wrap items-center gap-1.5 border-b border-[#2B3139] pb-3">
                    {(
                      [
                        { id: "RESUMEN", label: "Hoja 1: Resumen y Cierre" },
                        {
                          id: "COMPLETADAS",
                          label: "Hoja 2: Completadas USDT-VES",
                        },
                        {
                          id: "ESPEJO",
                          label: "Hoja 3: Espejo Completo Binance",
                        },
                      ] as const
                    ).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setExcelTab(t.id)}
                        className={cn(
                          "rounded-lg px-3 py-1.5 text-xs font-extrabold transition-all",
                          excelTab === t.id
                            ? "bg-[#0ECB81] text-[#0B0E11]"
                            : "border border-[#2B3139] bg-[#181A20] text-[#848E9C] hover:text-[#EAECEF]"
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {excelTab === "RESUMEN" && (
                    <div className="mt-3 space-y-2 text-xs text-[#EAECEF]">
                      <p className="text-[#848E9C]">
                        Suma exacta de ganancias y volúmenes día por día (sin
                        negativos falsos cuando sube la tasa del Bs.) + fila{" "}
                        <code className="text-[#0ECB81]">=SUM(...)</code>{" "}
                        cuadrada al centavo.
                      </p>
                      <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                        <div className="rounded-lg bg-[#181A20] p-2.5">
                          <span className="block text-[#848E9C]">Día 01/11</span>
                          <span className="font-bold text-[#0ECB81]">
                            +148.20 USDT
                          </span>
                        </div>
                        <div className="rounded-lg bg-[#181A20] p-2.5">
                          <span className="block text-[#848E9C]">Día 02/11</span>
                          <span className="font-bold text-[#0ECB81]">
                            +164.55 USDT
                          </span>
                        </div>
                        <div className="rounded-lg border border-[#0ECB81]/40 bg-[#0ECB81]/10 p-2.5">
                          <span className="block text-[#0ECB81]">
                            TOTAL MES (=SUM)
                          </span>
                          <span className="font-extrabold text-[#0ECB81]">
                            +312.75 USDT
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {excelTab === "COMPLETADAS" && (
                    <p className="mt-3 text-xs leading-relaxed text-[#EAECEF]">
                      Contiene <strong>únicamente</strong> las órdenes{" "}
                      <span className="font-bold text-[#0ECB81]">
                        COMPLETED + USDT + VES
                      </span>{" "}
                      con filas automáticas{" "}
                      <code className="text-[#FCD535]">=SUMIF(...)</code> de
                      Ventas y Compras al pie para que el contador audite todo
                      en segundos.
                    </p>
                  )}

                  {excelTab === "ESPEJO" && (
                    <div className="mt-3 space-y-2 text-xs">
                      <p className="text-[#848E9C]">
                        Conserva el 100% del historial cronológico de Binance,
                        etiquetando claramente qué órdenes fueron descartadas:
                      </p>
                      <div className="flex flex-wrap gap-2 font-mono text-[11px]">
                        <span className="rounded bg-[#0ECB81]/15 px-2 py-1 font-bold text-[#0ECB81]">
                          USDT/VES Completada → SÍ
                        </span>
                        <span className="rounded bg-[#F6465D]/15 px-2 py-1 font-bold text-[#F6465D]">
                          USDT/VES Cancelada → NO (Cancelada)
                        </span>
                        <span className="rounded bg-[#F6465D]/15 px-2 py-1 font-bold text-[#F6465D]">
                          BTC/VES Completada → NO (Moneda BTC ≠ USDT)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* PASO 6: PWA + WHATSAPP SOPORTE */}
            {stepIndex === 5 && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-3 rounded-2xl border border-[#2B3139] bg-[#0B0E11] p-5">
                  <div className="flex items-center gap-2 text-sm font-extrabold text-[#EAECEF]">
                    <Smartphone className="h-5 w-5 text-[#0ECB81]" />
                    <span>App Instalable en tu Teléfono (PWA)</span>
                  </div>
                  <ul className="space-y-2 text-xs text-[#848E9C]">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0ECB81]" />
                      <span>
                        Se instala en 1 clic desde Google Chrome (Android) o
                        Safari (iPhone) sin ocupar espacio pesado.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0ECB81]" />
                      <span>
                        Sesión abierta de forma permanente hasta que el dueño
                        pulse <strong className="text-[#EAECEF]">Salir</strong>.
                      </span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0ECB81]" />
                      <span>
                        Claves API de Binance de{" "}
                        <strong className="text-[#EAECEF]">Solo Lectura</strong>{" "}
                        cifradas con AES-256-GCM: tu dinero nunca sale de
                        Binance.
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[#25D366]/40 bg-[#25D366]/10 p-5">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-extrabold text-[#EAECEF]">
                      <ShieldCheck className="h-5 w-5 text-[#25D366]" />
                      <span>¿Listo para activar Bot P2P en tu cuenta?</span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-[#EAECEF]/80">
                      Plan Básico completo por <strong>$30/mes</strong>. Escribe
                      directo a nuestro WhatsApp oficial para activar tu cuenta
                      o resolver cualquier duda técnica:
                    </p>
                    <p className="mt-2 font-mono text-base font-extrabold text-[#25D366]">
                      +58 {SUPPORT_WHATSAPP_DISPLAY}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a
                      href={SUPPORT_WHATSAPP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-xs font-extrabold text-[#0B0E11] hover:bg-[#22c35e]"
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>Escribir al {SUPPORT_WHATSAPP_DISPLAY}</span>
                    </a>
                    <Link
                      href="/planes"
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#2B3139] bg-[#181A20] px-4 py-2.5 text-xs font-bold text-[#EAECEF] hover:border-[#FCD535]/60"
                    >
                      <Layers className="h-3.5 w-3.5 text-[#FCD535]" />
                      <span>Ver Planes</span>
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Barra de alerta rápida de ejemplo */}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#2B3139] bg-[#181A20] px-5 py-3.5 text-xs text-[#848E9C]">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-[#FCD535]" />
            <span>
              Esta demo funciona con datos simulados realistas de Venezuela.
              Ninguna cuenta real de Binance está conectada aquí.
            </span>
          </div>
          <Link
            href="/login"
            className="font-bold text-[#FCD535] hover:underline"
          >
            ¿Ya tienes cuenta? Iniciar Sesión &rarr;
          </Link>
        </section>
      </main>
    </div>
  );
}
