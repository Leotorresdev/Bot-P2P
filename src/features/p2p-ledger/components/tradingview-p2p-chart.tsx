"use client";

import * as React from "react";
import {
  createChart,
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type Time,
} from "lightweight-charts";
import {
  TrendingUp,
  Activity,
  Maximize2,
  Minimize2,
  Clock,
  Layers,
  Sparkles,
  ArrowRightLeft,
} from "lucide-react";
import { useP2PChartDataQuery } from "@/features/p2p-ledger/api/use-p2p-queries";
import type { ChartTimeframe } from "@/features/p2p-ledger/schemas/p2p.schemas";
import { cn } from "@/lib/utils";

interface TradingViewP2PChartProps {
  readonly selectedBank: string;
  readonly onSelectBank?: (bank: string) => void;
  readonly height?: number;
  readonly compact?: boolean;
}

export function TradingViewP2PChart({
  selectedBank,
  onSelectBank,
  height = 300,
  compact = false,
}: TradingViewP2PChartProps) {
  const [timeframe, setTimeframe] = React.useState<ChartTimeframe>("24H");
  const [chartMode, setChartMode] = React.useState<"SPREAD" | "CANDLES">("SPREAD");
  const [isExpanded, setIsExpanded] = React.useState(false);

  const chartContainerRef = React.useRef<HTMLDivElement>(null);
  const chartInstanceRef = React.useRef<IChartApi | null>(null);
  const sellSeriesRef = React.useRef<ISeriesApi<"Area"> | null>(null);
  const buySeriesRef = React.useRef<ISeriesApi<"Area"> | null>(null);
  const candleSeriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);

  const effectiveBank = selectedBank || "Banesco";
  const { data: chartData, isLoading, isFetching } = useP2PChartDataQuery(
    effectiveBank,
    timeframe
  );

  // Inicialización y configuración del lienzo de TradingView Canvas
  React.useEffect(() => {
    if (!chartContainerRef.current) return;

    // Limpieza de instancia previa si existe
    if (chartInstanceRef.current) {
      chartInstanceRef.current.remove();
      chartInstanceRef.current = null;
      sellSeriesRef.current = null;
      buySeriesRef.current = null;
      candleSeriesRef.current = null;
    }

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
        secondsVisible: timeframe === "LIVE",
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      localization: {
        priceFormatter: (p: number) => `${p.toFixed(2)} Bs.`,
        dateFormat: "yyyy-MM-dd",
      },
    });

    chartInstanceRef.current = chart;

    if (chartMode === "SPREAD") {
      // Serie 1: Tasa de Venta (Tu Cobro — Anuncios donde el merchant vende USDT)
      const sellSeries = chart.addSeries(AreaSeries, {
        lineColor: "#059669", // Verde Esmeralda Fintech
        topColor: "rgba(5, 150, 105, 0.22)",
        bottomColor: "rgba(5, 150, 105, 0.00)",
        lineWidth: 2,
        priceFormat: {
          type: "custom",
          formatter: (price: number) => `${price.toFixed(2)} Bs.`,
        },
        title: "Venta (Cobro)",
      });

      // Serie 2: Tasa de Compra (Tu Pago — Anuncios donde el merchant compra USDT)
      const buySeries = chart.addSeries(AreaSeries, {
        lineColor: "#2563eb", // Azul Financiero
        topColor: "rgba(37, 99, 235, 0.15)",
        bottomColor: "rgba(37, 99, 235, 0.00)",
        lineWidth: 2,
        priceFormat: {
          type: "custom",
          formatter: (price: number) => `${price.toFixed(2)} Bs.`,
        },
        title: "Compra (Pago)",
      });

      sellSeriesRef.current = sellSeries;
      buySeriesRef.current = buySeries;
    } else {
      // Modo Velas Japonesas (Candlesticks OHLC)
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
        title: "USDT/VES",
      });

      candleSeriesRef.current = candleSeries;
    }

    // Manejo de Responsividad fluida (ResizeObserver)
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
  }, [chartMode, height, isExpanded, timeframe]);

  // Carga e inyección fluida de datos en la gráfica
  React.useEffect(() => {
    if (!chartData) return;

    if (chartMode === "SPREAD") {
      if (sellSeriesRef.current && chartData.sellPoints.length > 0) {
        const mappedSell = chartData.sellPoints.map((pt) => ({
          time: pt.time as Time,
          value: pt.value,
        }));
        sellSeriesRef.current.setData(mappedSell);
      }

      if (buySeriesRef.current && chartData.buyPoints.length > 0) {
        const mappedBuy = chartData.buyPoints.map((pt) => ({
          time: pt.time as Time,
          value: pt.value,
        }));
        buySeriesRef.current.setData(mappedBuy);
      }
    } else if (chartMode === "CANDLES") {
      if (candleSeriesRef.current && chartData.candles.length > 0) {
        const mappedCandles = chartData.candles.map((cd) => ({
          time: cd.time as Time,
          open: cd.open,
          high: cd.high,
          low: cd.low,
          close: cd.close,
        }));
        candleSeriesRef.current.setData(mappedCandles);
      }
    }

    // Auto-escalar la escala de tiempo
    if (chartInstanceRef.current) {
      chartInstanceRef.current.timeScale().fitContent();
    }
  }, [chartData, chartMode]);

  const currentSell = chartData?.currentSellRate ?? 1085.0;
  const currentBuy = chartData?.currentBuyRate ?? 1079.2;
  const currentSpread = chartData?.currentSpreadPct ?? 0.54;
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
            <span className="text-[11px] font-bold text-slate-400">USDT / VES</span>
          </div>

          <div className="h-4 w-px bg-slate-200 hidden sm:block" />

          {/* Ticker de Cotización en Vivo */}
          <div className="flex items-center gap-2.5 text-xs font-bold">
            <div className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-200/60">
              <span className="text-[10px] text-emerald-800/70 font-semibold uppercase">Venta:</span>
              <span>{currentSell.toFixed(2)} Bs.</span>
            </div>
            <div className="flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200/60">
              <span className="text-[10px] text-blue-800/70 font-semibold uppercase">Compra:</span>
              <span>{currentBuy.toFixed(2)} Bs.</span>
            </div>
            <div className="flex items-center gap-1 text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200/60">
              <span className="text-[10px] text-purple-800/70 font-semibold uppercase">Spread:</span>
              <span>+{currentSpread}% (+{brechaPoints} Bs.)</span>
            </div>
          </div>
        </div>

        {/* Lado Derecho: Selector de Modo + Temporalidad + Botón Expandir */}
        <div className="flex items-center gap-2">
          {/* Selector de Modo */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setChartMode("SPREAD")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-all",
                chartMode === "SPREAD"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
              title="Ver Spread de Compra vs Venta"
            >
              <TrendingUp className="h-3 w-3" />
              <span>Spread</span>
            </button>
            <button
              type="button"
              onClick={() => setChartMode("CANDLES")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-bold transition-all",
                chartMode === "CANDLES"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              )}
              title="Ver Velas Japonesas (OHLC)"
            >
              <Layers className="h-3 w-3" />
              <span>Velas</span>
            </button>
          </div>

          {/* Selector de Temporalidad */}
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-2xs">
            {(["LIVE", "1H", "24H"] as const).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={cn(
                  "rounded-md px-2 py-1 text-[10px] font-extrabold transition-all",
                  timeframe === tf
                    ? "bg-slate-100 text-slate-900 font-black shadow-2xs"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                {tf === "LIVE" ? "En Vivo" : tf}
              </button>
            ))}
          </div>

          {/* Botón Expandir/Contraer */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-800"
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
              <span>Sincronizando cotizaciones de Binance P2P...</span>
            </div>
          </div>
        )}
        <div ref={chartContainerRef} className="w-full" />
      </div>

      {/* Pie de Gráfica: Origen del Benchmark y Estado */}
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-4 py-1.5 text-[10px] text-slate-400">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-emerald-500" />
          <span>
            {chartData?.benchmarkSource ?? "Binance P2P C2C (Comerciantes Verificados)"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && (
            <span className="flex items-center gap-1 text-emerald-600 font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
              Actualizando tick...
            </span>
          )}
          <span>Motor: TradingView Lightweight Charts (Canvas 60fps)</span>
        </div>
      </div>
    </div>
  );
}
