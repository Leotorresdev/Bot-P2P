import Decimal from "decimal.js";
import type { OrderStatusCategory } from "@/features/p2p-ledger/schemas/p2p.schemas";

function insertThousandsCommas(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Normaliza cadenas numéricas posiblemente formateadas con separadores de miles (",")
 * antes de instanciar Decimal.js.
 */
export function sanitizeDecimalString(
  rawValue: string | number | undefined | null
): string {
  if (typeof rawValue === "number") {
    return Number.isFinite(rawValue) ? String(rawValue) : "0";
  }
  const cleaned = String(rawValue ?? "0")
    .trim()
    .replace(/,/g, "");
  return cleaned === "" ? "0" : cleaned;
}

export function isDecimalNonNegative(
  rawValue: string | number | undefined | null
): boolean {
  try {
    return new Decimal(sanitizeDecimalString(rawValue)).gte(0);
  } catch {
    return true;
  }
}

/**
 * Formatea un string numérico decimal con separadores de miles usando Decimal.js
 * sin recurrir a operaciones aritméticas nativas de punto flotante.
 */
export function formatDecimalWithCommas(
  rawValue: string | number | undefined | null,
  decimals: number = 2
): string {
  try {
    const d = new Decimal(sanitizeDecimalString(rawValue));
    const rounded = d.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
    const normalized = rounded.isZero() ? new Decimal(0) : rounded;
    const fixed = normalized.toFixed(decimals);
    const isNeg = fixed.startsWith("-");
    const unsigned = isNeg ? fixed.slice(1) : fixed;
    const parts = unsigned.split(".");
    const intFormatted = insertThousandsCommas(parts[0] ?? "0");
    const fracPart = parts[1];
    const joined = fracPart !== undefined ? `${intFormatted}.${fracPart}` : intFormatted;
    return isNeg ? `-${joined}` : joined;
  } catch {
    return decimals > 0 ? `0.${"0".repeat(decimals)}` : "0";
  }
}

export function formatVesAmount(
  rawValue: string | number | undefined | null,
  decimals: number = 2
): string {
  return `${formatDecimalWithCommas(rawValue, decimals)} Bs.`;
}

export function formatUsdtAmount(
  rawValue: string | number | undefined | null,
  decimals: number = 2
): string {
  return `${formatDecimalWithCommas(rawValue, decimals)} USDT`;
}

/**
 * Calcula el monto exacto en USDT tal como lo refleja la app móvil de Binance:
 * - COMPRA (BUY):  amount - commission ("Cantidad recibida")
 * - VENTA  (SELL): amount + commission ("Cantidad total")
 *
 * Conserva `order.amountUsdt` intacto como dato crudo de la API de Binance SAPI
 * para idempotencia con cierres históricos y trazabilidad auditable.
 */
export function getBinanceAppOrderUsdtDecimal(order: {
  readonly tradeType: "BUY" | "SELL";
  readonly amountUsdt: string | number | undefined | null;
  readonly commissionUsdt?: string | number | undefined | null;
}): Decimal {
  try {
    const amt = new Decimal(sanitizeDecimalString(order.amountUsdt));
    const comm = new Decimal(sanitizeDecimalString(order.commissionUsdt));
    if (order.tradeType === "BUY") {
      return Decimal.max(0, amt.minus(comm));
    }
    return amt.plus(comm);
  } catch {
    return new Decimal(0);
  }
}

export function formatBinanceAppOrderUsdt(
  order: {
    readonly tradeType: "BUY" | "SELL";
    readonly amountUsdt: string | number | undefined | null;
    readonly commissionUsdt?: string | number | undefined | null;
  },
  decimals: number = 2
): string {
  return formatUsdtAmount(
    getBinanceAppOrderUsdtDecimal(order).toFixed(),
    decimals
  );
}

export function getTradeTypeBadgeStyle(tradeType: "BUY" | "SELL"): {
  readonly label: "COMPRA" | "VENTA";
  readonly badgeClass: string;
  readonly textClass: string;
} {
  if (tradeType === "BUY") {
    return {
      label: "COMPRA",
      badgeClass:
        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-[#0ECB81]/30 dark:bg-[#0ECB81]/15 dark:text-[#0ECB81]",
      textClass: "text-emerald-700 dark:text-[#0ECB81]",
    };
  }
  return {
    label: "VENTA",
    badgeClass:
      "border-rose-200 bg-rose-50 text-rose-700 dark:border-[#F6465D]/30 dark:bg-[#F6465D]/15 dark:text-[#F6465D]",
    textClass: "text-rose-700 dark:text-[#F6465D]",
  };
}

export function getStatusCategoryBadgeStyle(category: OrderStatusCategory): {
  readonly badgeClass: string;
  readonly dotClass: string;
} {
  switch (category) {
    case "COMPLETED":
      return {
        badgeClass:
          "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-[#0ECB81]/30 dark:bg-[#0ECB81]/15 dark:text-[#0ECB81]",
        dotClass: "bg-emerald-500 dark:bg-[#0ECB81]",
      };
    case "CANCELLED":
      return {
        badgeClass:
          "border-slate-200 bg-slate-100 text-slate-600 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#848E9C]",
        dotClass: "bg-slate-400 dark:bg-[#848E9C]",
      };
    case "IN_APPEAL":
      return {
        badgeClass:
          "border-amber-200 bg-amber-50 text-amber-800 dark:border-[#FCD535]/35 dark:bg-[#FCD535]/15 dark:text-[#FCD535]",
        dotClass: "bg-amber-500 dark:bg-[#FCD535]",
      };
    case "IN_PROGRESS":
    default:
      return {
        badgeClass:
          "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/15 dark:text-sky-400",
        dotClass: "bg-sky-500 dark:bg-sky-400",
      };
  }
}
