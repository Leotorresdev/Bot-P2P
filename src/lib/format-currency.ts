import Decimal from "decimal.js";
import type { OrderStatusCategory } from "@/features/p2p-ledger/schemas/p2p.schemas";

function insertThousandsCommas(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
    const d = new Decimal(rawValue ?? "0");
    const fixed = d.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP).toFixed(decimals);
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

export function getTradeTypeBadgeStyle(tradeType: "BUY" | "SELL"): {
  readonly label: "COMPRA" | "VENTA";
  readonly badgeClass: string;
  readonly textClass: string;
} {
  if (tradeType === "BUY") {
    return {
      label: "COMPRA",
      badgeClass:
        "border-emerald-200 bg-emerald-50 text-emerald-700",
      textClass: "text-emerald-700",
    };
  }
  return {
    label: "VENTA",
    badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
    textClass: "text-rose-700",
  };
}

export function getStatusCategoryBadgeStyle(category: OrderStatusCategory): {
  readonly badgeClass: string;
  readonly dotClass: string;
} {
  switch (category) {
    case "COMPLETED":
      return {
        badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
        dotClass: "bg-emerald-500",
      };
    case "CANCELLED":
      return {
        badgeClass: "border-slate-200 bg-slate-100 text-slate-600",
        dotClass: "bg-slate-400",
      };
    case "IN_APPEAL":
      return {
        badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
        dotClass: "bg-amber-500",
      };
    case "IN_PROGRESS":
    default:
      return {
        badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
        dotClass: "bg-sky-500",
      };
  }
}
