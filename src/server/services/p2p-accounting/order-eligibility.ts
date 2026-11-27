import type {
  OrderStatusCategory,
  P2POrderRowDto,
} from "@/features/p2p-ledger/schemas/p2p.schemas";

export interface OrderEligibilityResult {
  readonly included: boolean;
  readonly normalizedAsset: string;
  readonly normalizedFiat: string;
  readonly verifiedStatusCategory: OrderStatusCategory;
  readonly reasonLabel: string;
}

/**
 * Normaliza cualquier código o enum de estado proveniente de Binance C2C
 * sin omitir órdenes canceladas, apeladas o en curso.
 */
export function mapBinanceOrderStatus(rawStatus: string | number | undefined): {
  readonly orderStatus: string;
  readonly statusCategory: OrderStatusCategory;
  readonly statusLabel: string;
} {
  const rawStr = String(rawStatus ?? "COMPLETED").trim().toUpperCase();

  if (rawStr === "COMPLETED" || rawStr === "4") {
    return {
      orderStatus: rawStr === "4" ? "COMPLETED" : rawStr,
      statusCategory: "COMPLETED",
      statusLabel: "Completada",
    };
  }

  if (
    rawStr === "CANCELLED" ||
    rawStr === "CANCELLED_BY_SYSTEM" ||
    rawStr === "EXPIRED" ||
    rawStr.includes("CANCEL") ||
    rawStr.includes("EXPIRE") ||
    rawStr === "6" ||
    rawStr === "7" ||
    rawStr === "8"
  ) {
    const normalizedName =
      rawStr === "6"
        ? "CANCELLED"
        : rawStr === "7"
          ? "CANCELLED_BY_SYSTEM"
          : rawStr === "8"
            ? "EXPIRED"
            : rawStr;
    return {
      orderStatus: normalizedName,
      statusCategory: "CANCELLED",
      statusLabel: "Cancelada",
    };
  }

  if (rawStr === "IN_APPEAL" || rawStr.includes("APPEAL") || rawStr === "5") {
    return {
      orderStatus: rawStr === "5" ? "IN_APPEAL" : rawStr,
      statusCategory: "IN_APPEAL",
      statusLabel: "Apelada",
    };
  }

  const normalizedProgress =
    rawStr === "0"
      ? "PENDING"
      : rawStr === "1"
        ? "TRADING"
        : rawStr === "2"
          ? "BUYER_PAYED"
          : rawStr === "3"
            ? "DISTRIBUTING"
            : rawStr;

  return {
    orderStatus: normalizedProgress,
    statusCategory: "IN_PROGRESS",
    statusLabel: "En curso",
  };
}

/**
 * Fuente única de verdad para decidir si una orden entra en el cálculo de
 * volúmenes y ganancias P2P Venezuela:
 * - Estado estrictamente COMPLETED (doble validación statusCategory + orderStatus)
 * - Fiat estrictamente VES
 * - Criptoactivo estrictamente USDT (descarta BTC, ETH, BNB, USDC, FDUSD, etc.)
 */
export function evaluateOrderCalculationEligibility(
  order: Pick<
    P2POrderRowDto,
    "orderStatus" | "statusCategory" | "asset" | "fiat"
  >
): OrderEligibilityResult {
  const normalizedAsset = (order.asset || "USDT").trim().toUpperCase();
  const normalizedFiat = (order.fiat || "VES").trim().toUpperCase();
  const verifiedStatusCategory = mapBinanceOrderStatus(
    order.orderStatus || order.statusCategory
  ).statusCategory;

  if (
    order.statusCategory !== "COMPLETED" ||
    verifiedStatusCategory !== "COMPLETED"
  ) {
    const reasonLabel =
      verifiedStatusCategory === "CANCELLED"
        ? "No (Cancelada / Expirada)"
        : verifiedStatusCategory === "IN_APPEAL"
          ? "No (En apelación)"
          : "No (En curso)";
    return {
      included: false,
      normalizedAsset,
      normalizedFiat,
      verifiedStatusCategory,
      reasonLabel,
    };
  }

  if (normalizedFiat !== "VES") {
    return {
      included: false,
      normalizedAsset,
      normalizedFiat,
      verifiedStatusCategory,
      reasonLabel: `No (Fiat ${normalizedFiat} ≠ VES)`,
    };
  }

  if (normalizedAsset !== "USDT") {
    return {
      included: false,
      normalizedAsset,
      normalizedFiat,
      verifiedStatusCategory,
      reasonLabel: `No (Activo ${normalizedAsset} ≠ USDT)`,
    };
  }

  return {
    included: true,
    normalizedAsset,
    normalizedFiat,
    verifiedStatusCategory,
    reasonLabel: "Sí (USDT/VES Completada)",
  };
}

/**
 * Deduplica un listado de órdenes por `orderNumber` conservando la primera ocurrencia
 * (en orden cronológico descendente o según prioridad del llamador) para evitar doble conteo.
 */
export function deduplicateOrdersByNumber<
  T extends { readonly orderNumber: string },
>(orders: readonly T[]): T[] {
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const order of orders) {
    const key = String(order.orderNumber ?? "").trim();
    if (!key) {
      unique.push(order);
      continue;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(order);
  }
  return unique;
}

/**
 * Une listados de órdenes de múltiples cierres sin duplicar `orderNumber`
 * y respetando estrictamente el orden cronológico de Binance (`createTimeMs DESC`).
 */
export function mergeChronologicalOrders(
  orderLists: ReadonlyArray<readonly P2POrderRowDto[]>
): P2POrderRowDto[] {
  const map = new Map<string, P2POrderRowDto>();
  for (const list of orderLists) {
    for (const order of list) {
      if (!map.has(order.orderNumber)) {
        map.set(order.orderNumber, order);
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (b.createTimeMs !== a.createTimeMs) {
      return b.createTimeMs - a.createTimeMs;
    }
    return b.orderNumber.localeCompare(a.orderNumber);
  });
}

export function countExcludedCompletedOrders(
  orders: readonly P2POrderRowDto[]
): {
  readonly excludedNonUsdtCount: number;
  readonly excludedNonVesCount: number;
} {
  let excludedNonUsdtCount = 0;
  let excludedNonVesCount = 0;
  const uniqueOrders = deduplicateOrdersByNumber(orders);
  for (const order of uniqueOrders) {
    const eligibility = evaluateOrderCalculationEligibility(order);
    if (eligibility.verifiedStatusCategory !== "COMPLETED") continue;
    if (eligibility.normalizedFiat !== "VES") {
      excludedNonVesCount += 1;
    } else if (eligibility.normalizedAsset !== "USDT") {
      excludedNonUsdtCount += 1;
    }
  }
  return { excludedNonUsdtCount, excludedNonVesCount };
}
