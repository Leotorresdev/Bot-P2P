"use client";

import * as React from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  LineType,
  TickMarkType,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import {
  Activity,
  Clock,
  Layers,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { useP2PChartDataQuery } from "@/features/p2p-ledger/api/use-p2p-queries";
import type { ChartTimeframe } from "@/features/p2p-ledger/schemas/p2p.schemas";
import { useThemeStore } from "@/features/p2p-ledger/store/use-theme-store";
import { formatDecimalWithCommas } from "@/lib/format-currency";
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

interface HoverReadout {
  readonly timeLabel: string;
  readonly sell?: number;
  readonly buy?: number;
  readonly open?: number;
  readonly high?: number;
  readonly low?: number;
  readonly close?: number;
  readonly trend?: number;
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

const TREND_SMA_PERIOD = 6; // 6 bloques de 5 min = Media móvil suave de 30 minutos

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
  return `${parts.ddMm} ${parts.hhMm} VET`;
}

function formatRateVes(value: number): string {
  return `${formatDecimalWithCommas(value.toFixed(2), 2)} Bs.`;
}

function formatAxisRate(value: number): string {
  return formatDecimalWithCommas(value.toFixed(2), 2);
}

function computeSmaSeries(
  points: ReadonlyArray<{ readonly time: Time; readonly value: number }>,
  period: number
): Array<{ readonly time: Time; readonly value: number }> {
  if (points.length === 0) return [];
  const result: Array<{ readonly time: Time; readonly value: number }> = [];
  let rollingSum = 0;

  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    if (!current) continue;
    rollingSum += current.value;
    if (i >= period) {
      const exiting = points[i - period];
      if (exiting) {
        rollingSum -= exiting.value;
      }
    }
    const windowSize = Math.min(i + 1, period);
    result.push({
      time: current.time,
      value: Number((rollingSum / windowSize).toFixed(2)),
    });
  }

  return result;
}

export function TradingViewP2PChart({
  selectedBank,
  height = 300,
}: TradingViewP2PChartProps) {
  const theme = useThemeStore((state) => state.theme);
  const isDark = theme === "dark";

  const [timeframe, setTimeframe] = React.useState<ChartTimeframe>("24H");
  // Por defecto: Curva suave Compra/Venta cada 5m (fácil de interpretar, sin picos agresivos)
  const [chartMode, setChartMode] = React.useState<"SPREAD" | "CANDLES">(
    "SPREAD"
  );
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [hoverReadout, setHoverReadout] = React.useState<HoverReadout | null>(
    null
  );

  const chartContainerRef = React.useRef<HTMLDivElement>(null);
  const chartInstanceRef = React.useRef<IChartApi | null>(null);
  const sellSeriesRef = React.useRef<ISeriesApi<"Area"> | null>(null);
  const buySeriesRef = React.useRef<ISeriesApi<"Area"> | null>(null);
  const candleSeriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);
  const trendSeriesRef = React.useRef<ISeriesApi<"Line"> | null>(null);
  const fittedContextRef = React.useRef<string | null>(null);

  const effectiveBank = selectedBank || "Banesco";
  const { data: chartData, isLoading, isFetching } = useP2PChartDataQuery(
    effectiveBank,
    timeframe
  );

  const rangeStats = React.useMemo(() => {
    const sells = chartData?.sellPoints ?? [];
    const buys = chartData?.buyPoints ?? [];
    if (sells.length === 0) {
      return null;
    }

    let minSell = Number.POSITIVE_INFINITY;
    let maxSell = Number.NEGATIVE_INFINITY;
    let sumSpread = 0;
    let spreadCount = 0;

    for (let i = 0; i < sells.length; i++) {
      const s = sells[i]?.value;
      if (typeof s !== "number") continue;
      if (s < minSell) minSell = s;
      if (s > maxSell) maxSell = s;

      const b = buys[i]?.value;
      if (typeof b === "number") {
        sumSpread += s - b;
        spreadCount += 1;
      }
    }

    const firstSell = sells[0]?.value ?? 0;
    const lastSell = sells[sells.length - 1]?.value ?? firstSell;
    const deltaBs = lastSell - firstSell;
    const deltaPct = firstSell > 0 ? (deltaBs / firstSell) * 100 : 0;
    const avgSpreadBs = spreadCount > 0 ? sumSpread / spreadCount : 0;

    return {
      minSell: Number.isFinite(minSell) ? minSell : 0,
      maxSell: Number.isFinite(maxSell) ? maxSell : 0,
      avgSpreadBs,
      deltaBs,
      deltaPct,
    };
  }, [chartData]);

  // Inicialización del lienzo TradingView Canvas con estética limpia y lectura clara
  React.useEffect(() => {
    if (!chartContainerRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
      sellSeriesRef.current = null;
      buySeriesRef.current = null;
      candleSeriesRef.current = null;
      trendSeriesRef.current = null;
    }

    fittedContextRef.current = null;

    const container = chartContainerRef.current;
    const canvasHeight = isExpanded ? 460 : height;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: canvasHeight,
      layout: {
        background: {
          type: ColorType.Solid,
          color: isDark ? "#131722" : "#ffffff",
        },
        textColor: isDark ? "#848E9C" : "#64748b",
        fontFamily:
          "var(--font-mono), JetBrains Mono, Inter, -apple-system, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: {
          color: isDark ? "rgba(255, 255, 255, 0.025)" : "rgba(15, 23, 42, 0.03)",
          style: LineStyle.Solid,
        },
        horzLines: {
          color: isDark ? "rgba(255, 255, 255, 0.045)" : "rgba(15, 23, 42, 0.055)",
          style: LineStyle.Solid,
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isDark ? "rgba(252, 213, 53, 0.55)" : "rgba(5, 150, 105, 0.5)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? "#2B3139" : "#0f172a",
        },
        horzLine: {
          color: isDark ? "rgba(252, 213, 53, 0.55)" : "rgba(5, 150, 105, 0.5)",
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: isDark ? "#2B3139" : "#0f172a",
        },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: {
          top: 0.18,
          bottom: 0.12,
        },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: chartMode === "CANDLES" ? 11 : 8,
        minBarSpacing: chartMode === "CANDLES" ? 4.5 : 2,
        fixLeftEdge: true,
        tickMarkFormatter: (time: Time, tickMarkType: TickMarkType) =>
          formatShiftedTickMark(timeToDate(time), tickMarkType),
      },
      localization: {
        priceFormatter: (p: number) => `${formatAxisRate(p)} Bs.`,
        timeFormatter: (time: Time) =>
          formatShiftedCrosshairTime(timeToDate(time)),
      },
    });

    chartInstanceRef.current = chart;

    if (chartMode === "SPREAD") {
      const sellSeries = chart.addSeries(AreaSeries, {
        lineColor: isDark ? "#0ECB81" : "#059669",
        topColor: isDark
          ? "rgba(14, 203, 129, 0.22)"
          : "rgba(5, 150, 105, 0.18)",
        bottomColor: isDark
          ? "rgba(14, 203, 129, 0.00)"
          : "rgba(5, 150, 105, 0.00)",
        lineWidth: 2,
        lineType: LineType.Curved,
        crosshairMarkerRadius: 5,
        crosshairMarkerBorderColor: isDark ? "#131722" : "#ffffff",
        crosshairMarkerBackgroundColor: isDark ? "#0ECB81" : "#059669",
        lastValueVisible: true,
        priceLineVisible: true,
        priceLineColor: isDark
          ? "rgba(14, 203, 129, 0.45)"
          : "rgba(5, 150, 105, 0.45)",
        priceLineStyle: LineStyle.Dotted,
        priceFormat: {
          type: "custom",
          formatter: (price: number) => formatAxisRate(price),
        },
      });

      const buySeries = chart.addSeries(AreaSeries, {
        lineColor: isDark ? "#F6465D" : "#e11d48",
        topColor: isDark
          ? "rgba(246, 70, 93, 0.11)"
          : "rgba(225, 29, 72, 0.09)",
        bottomColor: isDark
          ? "rgba(246, 70, 93, 0.00)"
          : "rgba(225, 29, 72, 0.00)",
        lineWidth: 2,
        lineType: LineType.Curved,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: isDark ? "#131722" : "#ffffff",
        crosshairMarkerBackgroundColor: isDark ? "#F6465D" : "#e11d48",
        lastValueVisible: true,
        priceLineVisible: false,
        priceFormat: {
          type: "custom",
          formatter: (price: number) => formatAxisRate(price),
        },
      });

      const trendSeries = chart.addSeries(LineSeries, {
        color: isDark ? "rgba(252, 213, 53, 0.72)" : "rgba(217, 119, 6, 0.72)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        lineType: LineType.Curved,
        crosshairMarkerVisible: false,
        lastValueVisible: false,
        priceLineVisible: false,
      });

      sellSeriesRef.current = sellSeries;
      buySeriesRef.current = buySeries;
      trendSeriesRef.current = trendSeries;
    } else {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: isDark ? "#0ECB81" : "#059669",
        downColor: isDark ? "#F6465D" : "#e11d48",
        borderVisible: false,
        wickUpColor: isDark
          ? "rgba(14, 203, 129, 0.72)"
          : "rgba(5, 150, 105, 0.72)",
        wickDownColor: isDark
          ? "rgba(246, 70, 93, 0.72)"
          : "rgba(225, 29, 72, 0.72)",
        priceFormat: {
          type: "custom",
          formatter: (price: number) => formatAxisRate(price),
        },
      });

      const trendSeries = chart.addSeries(LineSeries, {
        color: isDark ? "#FCD535" : "#d97706",
        lineWidth: 2,
        lineType: LineType.Curved,
        crosshairMarkerRadius: 3,
        lastValueVisible: false,
        priceLineVisible: false,
      });

      candleSeriesRef.current = candleSeries;
      trendSeriesRef.current = trendSeries;
    }

    const handleCrosshairMove = (param: MouseEventParams<Time>) => {
      if (!param.time || !param.point) {
        setHoverReadout(null);
        return;
      }

      const timeLabel = formatShiftedCrosshairTime(timeToDate(param.time));
      const trendData = trendSeriesRef.current
        ? param.seriesData.get(trendSeriesRef.current)
        : undefined;
      const trendVal =
        trendData && "value" in trendData && typeof trendData.value === "number"
          ? trendData.value
          : undefined;

      if (chartMode === "SPREAD") {
        const sellData = sellSeriesRef.current
          ? param.seriesData.get(sellSeriesRef.current)
          : undefined;
        const buyData = buySeriesRef.current
          ? param.seriesData.get(buySeriesRef.current)
          : undefined;

        const sellVal =
          sellData && "value" in sellData && typeof sellData.value === "number"
            ? sellData.value
            : undefined;
        const buyVal =
          buyData && "value" in buyData && typeof buyData.value === "number"
            ? buyData.value
            : undefined;

        if (sellVal === undefined && buyVal === undefined) {
          setHoverReadout(null);
          return;
        }

        setHoverReadout({
          timeLabel,
          sell: sellVal,
          buy: buyVal,
          trend: trendVal,
        });
      } else {
        const candleData = candleSeriesRef.current
          ? param.seriesData.get(candleSeriesRef.current)
          : undefined;

        if (
          !candleData ||
          !("open" in candleData) ||
          typeof candleData.open !== "number" ||
          !("high" in candleData) ||
          typeof candleData.high !== "number" ||
          !("low" in candleData) ||
          typeof candleData.low !== "number" ||
          !("close" in candleData) ||
          typeof candleData.close !== "number"
        ) {
          setHoverReadout(null);
          return;
        }

        setHoverReadout({
          timeLabel,
          open: candleData.open,
          high: candleData.high,
          low: candleData.low,
          close: candleData.close,
          trend: trendVal,
        });
      }
    };

    chart.subscribeCrosshairMove(handleCrosshairMove);

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
      chart.unsubscribeCrosshairMove(handleCrosshairMove);
      resizeObserver.disconnect();
      if (chartInstanceRef.current) {
        chartInstanceRef.current.remove();
        chartInstanceRef.current = null;
      }
    };
  }, [chartMode, height, isExpanded, isDark]);

  const applySmartViewport = React.useCallback(
    (pointCount: number, mode: "SPREAD" | "CANDLES", fitAll: boolean) => {
      const chart = chartInstanceRef.current;
      if (!chart || pointCount <= 0) return;

      if (fitAll || mode === "SPREAD") {
        // En Curva 5m, si es 24H (288 velas), mostrar las últimas ~12h por defecto para legibilidad
        if (!fitAll && pointCount > 150) {
          chart.timeScale().setVisibleLogicalRange({
            from: pointCount - 144,
            to: pointCount + 3,
          });
        } else {
          chart.timeScale().fitContent();
        }
        return;
      }

      // En Velas 5m, evitar comprimir cientos de velas en picos ilegibles: mostrar ~36 velas recientes (3h)
      if (pointCount > 40) {
        chart.timeScale().setVisibleLogicalRange({
          from: pointCount - 36,
          to: pointCount + 2,
        });
      } else {
        chart.timeScale().fitContent();
      }
    },
    []
  );

  // Inyección y actualización en vivo cada 5m (preservando zoom/pan del usuario)
  React.useEffect(() => {
    if (!chartData) return;

    const contextKey = `${effectiveBank}::${timeframe}::${chartMode}`;
    const isNewContext = fittedContextRef.current !== contextKey;

    if (chartMode === "SPREAD") {
      const mappedSell = chartData.sellPoints.map((pt) => ({
        time: toChartUtcMinus4Time(pt.time),
        value: pt.value,
      }));
      const mappedBuy = chartData.buyPoints.map((pt) => ({
        time: toChartUtcMinus4Time(pt.time),
        value: pt.value,
      }));

      if (sellSeriesRef.current && mappedSell.length > 0) {
        sellSeriesRef.current.setData(mappedSell);
      }
      if (buySeriesRef.current && mappedBuy.length > 0) {
        buySeriesRef.current.setData(mappedBuy);
      }
      if (trendSeriesRef.current && mappedSell.length > 0) {
        const midPoints = mappedSell.map((sPt, idx) => {
          const bVal = mappedBuy[idx]?.value ?? sPt.value;
          return {
            time: sPt.time,
            value: Number(((sPt.value + bVal) / 2).toFixed(2)),
          };
        });
        trendSeriesRef.current.setData(
          computeSmaSeries(midPoints, TREND_SMA_PERIOD)
        );
      }

      if (isNewContext && mappedSell.length > 0) {
        applySmartViewport(mappedSell.length, "SPREAD", false);
        fittedContextRef.current = contextKey;
      }
    } else {
      const mappedCandles = chartData.candles.map((cd) => ({
        time: toChartUtcMinus4Time(cd.time),
        open: cd.open,
        high: cd.high,
        low: cd.low,
        close: cd.close,
      }));

      if (candleSeriesRef.current && mappedCandles.length > 0) {
        candleSeriesRef.current.setData(mappedCandles);
      }
      if (trendSeriesRef.current && mappedCandles.length > 0) {
        const closePoints = mappedCandles.map((cd) => ({
          time: cd.time,
          value: cd.close,
        }));
        trendSeriesRef.current.setData(
          computeSmaSeries(closePoints, TREND_SMA_PERIOD)
        );
      }

      if (isNewContext && mappedCandles.length > 0) {
        applySmartViewport(mappedCandles.length, "CANDLES", false);
        fittedContextRef.current = contextKey;
      }
    }
  }, [chartData, chartMode, effectiveBank, timeframe, applySmartViewport]);

  const currentSell = chartData?.currentSellRate ?? 1075.0;
  const currentBuy = chartData?.currentBuyRate ?? 1070.0;
  const currentSpread = chartData?.currentSpreadPct ?? 0.47;
  const brechaPoints = (currentSell - currentBuy).toFixed(2);
  const deltaPositive = (rangeStats?.deltaBs ?? 0) >= 0;

  const latestCandle = chartData?.candles[chartData.candles.length - 1];
  const hudCandlePositive =
    hoverReadout?.open !== undefined && hoverReadout?.close !== undefined
      ? hoverReadout.close >= hoverReadout.open
      : latestCandle
        ? latestCandle.close >= latestCandle.open
        : true;

  const timeframeLabel =
    timeframe === "24H" ? "6H" : timeframe === "72H" ? "12H" : "24H";

  return (
    <div className="flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs transition-colors dark:border-[#2B3139] dark:bg-[#181A20]">
      {/* Barra Superior de Cotización y Controles */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 bg-slate-50/75 px-4 py-3 dark:border-[#2B3139] dark:bg-[#1E2329] sm:px-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 animate-pulse rounded-full bg-emerald-500 dark:bg-[#0ECB81]" />
            <span className="font-display text-sm font-extrabold tracking-tight text-slate-900 dark:text-[#EAECEF]">
              {effectiveBank}
            </span>
            <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-extrabold text-slate-700 dark:border-[#2B3139] dark:bg-[#181A20] dark:text-[#FCD535]">
              5 min · VET
            </span>
          </div>

          {rangeStats && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums",
                deltaPositive
                  ? "bg-emerald-50 text-emerald-700 dark:bg-[#0ECB81]/15 dark:text-[#0ECB81]"
                  : "bg-rose-50 text-rose-700 dark:bg-[#F6465D]/15 dark:text-[#F6465D]"
              )}
              title={`Variación de tasa en ${timeframeLabel}`}
            >
              {deltaPositive ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              <span>
                {deltaPositive ? "+" : ""}
                {rangeStats.deltaPct.toFixed(2)}% ({timeframeLabel})
              </span>
            </span>
          )}
        </div>

        {/* Selector de Tipo de Gráfica + Ventana Horaria + Ajustar + Expandir */}
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs dark:border-[#2B3139] dark:bg-[#0B0E11]">
            <button
              type="button"
              onClick={() => setChartMode("SPREAD")}
              className={cn(
                "flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition-all",
                chartMode === "SPREAD"
                  ? "bg-slate-900 text-white shadow-xs dark:bg-[#FCD535] dark:text-[#0B0E11]"
                  : "text-slate-600 hover:text-slate-900 dark:text-[#848E9C] dark:hover:text-[#EAECEF]"
              )}
              title="Vista suave Compra vs Venta cada 5 minutos (recomendada)"
            >
              <Activity className="h-3 w-3" />
              <span>Curva 5m</span>
            </button>
            <button
              type="button"
              onClick={() => setChartMode("CANDLES")}
              className={cn(
                "flex cursor-pointer items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-bold transition-all",
                chartMode === "CANDLES"
                  ? "bg-slate-900 text-white shadow-xs dark:bg-[#FCD535] dark:text-[#0B0E11]"
                  : "text-slate-600 hover:text-slate-900 dark:text-[#848E9C] dark:hover:text-[#EAECEF]"
              )}
              title="Ver Velas Japonesas cada 5 minutos con Media Móvil de 30m"
            >
              <Layers className="h-3 w-3" />
              <span>Velas 5m</span>
            </button>
          </div>

          <div
            className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs dark:border-[#2B3139] dark:bg-[#0B0E11]"
            title="Ventana de historial en bloques de 5 minutos"
          >
            {(
              [
                { id: "24H", label: "6H" },
                { id: "72H", label: "12H" },
                { id: "7D", label: "24H" },
              ] as const
            ).map((tf) => (
              <button
                key={tf.id}
                type="button"
                onClick={() => setTimeframe(tf.id)}
                className={cn(
                  "cursor-pointer rounded-md px-2 py-1 text-[10px] font-extrabold transition-all",
                  timeframe === tf.id
                    ? "bg-slate-100 text-slate-900 shadow-2xs dark:bg-[#1E2329] dark:text-[#FCD535]"
                    : "text-slate-500 hover:text-slate-800 dark:text-[#848E9C] dark:hover:text-[#EAECEF]"
                )}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => chartInstanceRef.current?.timeScale().fitContent()}
            className="flex h-7 cursor-pointer items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-900 dark:border-[#2B3139] dark:bg-[#181A20] dark:text-[#848E9C] dark:hover:bg-[#2B3139] dark:hover:text-[#EAECEF]"
            title="Ver todo el rango de tiempo disponible"
          >
            <RotateCcw className="h-3 w-3" />
            <span className="hidden sm:inline">Todo</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-800 dark:border-[#2B3139] dark:bg-[#181A20] dark:text-[#848E9C] dark:hover:bg-[#2B3139] dark:hover:text-[#EAECEF]"
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

      {/* Tira Compacta de Precio en Vivo: Venta (Verde) / Compra (Rojo) / Brecha */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-white px-4 py-2 text-xs dark:border-[#2B3139] dark:bg-[#181A20] sm:px-5">
        <div className="flex flex-wrap items-center gap-2 font-bold tabular-nums">
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-1 text-emerald-700 dark:border-[#0ECB81]/30 dark:bg-[#0ECB81]/10 dark:text-[#0ECB81]">
            <span className="h-2 w-2 rounded-full bg-emerald-500 dark:bg-[#0ECB81]" />
            <span className="text-[10px] font-extrabold uppercase">Venta</span>
            <span className="font-mono text-xs">{formatRateVes(currentSell)}</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-rose-200/80 bg-rose-50/80 px-2.5 py-1 text-rose-700 dark:border-[#F6465D]/30 dark:bg-[#F6465D]/10 dark:text-[#F6465D]">
            <span className="h-2 w-2 rounded-full bg-rose-500 dark:bg-[#F6465D]" />
            <span className="text-[10px] font-extrabold uppercase">Compra</span>
            <span className="font-mono text-xs">{formatRateVes(currentBuy)}</span>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-amber-200/70 bg-amber-50/70 px-2.5 py-1 text-amber-800 dark:border-[#FCD535]/25 dark:bg-[#FCD535]/10 dark:text-[#FCD535]">
            <span className="text-[10px] font-bold uppercase opacity-80">
              Brecha
            </span>
            <span className="font-mono text-xs">
              +{brechaPoints} Bs. ({currentSpread}%)
            </span>
          </div>
        </div>

        {/* Leyenda rápida de la línea guía */}
        <div className="hidden items-center gap-2 text-[10px] font-semibold text-slate-500 dark:text-[#848E9C] xl:flex">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full bg-amber-500 dark:bg-[#FCD535]" />
            <span>Media suave 30m</span>
          </span>
        </div>
      </div>

      {/* Lienzo TradingView con HUD Interactivo */}
      <div className="relative w-full bg-white dark:bg-[#131722]">
        {/* Overlay HUD: Lectura limpia al pasar el cursor (o último corte 5m) */}
        <div className="pointer-events-none absolute left-3 top-2.5 z-10 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200/80 bg-white/85 px-3 py-1.5 text-[11px] backdrop-blur-md dark:border-[#2B3139]/90 dark:bg-[#181A20]/85">
          {chartMode === "SPREAD" ? (
            <>
              <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-[#848E9C]">
                {hoverReadout?.timeLabel ??
                  (chartData?.currentHourVetLabel
                    ? `Ahora · ${chartData.currentHourVetLabel}`
                    : "En vivo · 5m")}
              </span>
              <span className="font-mono font-bold tabular-nums text-emerald-700 dark:text-[#0ECB81]">
                V:{" "}
                {formatAxisRate(hoverReadout?.sell ?? currentSell)} Bs
              </span>
              <span className="font-mono font-bold tabular-nums text-rose-700 dark:text-[#F6465D]">
                C:{" "}
                {formatAxisRate(hoverReadout?.buy ?? currentBuy)} Bs
              </span>
              {hoverReadout?.sell !== undefined &&
                hoverReadout?.buy !== undefined && (
                  <span className="font-mono font-bold tabular-nums text-amber-700 dark:text-[#FCD535]">
                    Δ {(hoverReadout.sell - hoverReadout.buy).toFixed(2)} Bs
                  </span>
                )}
            </>
          ) : (
            <>
              <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-[#848E9C]">
                {hoverReadout?.timeLabel ??
                  (chartData?.currentHourVetLabel
                    ? `Vela 5m · ${chartData.currentHourVetLabel}`
                    : "Vela 5m")}
              </span>
              <span className="font-mono tabular-nums text-slate-600 dark:text-[#848E9C]">
                A:{" "}
                <strong
                  className={
                    hudCandlePositive
                      ? "text-emerald-700 dark:text-[#0ECB81]"
                      : "text-rose-700 dark:text-[#F6465D]"
                  }
                >
                  {formatAxisRate(
                    hoverReadout?.open ?? latestCandle?.open ?? currentSell
                  )}
                </strong>
              </span>
              <span className="font-mono tabular-nums text-slate-600 dark:text-[#848E9C]">
                Máx:{" "}
                <strong
                  className={
                    hudCandlePositive
                      ? "text-emerald-700 dark:text-[#0ECB81]"
                      : "text-rose-700 dark:text-[#F6465D]"
                  }
                >
                  {formatAxisRate(
                    hoverReadout?.high ?? latestCandle?.high ?? currentSell
                  )}
                </strong>
              </span>
              <span className="font-mono tabular-nums text-slate-600 dark:text-[#848E9C]">
                Mín:{" "}
                <strong
                  className={
                    hudCandlePositive
                      ? "text-emerald-700 dark:text-[#0ECB81]"
                      : "text-rose-700 dark:text-[#F6465D]"
                  }
                >
                  {formatAxisRate(
                    hoverReadout?.low ?? latestCandle?.low ?? currentSell
                  )}
                </strong>
              </span>
              <span className="font-mono tabular-nums text-slate-600 dark:text-[#848E9C]">
                C:{" "}
                <strong
                  className={
                    hudCandlePositive
                      ? "text-emerald-700 dark:text-[#0ECB81]"
                      : "text-rose-700 dark:text-[#F6465D]"
                  }
                >
                  {formatAxisRate(
                    hoverReadout?.close ?? latestCandle?.close ?? currentSell
                  )}
                </strong>
              </span>
            </>
          )}
        </div>

        {isLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 backdrop-blur-xs dark:bg-[#131722]/85">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-[#848E9C]">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent dark:border-[#FCD535] dark:border-t-transparent" />
              <span>Cargando gráfica cada 5 minutos (-4:00 UTC)...</span>
            </div>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full" />
      </div>

      {/* Tira de Resumen Estadístico del Rango (Mín, Máx, Brecha Promedio) */}
      {rangeStats && (
        <div className="grid grid-cols-3 divide-x divide-slate-100 border-t border-slate-100 bg-slate-50/60 px-3 py-2 text-center dark:divide-[#2B3139] dark:border-[#2B3139] dark:bg-[#181A20]">
          <div className="px-2">
            <span className="block text-[10px] font-semibold text-slate-500 dark:text-[#848E9C]">
              Mínimo {timeframeLabel}
            </span>
            <span className="font-mono text-xs font-extrabold tabular-nums text-slate-900 dark:text-[#EAECEF]">
              {formatRateVes(rangeStats.minSell)}
            </span>
          </div>
          <div className="px-2">
            <span className="block text-[10px] font-semibold text-slate-500 dark:text-[#848E9C]">
              Máximo {timeframeLabel}
            </span>
            <span className="font-mono text-xs font-extrabold tabular-nums text-slate-900 dark:text-[#EAECEF]">
              {formatRateVes(rangeStats.maxSell)}
            </span>
          </div>
          <div className="px-2">
            <span className="block text-[10px] font-semibold text-slate-500 dark:text-[#848E9C]">
              Brecha Prom. {timeframeLabel}
            </span>
            <span className="font-mono text-xs font-extrabold tabular-nums text-amber-700 dark:text-[#FCD535]">
              +{rangeStats.avgSpreadBs.toFixed(2)} Bs.
            </span>
          </div>
        </div>
      )}

      {/* Pie de Gráfica */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-2 text-[10px] text-slate-500 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#848E9C]">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-emerald-500 dark:text-[#FCD535]" />
          <span>
            {chartData?.benchmarkSource ??
              "Binance P2P C2C • Intervalos de 5 min (-4:00 UTC)"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {chartData?.currentHourVetLabel && (
            <span className="inline-flex items-center gap-1 font-semibold text-slate-600 dark:text-[#EAECEF]">
              <Clock className="h-3 w-3 text-emerald-600 dark:text-[#0ECB81]" />
              Corte 5m: {chartData.currentHourVetLabel}
            </span>
          )}
          {isFetching && (
            <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-[#FCD535]">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-emerald-500 dark:bg-[#FCD535]" />
              Sincronizando...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
