"use client";

import * as React from "react";
import {
  createChart,
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  TickMarkType,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import {
  TrendingUp,
  Maximize2,
  Minimize2,
  Layers,
  Sparkles,
  Clock,
} from "lucide-react";
import { useP2PChartDataQuery } from "@/features/p2p-ledger/api/use-p2p-queries";
import type { ChartTimeframe } from "@/features/p2p-ledger/schemas/p2p.schemas";
import {
  UTC_MINUS_4_OFFSET_SECONDS,
  extractPartsFromShiftedUtcDate,
} from "@/lib/timezone-utc4";
import { cn } from "@/lib/utils";

interface TradingViewP2PChartProps {
  readonly selectedBank: string;
  readonly onSelectBank?: (bank: string) => void;
  readonly height?: number;
  readonly compact?: boolean;
}

const MONTH_LABELS_ES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

/**
 * Lightweight Charts calcula cambios de día/mes/año e intervalos horarios en UTC.
 * Desplazamos cada marca Unix -4 horas (-14400s) para que la medianoche y cada
 * vela horaria coincidan exactamente con -4:00 UTC en ejes y crosshair.
 */
function toChartUtcMinus4Time(utcSeconds: number): Time {
  return (utcSeconds + UTC_MINUS_4_OFFSET_SECONDS) as Time;
}

function timeToDate(time: Time): Date {
  if (typeof time === "number") {
    return new Date(time * 1000);
  }
  if (typeof time === "string") {
    return new Date(time);
  }
  return new Date(Date.UTC(time.year, time.month - 1, time.day));
}

function formatShiftedTickMark(d: Date, tickMarkType: TickMarkType): string {
  const parts = extractPartsFromShiftedUtcDate(d);
  if (tickMarkType === TickMarkType.Year) {
    return String(parts.year);
  }
  if (
    tickMarkType === TickMarkType.DayOfMonth ||
    tickMarkType === TickMarkType.Month
  ) {
    const dayStr = String(parts.day).padStart(2, "0");
    const monthLabel = MONTH_LABELS_ES[parts.month - 1] ?? "";
    return `${dayStr} ${monthLabel}`;
  }
  return parts.hhMm;
}

function formatShiftedCrosshairTime(d: Date): string {
  const parts = extractPartsFromShiftedUtcDate(d);
  return `${parts.ddMm} ${parts.hhMm} (-4:00 UTC)`;
}

export function TradingViewP2PChart({
  selectedBank,
  height = 300,
}: TradingViewP2PChartProps) {
  const [timeframe, setTimeframe] = React.useState<ChartTimeframe>("24H");
  // Por defecto: Velas Japonesas de 1 Hora (1 vela por cada hora exacta VET)
  const [chartMode, setChartMode] = React.useState<"CANDLES" | "SPREAD">("CANDLES");
  const [isExpanded, setIsExpanded] = React.useState(false);

  const chartContainerRef = React.useRef<HTMLDivElement>(null);
  const chartInstanceRef = React.useRef<IChartApi | null>(null);
  const sellSeriesRef = React.useRef<ISeriesApi<"Area"> | null>(null);
  const buySeriesRef = React.useRef<ISeriesApi<"Area"> | null>(null);
  const candleSeriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);
  const fittedContextRef = React.useRef<string | null>(null);

  const effectiveBank = selectedBank || "Banesco";
  const { data: chartData, isLoading, isFetching } = useP2PChartDataQuery(
    effectiveBank,
    timeframe
  );

  // Inicialización del lienzo TradingView Canvas con horario estricto de Venezuela (UTC-4)
  React.useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
      sellSeriesRef.current = null;
      buySeriesRef.current = null;
      candleSeriesRef.current = null;
    }

    fittedContextRef.current = null;

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: isExpanded ? 460 : height,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#64748b",
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#f1f5f9", style: LineStyle.Dotted },
        horzLines: { color: "#f1f5f9", style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: "#059669",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#064e3b",
        },
        horzLine: {
          color: "#059669",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: "#064e3b",
        },
      },
      rightPriceScale: {
        borderColor: "#e2e8f0",
        scaleMargins: {
          top: 0.12,
          bottom: 0.12,
        },
      },
      timeScale: {
        borderColor: "#e2e8f0",
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        tickMarkFormatter: (time: Time, tickMarkType: TickMarkType) =>
          formatShiftedTickMark(timeToDate(time), tickMarkType),
      },
      localization: {
        priceFormatter: (p: number) => `${p.toFixed(2)} Bs.`,
        timeFormatter: (time: Time) =>
          formatShiftedCrosshairTime(timeToDate(time)),
      },
    });

    chartInstanceRef.current = chart;

    if (chartMode === "CANDLES") {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#059669",
        downColor: "#e11d48",
        borderVisible: false,
        wickUpColor: "#059669",
        wickDownColor: "#e11d48",
        priceFormat: {
          type: "custom",
          formatter: (price: number) => `${price.toFixed(2)} Bs.`,
        },
        title: "Vela 1H (VET)",
      });

      candleSeriesRef.current = candleSeries;
    } else {
      const sellSeries = chart.addSeries(AreaSeries, {
        lineColor: "#059669",
        topColor: "rgba(5, 150, 105, 0.22)",
        bottomColor: "rgba(5, 150, 105, 0.00)",
        lineWidth: 2,
        priceFormat: {
          type: "custom",
          formatter: (price: number) => `${price.toFixed(2)} Bs.`,
        },
        title: "Venta 1H",
      });

      const buySeries = chart.addSeries(AreaSeries, {
        lineColor: "#2563eb",
        topColor: "rgba(37, 99, 235, 0.15)",
        bottomColor: "rgba(37, 99, 235, 0.00)",
        lineWidth: 2,
        priceFormat: {
          type: "custom",
          formatter: (price: number) => `${price.toFixed(2)} Bs.`,
        },
        title: "Compra 1H",
      });

      sellSeriesRef.current = sellSeries;
      buySeriesRef.current = buySeries;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries[0] || !chartInstanceRef.current) return;
      const { width } = entries[0].contentRect;
      chartInstanceRef.current.applyOptions({
        width,
        height: isExpanded ? 460 : height,
      });
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [chartMode, height, isExpanded]);

  // Inyección y actualización en vivo de las velas horarias (preservando zoom/pan del usuario)
  React.useEffect(() => {
    if (!chartData) return;

    const contextKey = `${effectiveBank}::${timeframe}::${chartMode}`;
    const isNewContext = fittedContextRef.current !== contextKey;

    if (chartMode === "CANDLES") {
      if (candleSeriesRef.current && chartData.candles.length > 0) {
        const mappedCandles = chartData.candles.map((cd) => ({
          time: toChartUtcMinus4Time(cd.time),
          open: cd.open,
          high: cd.high,
          low: cd.low,
          close: cd.close,
        }));
        candleSeriesRef.current.setData(mappedCandles);
      }
    } else {
      if (sellSeriesRef.current && chartData.sellPoints.length > 0) {
        sellSeriesRef.current.setData(
          chartData.sellPoints.map((pt) => ({
            time: toChartUtcMinus4Time(pt.time),
            value: pt.value,
          }))
        );
      }

      if (buySeriesRef.current && chartData.buyPoints.length > 0) {
        buySeriesRef.current.setData(
          chartData.buyPoints.map((pt) => ({
            time: toChartUtcMinus4Time(pt.time),
            value: pt.value,
          }))
        );
      }
    }

    if (isNewContext && chartInstanceRef.current) {
      chartInstanceRef.current.timeScale().fitContent();
      fittedContextRef.current = contextKey;
    }
  }, [chartData, chartMode, effectiveBank, timeframe]);

  const currentSell = chartData?.currentSellRate ?? 1075.0;
  const currentBuy = chartData?.currentBuyRate ?? 1070.0;
  const currentSpread = chartData?.currentSpreadPct ?? 0.47;
  const brechaPoints = (currentSell - currentBuy).toFixed(2);

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs">
      {/* Barra de Control y Ticker en Vivo */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5 sm:px-5">
        {/* Lado Izquierdo: Banco + Precios en Vivo */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-display text-sm font-extrabold text-slate-900">
              {effectiveBank}
            </span>
            <span className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-extrabold text-slate-700">
              Velas 1H • -4:00 UTC
            </span>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          {/* Ticker de Cotización en Vivo */}
          <div className="flex items-center gap-2 text-xs font-bold">
            <div className="flex items-center gap-1 rounded-lg border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 text-emerald-700">
              <span className="text-[10px] font-semibold uppercase text-emerald-800/70">
                Venta:
              </span>
              <span>{currentSell.toFixed(2)} Bs.</span>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-blue-200/60 bg-blue-50 px-2 py-0.5 text-blue-700">
              <span className="text-[10px] font-semibold uppercase text-blue-800/70">
                Compra:
              </span>
              <span>{currentBuy.toFixed(2)} Bs.</span>
            </div>
            <div className="hidden sm:flex items-center gap-1 rounded-lg border border-purple-200/60 bg-purple-50 px-2 py-0.5 text-purple-700">
              <span className="text-[10px] font-semibold uppercase text-purple-800/70">
                Spread:
              </span>
              <span>
                +{currentSpread}% (+{brechaPoints} Bs.)
              </span>
            </div>
          </div>
        </div>

        {/* Lado Derecho: Selector de Modo + Ventana de Velas 1H + Expandir */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setChartMode("CANDLES")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-all cursor-pointer",
                chartMode === "CANDLES"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
              title="Ver Velas Japonesas de 1 Hora (OHLC)"
            >
              <Layers className="h-3 w-3" />
              <span>Velas 1H</span>
            </button>
            <button
              type="button"
              onClick={() => setChartMode("SPREAD")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-all cursor-pointer",
                chartMode === "SPREAD"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
              title="Comparar Venta vs Compra por hora"
            >
              <TrendingUp className="h-3 w-3" />
              <span>Spread</span>
            </button>
          </div>

          {/* Selector de Ventana Horaria (Todas las velas son estrictamente de 1H) */}
          <div
            className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs"
            title="Ventana de historial (cada vela = 1 hora exacta en -4:00 UTC)"
          >
            {(
              [
                { id: "24H", label: "24H" },
                { id: "72H", label: "3D" },
                { id: "7D", label: "7D" },
              ] as const
            ).map((tf) => (
              <button
                key={tf.id}
                type="button"
                onClick={() => setTimeframe(tf.id)}
                className={cn(
                  "rounded-md px-2 py-1 text-[10px] font-extrabold transition-all cursor-pointer",
                  timeframe === tf.id
                    ? "bg-slate-100 text-slate-900 font-black shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-800 cursor-pointer"
            title={isExpanded ? "Reducir Gráfica" : "Expandir Gráfica"}
          >
            {isExpanded ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Contenedor del Lienzo de TradingView */}
      <div className="relative w-full bg-white">
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-xs">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
              <span>Cargando velas horarias 24/7 (-4:00 UTC)...</span>
            </div>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full" />
      </div>

      {/* Pie de Gráfica: Horario fijo -4:00 UTC 24/7 */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/50 px-4 py-1.5 text-[10px] text-slate-500">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-emerald-500" />
          <span>
            {chartData?.benchmarkSource ??
              "Binance P2P C2C • Velas 1H (-4:00 UTC)"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {chartData?.currentHourVetLabel && (
            <span className="inline-flex items-center gap-1 font-semibold text-slate-600">
              <Clock className="h-3 w-3 text-emerald-600" />
              Vela activa: {chartData.currentHourVetLabel}
            </span>
          )}
          {isFetching && (
            <span className="flex items-center gap-1 font-semibold text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
              Sincronizando...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
