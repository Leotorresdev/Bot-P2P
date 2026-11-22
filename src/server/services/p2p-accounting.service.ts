import "server-only";
import crypto from "node:crypto";
import Decimal from "decimal.js";
import {
  MERCHANT_BADGE_META,
  type ActiveShiftDto,
  type BankLiveMonitorDto,
  type DailyClosingActaDto,
  type DailyTotalClosureDto,
  type LotMethod,
  type MerchantBadgeConfigDto,
  type MerchantBadgeType,
  type OrderStatusCategory,
  type OrderStatusFilter,
  type P2POrderRowDto,
  type PeriodFilter,
  type PnlSummaryDto,
  type ShiftClosureDto,
  type ShiftDashboardStateDto,
  type ShiftDigestMetaDto,
  type TradeTypeFilter,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import {
  formatDateIsoVe,
  formatVetOrderTimestamp,
  getCurrentVetDateIso,
  getCurrentVetMonthIso,
  getVetDayRangeMs,
  getVetMonthRangeMs,
  getVetNDaysRangeMs,
} from "@/lib/timezone-utc4";
import {
  decryptBinanceCredentials,
  encryptBinanceCredentials,
  signBinanceQuery,
} from "@/server/security/crypto-vault";
import { BinanceP2PLiveService } from "@/server/services/binance-p2p-live.service";
import {
  SupabaseVaultRepository,
  type StoredP2POrderRecord,
} from "@/server/db/supabase-vault.repository";

// Configuración de alta precisión financiera (28 dígitos significativos, redondeo bancario)
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

const BINANCE_HOSTS = [
  "https://api-gcp.binance.com",
  "https://api4.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api.binance.com",
] as const;

const BINANCE_C2C_PAGE_SIZE = 50;

// Binance SAPI limita el intervalo startTimestamp..endTimestamp a 30 días (usamos 28d por seguridad)
const MAX_BINANCE_WINDOW_MS = 28 * 86_400_000;
// Binance conserva historial de órdenes C2C hasta 6 meses (~180 días)
const MAX_BINANCE_LOOKBACK_MS = 180 * 86_400_000;

interface BinanceC2COrderItem {
  orderNumber: string;
  advNo?: string;
  tradeType: "BUY" | "SELL";
  asset?: string;
  fiat?: string;
  amount: string;
  totalPrice?: string;
  unitPrice: string;
  orderStatus: string | number;
  createTime: number;
  commission?: string;
  counterPartNickName?: string;
  payMethodName?: string;
  advertisementRole?: "MAKER" | "TAKER";
}

export interface ClosingReportData {
  readonly scope: "DAY" | "MONTH" | "SHIFT";
  readonly periodKey: string;
  readonly periodLabel: string;
  readonly generatedAtVet: string;
  readonly summary: PnlSummaryDto;
  readonly orders: readonly P2POrderRowDto[];
  readonly dailyClosures?: readonly DailyTotalClosureDto[];
  readonly totalShiftsInPeriod?: number;
  readonly excludedNonUsdtCount?: number;
  readonly excludedNonVesCount?: number;
  readonly syncComplete?: boolean;
  readonly incompleteDays?: readonly string[];
  readonly syncWarning?: string;
}

export interface OrderEligibilityResult {
  readonly included: boolean;
  readonly normalizedAsset: string;
  readonly normalizedFiat: string;
  readonly verifiedStatusCategory: OrderStatusCategory;
  readonly reasonLabel: string;
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
    order.statusCategory === "CANCELLED" ||
    verifiedStatusCategory === "CANCELLED"
  ) {
    return {
      included: false,
      normalizedAsset,
      normalizedFiat,
      verifiedStatusCategory: "CANCELLED",
      reasonLabel: "NO (Cancelada)",
    };
  }

  if (
    order.statusCategory === "IN_APPEAL" ||
    verifiedStatusCategory === "IN_APPEAL"
  ) {
    return {
      included: false,
      normalizedAsset,
      normalizedFiat,
      verifiedStatusCategory: "IN_APPEAL",
      reasonLabel: "NO (Apelada)",
    };
  }

  if (
    order.statusCategory !== "COMPLETED" ||
    verifiedStatusCategory !== "COMPLETED"
  ) {
    return {
      included: false,
      normalizedAsset,
      normalizedFiat,
      verifiedStatusCategory: "IN_PROGRESS",
      reasonLabel: "NO (En curso)",
    };
  }

  if (normalizedFiat !== "VES") {
    return {
      included: false,
      normalizedAsset,
      normalizedFiat,
      verifiedStatusCategory: "COMPLETED",
      reasonLabel: `NO (Fiat ${normalizedFiat} ≠ VES)`,
    };
  }

  if (normalizedAsset !== "USDT") {
    return {
      included: false,
      normalizedAsset,
      normalizedFiat,
      verifiedStatusCategory: "COMPLETED",
      reasonLabel: `NO (Moneda ${normalizedAsset} ≠ USDT)`,
    };
  }

  return {
    included: true,
    normalizedAsset,
    normalizedFiat,
    verifiedStatusCategory: "COMPLETED",
    reasonLabel: "SÍ",
  };
}

/**
 * Formatea un Decimal a string legible con separadores de miles sin pasar por floats JS.
 */
export function formatDecimalMoney(
  val: Decimal,
  decimals: number = 2
): string {
  const fixed = val.toFixed(decimals);
  const isNegative = fixed.startsWith("-");
  const unsigned = isNegative ? fixed.slice(1) : fixed;
  const [intPart = "0", decPart] = unsigned.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const formatted = decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Parsea de forma segura una cadena numérica (incluso si trae separadores de miles ",")
 * retornando Decimal(0) ante entradas inválidas.
 */
export function parseSafeDecimal(
  raw: string | number | undefined | null
): Decimal {
  try {
    if (typeof raw === "number") {
      return Number.isFinite(raw) ? new Decimal(raw) : new Decimal(0);
    }
    const cleaned = String(raw ?? "0")
      .trim()
      .replace(/,/g, "");
    return new Decimal(cleaned === "" ? "0" : cleaned);
  } catch {
    return new Decimal(0);
  }
}

/**
 * Conserva la precisión exacta recibida de Binance asegurando al menos `minDecimals` decimales.
 */
export function formatExactDecimalString(
  raw: string | undefined,
  minDecimals: number = 2
): string {
  try {
    const dec = parseSafeDecimal(raw);
    const fullStr = dec.toFixed();
    const [intPart = "0", fracPart = ""] = fullStr.split(".");
    const trimmedFrac = fracPart.replace(/0+$/, "");
    const finalFrac =
      trimmedFrac.length >= minDecimals
        ? trimmedFrac
        : trimmedFrac.padEnd(minDecimals, "0");
    return `${intPart}.${finalFrac}`;
  } catch {
    return new Decimal(0).toFixed(minDecimals);
  }
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

function toMirrorOrderDto(rec: StoredP2POrderRecord): P2POrderRowDto {
  const tsInfo = formatVetOrderTimestamp(rec.createTimeMs);
  const statusInfo = mapBinanceOrderStatus(rec.orderStatus);

  const amountDec = parseSafeDecimal(rec.amountUsdt);
  const priceDec = parseSafeDecimal(rec.unitPriceVes);
  const parsedTotal = parseSafeDecimal(rec.totalPriceVes);
  const totalStr = parsedTotal.gt(0)
    ? parsedTotal.toFixed()
    : amountDec.mul(priceDec).toFixed(2);

  return {
    orderNumber: rec.orderNumber,
    advNo: rec.advNo || "---",
    createTimeMs: rec.createTimeMs,
    timeVetLabel: tsInfo.dateTimeLabel,
    dateLabelVet: tsInfo.dateLabel,
    timeLabelVet: tsInfo.timeLabel,
    dateIsoVet: tsInfo.dateIso,
    monthIsoVet: tsInfo.monthIso,
    tradeType: rec.tradeType,
    orderStatus: statusInfo.orderStatus,
    statusCategory: statusInfo.statusCategory,
    statusLabel: statusInfo.statusLabel,
    advertisementRole: rec.advertisementRole,
    asset: rec.asset || "USDT",
    fiat: rec.fiat || "VES",
    payMethodName: rec.payMethodName || "P2P",
    counterPartNickName: rec.counterPartNickName || "Cliente P2P",
    unitPriceVes: formatExactDecimalString(rec.unitPriceVes, 2),
    amountUsdt: formatExactDecimalString(rec.amountUsdt, 2),
    totalPriceVes: formatExactDecimalString(totalStr, 2),
    commissionUsdt: formatExactDecimalString(rec.commissionUsdt || "0", 4),
  };
}

function resolveSyncWindows(
  startMs: number,
  endMs: number
): Array<{ readonly startMs: number; readonly endMs: number }> {
  const oldestAllowedMs = Date.now() - MAX_BINANCE_LOOKBACK_MS;
  const clampedStart = Math.max(startMs, oldestAllowedMs);
  const clampedEnd = Math.min(endMs, Date.now() + 60_000);

  if (clampedEnd <= clampedStart) return [];

  const windows: Array<{ readonly startMs: number; readonly endMs: number }> = [];
  let cursor = clampedStart;
  while (cursor < clampedEnd) {
    const winEnd = Math.min(clampedEnd, cursor + MAX_BINANCE_WINDOW_MS - 1);
    windows.push({ startMs: cursor, endMs: winEnd });
    cursor = winEnd + 1;
  }
  return windows;
}

/**
 * Consulta `/sapi/v1/c2c/orderMatch/listUserOrderHistory` paginando de 50 en 50 (tope real de Binance C2C)
 * con reintento por página entre hosts, protección contra rate-limit (429/418) y presupuesto de tiempo
 * para evitar timeouts en cuentas de alto volumen (400-500+ órdenes/día).
 */
async function fetchBinanceOrdersInRange(
  apiKey: string,
  apiSecret: string,
  tradeType: "BUY" | "SELL",
  startMs: number,
  endMs: number,
  maxPagesPerWindow: number = 80,
  maxDurationMs: number = 22_000
): Promise<{
  readonly success: boolean;
  readonly data: readonly BinanceC2COrderItem[];
  readonly error?: string;
  readonly truncatedByBudget?: boolean;
}> {
  const windows = resolveSyncWindows(startMs, endMs);
  if (windows.length === 0) {
    return { success: true, data: [] };
  }

  const startedAtMs = Date.now();
  let lastError = "";
  let preferredHostIdx = 0;
  let truncatedByBudget = false;
  const accumulated: BinanceC2COrderItem[] = [];

  for (const win of windows) {
    if (Date.now() - startedAtMs >= maxDurationMs) {
      truncatedByBudget = true;
      break;
    }

    const windowOrders: BinanceC2COrderItem[] = [];
    let page = 1;

    while (page <= maxPagesPerWindow) {
      if (Date.now() - startedAtMs >= maxDurationMs) {
        truncatedByBudget = true;
        break;
      }

      let pageItems: BinanceC2COrderItem[] | null = null;
      let pageTotal: number | undefined;
      let fatalAuthError = false;
      let rateLimited = false;

      for (let attempt = 0; attempt < BINANCE_HOSTS.length; attempt++) {
        const hostIdx = (preferredHostIdx + attempt) % BINANCE_HOSTS.length;
        const host = BINANCE_HOSTS[hostIdx] ?? BINANCE_HOSTS[0];

        try {
          const timestamp = Date.now();
          // Mantener orden exacto de parámetros para firma HMAC-SHA256 en Binance SAPI (rows=50 es el máximo real de C2C)
          const queryString = `tradeType=${tradeType}&startTimestamp=${win.startMs}&endTimestamp=${win.endMs}&page=${page}&rows=${BINANCE_C2C_PAGE_SIZE}&recvWindow=60000&timestamp=${timestamp}`;
          const signature = signBinanceQuery(queryString, apiSecret);

          const res = await fetch(
            `${host}/sapi/v1/c2c/orderMatch/listUserOrderHistory?${queryString}&signature=${signature}`,
            {
              method: "GET",
              cache: "no-store",
              headers: {
                "X-MBX-APIKEY": apiKey,
                "Cache-Control": "no-store, no-cache, must-revalidate",
              },
              signal: AbortSignal.timeout(9000),
            }
          );

          if (res.status === 429 || res.status === 418) {
            lastError = `Binance rate-limit HTTP ${res.status}`;
            rateLimited = true;
            break;
          }

          const json = (await res.json()) as {
            code: string | number;
            message?: string;
            msg?: string;
            data?: BinanceC2COrderItem[];
            total?: number;
            success?: boolean;
          };

          if (
            res.ok &&
            (json.code === "000000" || json.code === 0 || json.code === "0")
          ) {
            preferredHostIdx = hostIdx;
            pageItems = Array.isArray(json.data) ? json.data : [];
            pageTotal = typeof json.total === "number" ? json.total : undefined;
            break;
          }

          lastError = json.message || json.msg || `HTTP ${res.status}`;
          console.warn(
            `[Binance SAPI C2C] Host ${host} (page ${page}) respondió:`,
            lastError
          );

          if (
            lastError.includes("-2008") ||
            lastError.includes("-2014") ||
            lastError.includes("-1022")
          ) {
            fatalAuthError = true;
            break;
          }
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          console.warn(
            `[Binance SAPI C2C] Falló host ${host} (page ${page}):`,
            lastError
          );
        }
      }

      if (rateLimited) {
        accumulated.push(...windowOrders);
        return {
          success: accumulated.length > 0,
          data: accumulated,
          error: lastError,
          truncatedByBudget: true,
        };
      }

      if (fatalAuthError) {
        return { success: false, data: [], error: lastError };
      }

      if (pageItems === null) {
        accumulated.push(...windowOrders);
        return {
          success: accumulated.length > 0,
          data: accumulated,
          error: lastError || "No se pudo completar la paginación con Binance.",
        };
      }

      windowOrders.push(...pageItems);

      if (
        pageItems.length === 0 ||
        pageItems.length < BINANCE_C2C_PAGE_SIZE ||
        (pageTotal !== undefined &&
          pageTotal > 0 &&
          windowOrders.length >= pageTotal)
      ) {
        break;
      }
      page++;
    }

    accumulated.push(...windowOrders);
  }

  return { success: true, data: accumulated, truncatedByBudget };
}

function mapRawItemsToStoredRecords(
  userId: string,
  items: readonly BinanceC2COrderItem[]
): StoredP2POrderRecord[] {
  // Espejo cronológico exacto (createTime descendente) sin filtrar ningún estado o tipo
  const sorted = [...items].sort((a, b) => {
    const diff = (b.createTime || 0) - (a.createTime || 0);
    if (diff !== 0) return diff;
    return String(b.orderNumber).localeCompare(String(a.orderNumber));
  });

  return sorted.map((o) => {
    const tsInfo = formatVetOrderTimestamp(o.createTime);
    const statusInfo = mapBinanceOrderStatus(o.orderStatus ?? "UNKNOWN");
    const amountDec = parseSafeDecimal(o.amount);
    const unitPriceDec = parseSafeDecimal(o.unitPrice);
    const parsedRawTotal = parseSafeDecimal(o.totalPrice);
    const totalDec = parsedRawTotal.gt(0)
      ? parsedRawTotal
      : amountDec.mul(unitPriceDec);

    return {
      orderNumber: String(o.orderNumber),
      advNo: String(o.advNo ?? ""),
      userId,
      createTimeMs: Number(o.createTime || 0),
      timeVetLabel: tsInfo.dateTimeLabel,
      tradeType: o.tradeType === "BUY" ? "BUY" : "SELL",
      orderStatus: statusInfo.orderStatus,
      statusCategory: statusInfo.statusCategory,
      advertisementRole: o.advertisementRole === "TAKER" ? "TAKER" : "MAKER",
      asset: String(o.asset || "USDT"),
      fiat: String(o.fiat || "VES"),
      payMethodName: String(o.payMethodName || "P2P").trim() || "P2P",
      counterPartNickName: String(o.counterPartNickName || "Cliente P2P"),
      amountUsdt: formatExactDecimalString(o.amount, 2),
      commissionUsdt: formatExactDecimalString(o.commission || "0", 4),
      unitPriceVes: formatExactDecimalString(o.unitPrice, 2),
      totalPriceVes: formatExactDecimalString(totalDec.toFixed(), 2),
      costBasisRateVes: "0.00",
    };
  });
}

/**
 * Motor puro de cálculo por "Vuelta" y Brecha de Puntos basado en promedios totales
 * de Venta y Compra y comisión de Insignia (Bronce/Plata/Oro) sobre Volumen Total.
 * Solo las órdenes COMPLETED en fiat VES suman al volumen y a las ganancias en Bs.
 */
export function calculateVueltaSummary(params: {
  readonly orders: readonly P2POrderRowDto[];
  readonly period: PeriodFilter;
  readonly periodLabel: string;
  readonly method: LotMethod;
  readonly badge: MerchantBadgeType;
  readonly seniatTaxPercent?: number;
}): PnlSummaryDto {
  const {
    orders,
    period,
    periodLabel,
    method,
    badge,
    seniatTaxPercent = 16,
  } = params;

  const badgeMeta = MERCHANT_BADGE_META[badge];

  let totalSoldUsdt = new Decimal(0);
  let totalSoldVes = new Decimal(0);
  let totalBoughtUsdt = new Decimal(0);
  let totalBoughtVes = new Decimal(0);

  let completedSellCount = 0;
  let completedBuyCount = 0;
  let cancelledCount = 0;
  let appealCount = 0;
  let inProgressCount = 0;

  for (const order of orders) {
    const eligibility = evaluateOrderCalculationEligibility(order);

    if (eligibility.verifiedStatusCategory === "CANCELLED") {
      cancelledCount += 1;
      continue;
    }
    if (eligibility.verifiedStatusCategory === "IN_APPEAL") {
      appealCount += 1;
      continue;
    }
    if (eligibility.verifiedStatusCategory !== "COMPLETED") {
      inProgressCount += 1;
      continue;
    }

    // Descartar órdenes COMPLETED en otras monedas fiat (ej. USD/Zinli) o en otros criptoactivos distintos a USDT (ej. BTC, USDC, BNB)
    if (!eligibility.included) {
      continue;
    }

    // Únicamente órdenes COMPLETED en USDT/VES suman al volumen y ganancias
    const amt = parseSafeDecimal(order.amountUsdt);
    const price = parseSafeDecimal(order.unitPriceVes);
    const parsedTotal = parseSafeDecimal(order.totalPriceVes);
    const total = parsedTotal.gt(0) ? parsedTotal : amt.mul(price);

    if (order.tradeType === "SELL") {
      completedSellCount += 1;
      totalSoldUsdt = totalSoldUsdt.plus(amt);
      totalSoldVes = totalSoldVes.plus(total);
    } else {
      completedBuyCount += 1;
      totalBoughtUsdt = totalBoughtUsdt.plus(amt);
      totalBoughtVes = totalBoughtVes.plus(total);
    }
  }

  // 1. Precios Promedio Totales (únicamente ponderado real: Σ Total Bs ÷ Σ Total USDT)
  const activeAvgSell = totalSoldUsdt.gt(0)
    ? totalSoldVes.div(totalSoldUsdt)
    : new Decimal(0);
  const activeAvgBuy = totalBoughtUsdt.gt(0)
    ? totalBoughtVes.div(totalBoughtUsdt)
    : new Decimal(0);

  // 2. Brecha de Puntos (solo cuando ambos lados tienen volumen completado)
  const hasBothSides = totalSoldUsdt.gt(0) && totalBoughtUsdt.gt(0);
  const brechaPoints = hasBothSides
    ? activeAvgSell.minus(activeAvgBuy)
    : new Decimal(0);

  const spreadPct =
    hasBothSides && activeAvgBuy.gt(0)
      ? brechaPoints.div(activeAvgBuy).mul(100)
      : new Decimal(0);

  // 3. Volumen de la Vuelta y Excedente Pendiente
  const vueltaVolumeUsdt = Decimal.min(totalSoldUsdt, totalBoughtUsdt);
  const diffUsdt = totalSoldUsdt.minus(totalBoughtUsdt);

  let pendingDirection: "NONE" | "BUY_BACK" | "SELL_OUT" = "NONE";
  let pendingUsdtDec = new Decimal(0);
  if (diffUsdt.gt(0)) {
    pendingDirection = "BUY_BACK";
    pendingUsdtDec = diffUsdt;
  } else if (diffUsdt.lt(0)) {
    pendingDirection = "SELL_OUT";
    pendingUsdtDec = diffUsdt.abs();
  }

  // 4. Ganancia Bruta (Volumen Total de Compra en USDT × Brecha)
  const grossProfitBs = totalBoughtUsdt.mul(brechaPoints);
  const grossProfitUsdt = activeAvgBuy.gt(0)
    ? grossProfitBs.div(activeAvgBuy)
    : new Decimal(0);

  // 5. Volumen Total Movido y Comisión por Insignia
  const totalVolumeUsdt = totalSoldUsdt.plus(totalBoughtUsdt);
  const badgeFactorDec = new Decimal(badgeMeta.feeFactor);
  const volumeCommissionUsdt = totalVolumeUsdt.mul(badgeFactorDec);
  const rateForCommissionBs = activeAvgBuy.gt(0) ? activeAvgBuy : activeAvgSell;
  const volumeCommissionBs = volumeCommissionUsdt.mul(rateForCommissionBs);

  // 6. Ganancia Neta Final (descontando Comisión de Insignia sobre el Volumen Total)
  const netProfitUsdt = grossProfitUsdt.minus(volumeCommissionUsdt);
  const netProfitBs = grossProfitBs.minus(volumeCommissionBs);

  // 7. Provisión SENIAT seleccionada por el dueño (solo lectura fiscal; no altera la Ganancia Neta operativa)
  const seniatRateDec = new Decimal(seniatTaxPercent).div(100);
  const seniatTaxUsdtDec = Decimal.max(0, netProfitUsdt).mul(seniatRateDec);
  const seniatTaxBsDec = Decimal.max(0, netProfitBs).mul(seniatRateDec);

  const totalCompletedCount = completedSellCount + completedBuyCount;

  return {
    period,
    periodLabel,
    method,
    merchantBadge: badgeMeta.id,
    merchantBadgeLabel: badgeMeta.label,
    badgeFeePercent: String(badgeMeta.feePercent),
    badgeFeeFactor: badgeMeta.feeFactor,

    totalSoldUsdt: formatDecimalMoney(totalSoldUsdt, 2),
    totalSoldVes: formatDecimalMoney(totalSoldVes, 2),
    totalBoughtUsdt: formatDecimalMoney(totalBoughtUsdt, 2),
    totalBoughtVes: formatDecimalMoney(totalBoughtVes, 2),
    totalVolumeUsdt: formatDecimalMoney(totalVolumeUsdt, 2),

    avgSellRateWeightedVes: formatDecimalMoney(activeAvgSell, 2),
    avgBuyRateWeightedVes: formatDecimalMoney(activeAvgBuy, 2),
    activeAvgSellRateVes: formatDecimalMoney(activeAvgSell, 2),
    activeAvgBuyRateVes: formatDecimalMoney(activeAvgBuy, 2),
    brechaPointsVes: `${brechaPoints.gte(0) ? "+" : ""}${brechaPoints.toFixed(2)}`,
    averageSpreadPercent: `${spreadPct.gte(0) ? "+" : ""}${spreadPct.toFixed(2)}%`,

    vueltaVolumeUsdt: formatDecimalMoney(vueltaVolumeUsdt, 2),
    pendingDirection,
    pendingUsdt: formatDecimalMoney(pendingUsdtDec, 2),

    grossProfitVes: formatDecimalMoney(grossProfitBs, 2),
    grossProfitUsdt: grossProfitUsdt.toFixed(2),
    volumeCommissionUsdt: volumeCommissionUsdt.toFixed(2),
    volumeCommissionVes: formatDecimalMoney(volumeCommissionBs, 2),
    netProfitUsdt: netProfitUsdt.toFixed(2),
    netProfitVes: formatDecimalMoney(netProfitBs, 2),
    isNetProfitNegative: netProfitUsdt.lt(0),

    completedSellCount,
    completedBuyCount,
    cancelledCount,
    appealCount,
    inProgressCount,
    totalOrdersInPeriod: orders.length,
    reconciledOrdersCount: totalCompletedCount,

    // Campos compatibles para módulos auxiliares y Modo Contador
    netFreeProfitUsdt: netProfitUsdt.toFixed(2),
    netFreeProfitVes: formatDecimalMoney(netProfitBs, 2),
    seniatTax16Usdt: formatDecimalMoney(seniatTaxUsdtDec, 2),
    seniatTax16Ves: formatDecimalMoney(seniatTaxBsDec, 2),
    seniatTaxRatePercent: String(seniatTaxPercent),
    makerFeeRatePercent: String(badgeMeta.feePercent),
    exemptCapitalUsdt: formatDecimalMoney(totalBoughtUsdt, 2),
    exemptCapitalVes: formatDecimalMoney(totalBoughtVes, 2),
    currentWacCostVes: activeAvgBuy.toFixed(2),
    availableVaultUsdt: formatDecimalMoney(pendingUsdtDec, 2),
    totalBinanceFeesUsdt: volumeCommissionUsdt.toFixed(2),
    nextClosingTimeVet: "Cierre Manual",
    lastSyncSecondsAgo: 2,
    workingCapitalUsdt: formatDecimalMoney(totalVolumeUsdt, 2),
    workingCapitalVes: formatDecimalMoney(totalSoldVes.plus(totalBoughtVes), 2),
  };
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

/**
 * Suma de forma exacta con `Decimal.js` una colección de resúmenes de cierres
 * (por ejemplo, todos los `ShiftClosure` de un día para `DailyTotalClosure`,
 * o todos los `DailyTotalClosure` de un mes para el Cierre Mensual).
 */
export function buildAggregatedSummaryFromClosures(params: {
  readonly summaries: readonly PnlSummaryDto[];
  readonly orders: readonly P2POrderRowDto[];
  readonly period: PeriodFilter;
  readonly periodLabel: string;
  readonly badge: MerchantBadgeType;
  readonly seniatTaxPercent?: number;
}): PnlSummaryDto {
  const {
    summaries,
    orders,
    period,
    periodLabel,
    badge,
    seniatTaxPercent = 16,
  } = params;

  const badgeMeta = MERCHANT_BADGE_META[badge];

  let totalSoldUsdt = new Decimal(0);
  let totalSoldVes = new Decimal(0);
  let totalBoughtUsdt = new Decimal(0);
  let totalBoughtVes = new Decimal(0);
  let totalVolumeUsdt = new Decimal(0);
  let vueltaVolumeUsdt = new Decimal(0);

  let grossProfitVes = new Decimal(0);
  let grossProfitUsdt = new Decimal(0);
  let volumeCommissionUsdt = new Decimal(0);
  let volumeCommissionBs = new Decimal(0);
  let netProfitUsdt = new Decimal(0);
  let netProfitBs = new Decimal(0);

  let completedSellCount = 0;
  let completedBuyCount = 0;
  let cancelledCount = 0;
  let appealCount = 0;
  let inProgressCount = 0;

  for (const s of summaries) {
    totalSoldUsdt = totalSoldUsdt.plus(parseSafeDecimal(s.totalSoldUsdt));
    totalSoldVes = totalSoldVes.plus(parseSafeDecimal(s.totalSoldVes));
    totalBoughtUsdt = totalBoughtUsdt.plus(parseSafeDecimal(s.totalBoughtUsdt));
    totalBoughtVes = totalBoughtVes.plus(parseSafeDecimal(s.totalBoughtVes));
    totalVolumeUsdt = totalVolumeUsdt.plus(parseSafeDecimal(s.totalVolumeUsdt));
    vueltaVolumeUsdt = vueltaVolumeUsdt.plus(
      parseSafeDecimal(s.vueltaVolumeUsdt)
    );

    grossProfitVes = grossProfitVes.plus(parseSafeDecimal(s.grossProfitVes));
    grossProfitUsdt = grossProfitUsdt.plus(parseSafeDecimal(s.grossProfitUsdt));
    volumeCommissionUsdt = volumeCommissionUsdt.plus(
      parseSafeDecimal(s.volumeCommissionUsdt)
    );
    volumeCommissionBs = volumeCommissionBs.plus(
      parseSafeDecimal(s.volumeCommissionVes)
    );
    netProfitUsdt = netProfitUsdt.plus(parseSafeDecimal(s.netProfitUsdt));
    netProfitBs = netProfitBs.plus(parseSafeDecimal(s.netProfitVes));

    completedSellCount += s.completedSellCount;
    completedBuyCount += s.completedBuyCount;
    cancelledCount += s.cancelledCount;
    appealCount += s.appealCount;
    inProgressCount += s.inProgressCount;
  }

  // Precio Promedio Ponderado Total (Total Bs ÷ Total USDT)
  const activeAvgSell = totalSoldUsdt.gt(0)
    ? totalSoldVes.div(totalSoldUsdt)
    : new Decimal(0);
  const activeAvgBuy = totalBoughtUsdt.gt(0)
    ? totalBoughtVes.div(totalBoughtUsdt)
    : new Decimal(0);

  // Brecha efectiva ponderada por el volumen comprado diario (coherente con Σ Ganancia Bruta Día)
  const brechaPoints = totalBoughtUsdt.gt(0)
    ? grossProfitVes.div(totalBoughtUsdt)
    : new Decimal(0);
  const spreadPct =
    totalBoughtUsdt.gt(0) && activeAvgBuy.gt(0)
      ? brechaPoints.div(activeAvgBuy).mul(100)
      : new Decimal(0);

  const diffUsdt = totalSoldUsdt.minus(totalBoughtUsdt);

  let pendingDirection: "NONE" | "BUY_BACK" | "SELL_OUT" = "NONE";
  let pendingUsdtDec = new Decimal(0);
  if (diffUsdt.gt(0)) {
    pendingDirection = "BUY_BACK";
    pendingUsdtDec = diffUsdt;
  } else if (diffUsdt.lt(0)) {
    pendingDirection = "SELL_OUT";
    pendingUsdtDec = diffUsdt.abs();
  }

  const seniatRateDec = new Decimal(seniatTaxPercent).div(100);
  const seniatTaxUsdtDec = Decimal.max(0, netProfitUsdt).mul(seniatRateDec);
  const seniatTaxBsDec = Decimal.max(0, netProfitBs).mul(seniatRateDec);

  return {
    period,
    periodLabel,
    method: "FIFO",
    merchantBadge: badgeMeta.id,
    merchantBadgeLabel: badgeMeta.label,
    badgeFeePercent: String(badgeMeta.feePercent),
    badgeFeeFactor: badgeMeta.feeFactor,

    totalSoldUsdt: formatDecimalMoney(totalSoldUsdt, 2),
    totalSoldVes: formatDecimalMoney(totalSoldVes, 2),
    totalBoughtUsdt: formatDecimalMoney(totalBoughtUsdt, 2),
    totalBoughtVes: formatDecimalMoney(totalBoughtVes, 2),
    totalVolumeUsdt: formatDecimalMoney(totalVolumeUsdt, 2),

    avgSellRateWeightedVes: formatDecimalMoney(activeAvgSell, 2),
    avgBuyRateWeightedVes: formatDecimalMoney(activeAvgBuy, 2),
    activeAvgSellRateVes: formatDecimalMoney(activeAvgSell, 2),
    activeAvgBuyRateVes: formatDecimalMoney(activeAvgBuy, 2),
    brechaPointsVes: `${brechaPoints.gte(0) ? "+" : ""}${brechaPoints.toFixed(2)}`,
    averageSpreadPercent: `${spreadPct.gte(0) ? "+" : ""}${spreadPct.toFixed(2)}%`,

    vueltaVolumeUsdt: formatDecimalMoney(vueltaVolumeUsdt, 2),
    pendingDirection,
    pendingUsdt: formatDecimalMoney(pendingUsdtDec, 2),

    grossProfitVes: formatDecimalMoney(grossProfitVes, 2),
    grossProfitUsdt: grossProfitUsdt.toFixed(2),
    volumeCommissionUsdt: volumeCommissionUsdt.toFixed(2),
    volumeCommissionVes: formatDecimalMoney(volumeCommissionBs, 2),
    netProfitUsdt: netProfitUsdt.toFixed(2),
    netProfitVes: formatDecimalMoney(netProfitBs, 2),
    isNetProfitNegative: netProfitUsdt.lt(0),

    completedSellCount,
    completedBuyCount,
    cancelledCount,
    appealCount,
    inProgressCount,
    totalOrdersInPeriod: orders.length,
    reconciledOrdersCount: completedSellCount + completedBuyCount,

    netFreeProfitUsdt: netProfitUsdt.toFixed(2),
    netFreeProfitVes: formatDecimalMoney(netProfitBs, 2),
    seniatTax16Usdt: formatDecimalMoney(seniatTaxUsdtDec, 2),
    seniatTax16Ves: formatDecimalMoney(seniatTaxBsDec, 2),
    seniatTaxRatePercent: String(seniatTaxPercent),
    makerFeeRatePercent: String(badgeMeta.feePercent),
    exemptCapitalUsdt: formatDecimalMoney(totalBoughtUsdt, 2),
    exemptCapitalVes: formatDecimalMoney(totalBoughtVes, 2),
    currentWacCostVes: activeAvgBuy.toFixed(2),
    availableVaultUsdt: formatDecimalMoney(pendingUsdtDec, 2),
    totalBinanceFeesUsdt: volumeCommissionUsdt.toFixed(2),
    nextClosingTimeVet: "Cierre Manual",
    lastSyncSecondsAgo: 2,
    workingCapitalUsdt: formatDecimalMoney(totalVolumeUsdt, 2),
    workingCapitalVes: formatDecimalMoney(totalSoldVes.plus(totalBoughtVes), 2),
  };
}

export function countExcludedCompletedOrders(
  orders: readonly P2POrderRowDto[]
): {
  readonly excludedNonUsdtCount: number;
  readonly excludedNonVesCount: number;
} {
  let excludedNonUsdtCount = 0;
  let excludedNonVesCount = 0;

  for (const order of orders) {
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

/**
 * Enumera todas las fechas calendario VET (`YYYY-MM-DD`) dentro de `[startMs, endMs]`
 * acotadas al presente y a la ventana máxima de 180 días que conserva Binance C2C SAPI.
 */
export function enumerateVetDateIsosInRange(
  startMs: number,
  endMs: number,
  nowMs: number = Date.now()
): string[] {
  const oldestAllowedMs = nowMs - MAX_BINANCE_LOOKBACK_MS;
  const clampedStart = Math.max(startMs, oldestAllowedMs);
  const clampedEnd = Math.min(endMs, nowMs);
  if (clampedEnd < clampedStart) return [];

  const firstIso = formatVetOrderTimestamp(clampedStart).dateIso;
  const lastIso = formatVetOrderTimestamp(clampedEnd).dateIso;
  const dates: string[] = [];

  let cursorMs = getVetDayRangeMs(firstIso).startMs;
  const finalDayStartMs = getVetDayRangeMs(lastIso).startMs;
  let guard = 0;

  while (cursorMs <= finalDayStartMs && guard < 200) {
    dates.push(formatVetOrderTimestamp(cursorMs).dateIso);
    cursorMs += 86_400_000;
    guard++;
  }

  return dates;
}

/**
 * Construye el desglose día por día (VET) de un mes calendario y agrega el resumen mensual
 * como la **suma exacta** de las ganancias, comisiones y volúmenes de cada día (`Decimal.js`),
 * evitando distorsiones o ganancias negativas falsas por variación cambiaria durante el mes.
 */
export function buildDailyBreakdownAndMonthlySummary(params: {
  readonly userId: string;
  readonly targetMonth: string;
  readonly monthOrders: readonly P2POrderRowDto[];
  readonly periodLabel: string;
  readonly badge: MerchantBadgeType;
  readonly seniatTaxPercent: number;
}): {
  readonly dailyBreakdown: readonly DailyTotalClosureDto[];
  readonly summary: PnlSummaryDto;
  readonly excludedNonUsdtCount: number;
  readonly excludedNonVesCount: number;
} {
  const {
    userId,
    targetMonth,
    monthOrders,
    periodLabel,
    badge,
    seniatTaxPercent,
  } = params;

  const ordersByDay = new Map<string, P2POrderRowDto[]>();
  for (const order of monthOrders) {
    const dayKey = order.dateIsoVet;
    const list = ordersByDay.get(dayKey) ?? [];
    list.push(order);
    ordersByDay.set(dayKey, list);
  }

  const sortedDayKeys = Array.from(ordersByDay.keys()).sort((a, b) =>
    a.localeCompare(b)
  );
  const badgeMeta = MERCHANT_BADGE_META[badge];

  const dailyBreakdown: DailyTotalClosureDto[] = sortedDayKeys.map((dayIso) => {
    const dayOrders = ordersByDay.get(dayIso) ?? [];
    const dayLabel = formatDateIsoVe(dayIso);
    const daySummary = calculateVueltaSummary({
      orders: dayOrders,
      period: "DAY",
      periodLabel: `Día ${dayLabel}`,
      method: "FIFO",
      badge,
      seniatTaxPercent,
    });
    return {
      id: `cal_${userId}_${dayIso}`,
      userId,
      dateIsoVet: dayIso,
      monthIsoVet: targetMonth,
      dateLabelVet: dayLabel,
      executedAtVet: "Registro Diario Calendario VET",
      shiftsCount: 1,
      merchantBadge: badge,
      merchantBadgeLabel: badgeMeta.label,
      summary: daySummary,
      shiftsMeta: [],
      orders: dayOrders,
      updatedAtIso: new Date().toISOString(),
    };
  });

  const summary =
    dailyBreakdown.length > 0
      ? buildAggregatedSummaryFromClosures({
          summaries: dailyBreakdown.map((d) => d.summary),
          orders: monthOrders,
          period: "MONTH",
          periodLabel,
          badge,
          seniatTaxPercent,
        })
      : calculateVueltaSummary({
          orders: [],
          period: "MONTH",
          periodLabel,
          method: "FIFO",
          badge,
          seniatTaxPercent,
        });

  const { excludedNonUsdtCount, excludedNonVesCount } =
    countExcludedCompletedOrders(monthOrders);

  return {
    dailyBreakdown,
    summary,
    excludedNonUsdtCount,
    excludedNonVesCount,
  };
}

function resolvePeriodBounds(params: {
  readonly period: PeriodFilter;
  readonly date?: string;
  readonly month?: string;
}): {
  readonly startMs: number | null;
  readonly endMs: number | null;
  readonly periodLabel: string;
} {
  const { period, date, month } = params;

  if (period === "ALL") {
    return {
      startMs: null,
      endMs: null,
      periodLabel: "Espejo Completo Binance (Todos los registros)",
    };
  }

  if (period === "DAY" || (date && /^\d{4}-\d{2}-\d{2}$/.test(date))) {
    const targetIso =
      date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : getCurrentVetDateIso();
    const range = getVetDayRangeMs(targetIso);
    return {
      startMs: range.startMs,
      endMs: range.endMs,
      periodLabel: `Día ${range.labelEs} (-4:00 UTC)`,
    };
  }

  if (
    period === "MONTH" ||
    (month && /^\d{4}-\d{2}$/.test(month))
  ) {
    const targetMonth =
      month && /^\d{4}-\d{2}$/.test(month) ? month : getCurrentVetMonthIso();
    const range = getVetMonthRangeMs(targetMonth);
    return {
      startMs: range.startMs,
      endMs: range.endMs,
      periodLabel: `Mes ${range.labelEs}`,
    };
  }

  if (period === "7D") {
    const range7d = getVetNDaysRangeMs(7);
    return {
      startMs: range7d.startMs,
      endMs: range7d.endMs,
      periodLabel: "Últimos 7 días (-4:00 UTC)",
    };
  }

  if (period === "30D") {
    const range30d = getVetNDaysRangeMs(30);
    return {
      startMs: range30d.startMs,
      endMs: range30d.endMs,
      periodLabel: "Últimos 30 días (-4:00 UTC)",
    };
  }

  // Por defecto: TODAY (00:00:00 a 23:59:59 VET)
  const todayIso = getCurrentVetDateIso();
  const todayRange = getVetDayRangeMs(todayIso);
  return {
    startMs: todayRange.startMs,
    endMs: todayRange.endMs,
    periodLabel: `Hoy ${todayRange.labelEs} (-4:00 UTC)`,
  };
}

export class P2PAccountingService {
  private static readonly SYNC_COOLDOWN_MS = 25_000;
  private static readonly INCREMENTAL_OVERLAP_MS = 30 * 60_000;
  private static readonly INITIAL_SYNC_WINDOW_MS = 7 * 86_400_000;
  private static readonly MAX_OPEN_ORDER_LOOKBACK_MS = 48 * 3_600_000;

  private static readonly lastSyncTimestampByUser = new Map<string, number>();
  private static readonly inFlightSyncByUser = new Map<string, Promise<void>>();

  /**
   * Prueba en vivo si las credenciales conectadas responden con éxito en Binance SAPI.
   */
  public static async testBinanceConnection(userId: string): Promise<{
    readonly success: boolean;
    readonly message: string;
    readonly orderCount?: number;
    readonly errorDetails?: string;
  }> {
    const credential =
      await SupabaseVaultRepository.getBinanceCredential(userId);
    if (!credential) {
      return {
        success: false,
        message:
          "No tienes una API Key guardada en la Bóveda. Guarda tus claves primero.",
      };
    }

    try {
      const { apiKey, apiSecret } = decryptBinanceCredentials(
        credential.apiKeyEncrypted,
        credential.iv,
        credential.authTag
      );

      const timestamp = Date.now();
      const queryString = `tradeType=BUY&timestamp=${timestamp}&recvWindow=60000&rows=10`;
      const signature = signBinanceQuery(queryString, apiSecret);

      let lastErrorMsg = "";
      let isVerified = false;

      for (const host of BINANCE_HOSTS) {
        try {
          const res = await fetch(
            `${host}/sapi/v1/c2c/orderMatch/listUserOrderHistory?${queryString}&signature=${signature}`,
            {
              method: "GET",
              cache: "no-store",
              headers: {
                "X-MBX-APIKEY": apiKey,
                "Cache-Control": "no-store, no-cache, must-revalidate",
              },
              signal: AbortSignal.timeout(12000),
            }
          );

          const json = (await res.json()) as {
            code: string | number;
            message?: string;
            msg?: string;
            data?: unknown[];
          };

          if (
            res.ok &&
            (json.code === "000000" || json.code === 0 || json.code === "0")
          ) {
            isVerified = true;
            break;
          }

          lastErrorMsg =
            json.msg || json.message || `Código de error Binance: ${json.code}`;

          if (json.code === -2008 || json.code === -2014 || json.code === -1022) {
            break;
          }
        } catch (err) {
          lastErrorMsg = err instanceof Error ? err.message : String(err);
        }
      }

      if (!isVerified) {
        if (
          lastErrorMsg.toLowerCase().includes("restricted location") ||
          lastErrorMsg.toLowerCase().includes("eligibility")
        ) {
          return {
            success: false,
            message:
              "Binance detectó restricción geográfica en la ruta actual. Revisa proxy/VPN o reintenta en breve.",
            errorDetails: lastErrorMsg,
          };
        }

        return {
          success: false,
          message: `Binance rechazó la conexión: ${lastErrorMsg}`,
          errorDetails: lastErrorMsg,
        };
      }

      this.lastSyncTimestampByUser.delete(userId);
      const synced = await this.getUserOrdersFromVaultOrBinance(userId, true);

      return {
        success: true,
        message: `¡Conexión verificada exitosamente con Binance! Se sincronizaron ${synced.length} órdenes del espejo P2P.`,
        orderCount: synced.length,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        message: `Error al conectar con los servidores de Binance: ${errorMsg}`,
        errorDetails: errorMsg,
      };
    }
  }

  /**
   * Sincroniza desde Binance un rango específico (paginado de 50 en 50 con presupuesto de tiempo)
   * y guarda las órdenes en Supabase en lotes de 200. Lee únicamente el rango solicitado
   * (`readRange`) en lugar de descargar todo el historial de la cuenta.
   */
  public static async syncBinanceRange(
    userId: string,
    startMs: number,
    endMs: number,
    readRange?: { readonly startMs?: number | null; readonly endMs?: number | null }
  ): Promise<readonly P2POrderRowDto[]> {
    const effectiveReadRange = readRange ?? { startMs, endMs };
    const credential =
      await SupabaseVaultRepository.getBinanceCredential(userId);
    if (!credential) {
      const stored = await SupabaseVaultRepository.getUserOrdersInRange(
        userId,
        effectiveReadRange
      );
      return stored.map(toMirrorOrderDto);
    }

    let freshRecords: StoredP2POrderRecord[] = [];
    let maxFreshCreateMs = 0;

    try {
      const { apiKey, apiSecret } = decryptBinanceCredentials(
        credential.apiKeyEncrypted,
        credential.iv,
        credential.authTag
      );

      const [buyRes, sellRes] = await Promise.all([
        fetchBinanceOrdersInRange(apiKey, apiSecret, "BUY", startMs, endMs),
        fetchBinanceOrdersInRange(apiKey, apiSecret, "SELL", startMs, endMs),
      ]);

      const combined = [...buyRes.data, ...sellRes.data];
      if (combined.length > 0) {
        freshRecords = mapRawItemsToStoredRecords(userId, combined);
        for (const rec of freshRecords) {
          if (rec.createTimeMs > maxFreshCreateMs) {
            maxFreshCreateMs = rec.createTimeMs;
          }
        }
        await SupabaseVaultRepository.saveUserOrders(userId, freshRecords);
      }
      this.lastSyncTimestampByUser.set(userId, Date.now());
    } catch (err) {
      console.error(
        "[P2PAccountingService] Error sincronizando rango desde Binance:",
        err
      );
    }

    const storedAfter = await SupabaseVaultRepository.getUserOrdersInRange(
      userId,
      effectiveReadRange
    );
    if (freshRecords.length === 0) {
      return storedAfter.map(toMirrorOrderDto);
    }

    const rStart = effectiveReadRange.startMs ?? null;
    const rEnd = effectiveReadRange.endMs ?? null;
    const mergedMap = new Map<string, StoredP2POrderRecord>();
    for (const oldRec of storedAfter) {
      mergedMap.set(oldRec.orderNumber, oldRec);
    }
    // Priorizar siempre los registros recién traídos de Binance dentro del rango solicitado
    for (const fresh of freshRecords) {
      if (rStart !== null && fresh.createTimeMs < rStart) continue;
      if (rEnd !== null && fresh.createTimeMs > rEnd) continue;
      mergedMap.set(fresh.orderNumber, fresh);
    }

    const mergedSorted = Array.from(mergedMap.values()).sort((a, b) => {
      if (b.createTimeMs !== a.createTimeMs) {
        return b.createTimeMs - a.createTimeMs;
      }
      return b.orderNumber.localeCompare(a.orderNumber);
    });

    return mergedSorted.map(toMirrorOrderDto);
  }

  /**
   * Obtiene el espejo exacto de órdenes Binance P2P acotado a `targetBounds`.
   * Optimizado para cuentas de alto volumen (400-500+ órdenes/día):
   * - Evita descargar todo el historial en cada lectura usando `getUserOrdersInRange`.
   * - Usa cursor incremental (`última orden - 30 min` + órdenes abiertas <48h) en lugar de re-descargar 72h.
   * - Deduplica peticiones simultáneas (`inFlightSyncByUser`) + cooldown de 25s + candado distribuido.
   * - Los rangos estrictamente históricos ya guardados en Supabase se leen directo sin llamar a Binance.
   */
  public static async getUserOrdersFromVaultOrBinance(
    userId: string,
    forceFresh: boolean = false,
    targetBounds?: { readonly startMs: number | null; readonly endMs: number | null }
  ): Promise<readonly P2POrderRowDto[]> {
    const readRange = {
      startMs: targetBounds?.startMs ?? null,
      endMs: targetBounds?.endMs ?? null,
    };

    const credential =
      await SupabaseVaultRepository.getBinanceCredential(userId);

    if (!credential) {
      const stored = await SupabaseVaultRepository.getUserOrdersInRange(
        userId,
        readRange
      );
      return stored.map(toMirrorOrderDto);
    }

    const now = Date.now();
    const defaultEndMs = now + 60_000;

    // 1. Lectura puramente histórica (días/meses pasados terminados hace más de 1 hora):
    //    servir desde Supabase si ya existen órdenes en ese rango; solo consultar Binance si está vacío.
    const isHistoricalRange =
      !forceFresh &&
      readRange.startMs !== null &&
      readRange.endMs !== null &&
      readRange.endMs < now - 60 * 60_000;

    if (isHistoricalRange && readRange.startMs !== null && readRange.endMs !== null) {
      const cachedHistorical =
        await SupabaseVaultRepository.getUserOrdersInRange(userId, readRange);
      if (cachedHistorical.length > 0) {
        return cachedHistorical.map(toMirrorOrderDto);
      }
      return this.syncBinanceRange(
        userId,
        readRange.startMs,
        readRange.endMs,
        readRange
      );
    }

    // 2. Cooldown en memoria (25s): evita sobrecargar Binance entre polling de summary/orders/shifts
    const lastSync = this.lastSyncTimestampByUser.get(userId) ?? 0;
    if (!forceFresh && now - lastSync < this.SYNC_COOLDOWN_MS) {
      const cached = await SupabaseVaultRepository.getUserOrdersInRange(
        userId,
        readRange
      );
      return cached.map(toMirrorOrderDto);
    }

    // 3. Deduplicación en vuelo: si otra petición ya está sincronizando para este usuario, esperar y leer rango
    const activeSync = this.inFlightSyncByUser.get(userId);
    if (activeSync && !forceFresh) {
      await activeSync;
      const cached = await SupabaseVaultRepository.getUserOrdersInRange(
        userId,
        readRange
      );
      return cached.map(toMirrorOrderDto);
    }

    // 4. Sincronización incremental por cursor + candado distribuido en Supabase
    const syncJob = (async (): Promise<void> => {
      let lockAcquired = false;
      let latestSyncedCreateMs = 0;
      let syncErrorMsg: string | null = null;

      try {
        if (!forceFresh) {
          const lockState =
            await SupabaseVaultRepository.tryAcquireDistributedSyncLock(
              userId,
              this.SYNC_COOLDOWN_MS
            );
          if (!lockState.acquired) {
            this.lastSyncTimestampByUser.set(userId, Date.now());
            return;
          }
          lockAcquired = true;
        }

        const [latestStoredMs, oldestOpenMs] = await Promise.all([
          SupabaseVaultRepository.getLatestOrderTimestampMs(userId),
          SupabaseVaultRepository.getOldestOpenOrderTimestampMs(
            userId,
            this.MAX_OPEN_ORDER_LOOKBACK_MS
          ),
        ]);

        let syncStartMs: number;
        if (forceFresh) {
          syncStartMs =
            readRange.startMs ?? now - this.INITIAL_SYNC_WINDOW_MS;
        } else if (latestStoredMs > 0) {
          const cursorWithOverlap = Math.max(
            0,
            latestStoredMs - this.INCREMENTAL_OVERLAP_MS
          );
          const openOrderStart =
            oldestOpenMs !== null ? Math.max(0, oldestOpenMs - 5 * 60_000) : cursorWithOverlap;
          syncStartMs = Math.max(
            now - this.MAX_OPEN_ORDER_LOOKBACK_MS,
            Math.min(cursorWithOverlap, openOrderStart)
          );
        } else {
          // Primera sincronización de la cuenta: acotar a 7 días (o inicio del rango pedido si es más reciente)
          syncStartMs =
            readRange.startMs !== null
              ? Math.max(readRange.startMs, now - this.INITIAL_SYNC_WINDOW_MS)
              : now - this.INITIAL_SYNC_WINDOW_MS;
        }

        const { apiKey, apiSecret } = decryptBinanceCredentials(
          credential.apiKeyEncrypted,
          credential.iv,
          credential.authTag
        );

        const [buyRes, sellRes] = await Promise.all([
          fetchBinanceOrdersInRange(
            apiKey,
            apiSecret,
            "BUY",
            syncStartMs,
            defaultEndMs
          ),
          fetchBinanceOrdersInRange(
            apiKey,
            apiSecret,
            "SELL",
            syncStartMs,
            defaultEndMs
          ),
        ]);

        const combined = [...buyRes.data, ...sellRes.data];
        if (combined.length > 0) {
          const freshRecords = mapRawItemsToStoredRecords(userId, combined);
          for (const rec of freshRecords) {
            if (rec.createTimeMs > latestSyncedCreateMs) {
              latestSyncedCreateMs = rec.createTimeMs;
            }
          }
          await SupabaseVaultRepository.saveUserOrders(userId, freshRecords);
        } else {
          latestSyncedCreateMs = latestStoredMs;
        }

        if (!buyRes.success && buyRes.error) {
          syncErrorMsg = buyRes.error;
        } else if (!sellRes.success && sellRes.error) {
          syncErrorMsg = sellRes.error;
        }

        this.lastSyncTimestampByUser.set(userId, Date.now());
      } catch (err) {
        syncErrorMsg = err instanceof Error ? err.message : String(err);
        console.error(
          "[P2PAccountingService] Error en sincronización incremental:",
          syncErrorMsg
        );
      } finally {
        if (lockAcquired) {
          await SupabaseVaultRepository.releaseDistributedSyncLock(
            userId,
            latestSyncedCreateMs,
            syncErrorMsg
          );
        }
        P2PAccountingService.inFlightSyncByUser.delete(userId);
      }
    })();

    this.inFlightSyncByUser.set(userId, syncJob);
    await syncJob;

    // Si se pidió un rango mensual/diario amplio que empieza antes de los últimos 7 días y aún no tiene datos al inicio,
    // completar una única vez ese tramo faltante.
    const resultOrders = await SupabaseVaultRepository.getUserOrdersInRange(
      userId,
      readRange
    );

    if (
      readRange.startMs !== null &&
      readRange.startMs < now - this.INITIAL_SYNC_WINDOW_MS &&
      resultOrders.length === 0
    ) {
      return this.syncBinanceRange(
        userId,
        readRange.startMs,
        readRange.endMs ?? defaultEndMs,
        readRange
      );
    }

    return resultOrders.map(toMirrorOrderDto);
  }

  /**
   * Sincronización determinista día por día (VET) diseñada para cuentas de alto volumen
   * (400–500+ órdenes/día / ~15,000 órdenes/mes):
   * - Evita pedir ventanas gigantes de 28 días que se cortan por el límite de páginas o timeout.
   * - Consulta `p2p_sync_day_coverage` para saltar días pasados ya descargados íntegramente.
   * - Re-sincroniza cualquier día faltante, incompleto, con órdenes abiertas (`IN_PROGRESS`/`IN_APPEAL`)
   *   o del día en curso.
   * - Reporta explícitamente si algún día no pudo completarse (rate-limit 429 o presupuesto de tiempo)
   *   para que ningún Excel se entregue con huecos silenciosos.
   */
  public static async ensureRangeCompletelySynced(
    userId: string,
    startMs: number,
    endMs: number,
    options?: {
      readonly totalBudgetMs?: number;
      readonly maxPagesPerDay?: number;
      readonly concurrency?: number;
      readonly forceRefreshToday?: boolean;
    }
  ): Promise<{
    readonly orders: readonly P2POrderRowDto[];
    readonly isComplete: boolean;
    readonly incompleteDays: readonly string[];
    readonly warningMessage?: string;
  }> {
    const totalBudgetMs = options?.totalBudgetMs ?? 45_000;
    const maxPagesPerDay = options?.maxPagesPerDay ?? 40; // 40 * 50 = 2,000 BUY + 2,000 SELL por día
    const concurrency = Math.max(1, Math.min(options?.concurrency ?? 3, 4));
    const forceRefreshToday = options?.forceRefreshToday ?? true;

    const credential =
      await SupabaseVaultRepository.getBinanceCredential(userId);
    if (!credential) {
      const stored = await SupabaseVaultRepository.getUserOrdersInRange(
        userId,
        { startMs, endMs }
      );
      return {
        orders: stored.map(toMirrorOrderDto),
        isComplete: true,
        incompleteDays: [],
      };
    }

    const nowMs = Date.now();
    const dateIsos = enumerateVetDateIsosInRange(startMs, endMs, nowMs);
    if (dateIsos.length === 0) {
      const stored = await SupabaseVaultRepository.getUserOrdersInRange(
        userId,
        { startMs, endMs }
      );
      return {
        orders: stored.map(toMirrorOrderDto),
        isComplete: true,
        incompleteDays: [],
      };
    }

    const firstIso = dateIsos[0]!;
    const lastIso = dateIsos[dateIsos.length - 1]!;
    const todayIso = getCurrentVetDateIso(nowMs);
    const coverageMap = await SupabaseVaultRepository.getSyncedDayCoverage(
      userId,
      firstIso,
      lastIso
    );

    const daysToSync: string[] = [];
    for (const dayIso of dateIsos) {
      const dayRange = getVetDayRangeMs(dayIso);
      const isClosedPastDay = dayRange.endMs < nowMs - 60 * 60_000;
      const cov = coverageMap.get(dayIso);

      if (isClosedPastDay && cov && cov.isComplete && cov.openOrdersCount === 0) {
        continue;
      }

      if (dayIso === todayIso && !forceRefreshToday) {
        const lastSync = this.lastSyncTimestampByUser.get(userId) ?? 0;
        if (nowMs - lastSync < this.SYNC_COOLDOWN_MS) {
          continue;
        }
      }

      daysToSync.push(dayIso);
    }

    const incompleteDays: string[] = [];
    const freshRecordsMap = new Map<string, StoredP2POrderRecord>();

    if (daysToSync.length > 0) {
      const startedAtMs = Date.now();
      let rateLimitedHit = false;

      const { apiKey, apiSecret } = decryptBinanceCredentials(
        credential.apiKeyEncrypted,
        credential.iv,
        credential.authTag
      );

      for (let i = 0; i < daysToSync.length; i += concurrency) {
        const batch = daysToSync.slice(i, i + concurrency);
        const elapsed = Date.now() - startedAtMs;
        if (rateLimitedHit || elapsed >= totalBudgetMs) {
          incompleteDays.push(...daysToSync.slice(i));
          break;
        }

        const remainingBudget = Math.max(4_000, totalBudgetMs - elapsed);
        const perDayBudget = Math.min(18_000, remainingBudget);

        const batchResults = await Promise.all(
          batch.map(async (dayIso) => {
            const dayRange = getVetDayRangeMs(dayIso);
            const effectiveEndMs = Math.min(dayRange.endMs, Date.now() + 60_000);
            try {
              const [buyRes, sellRes] = await Promise.all([
                fetchBinanceOrdersInRange(
                  apiKey,
                  apiSecret,
                  "BUY",
                  dayRange.startMs,
                  effectiveEndMs,
                  maxPagesPerDay,
                  perDayBudget
                ),
                fetchBinanceOrdersInRange(
                  apiKey,
                  apiSecret,
                  "SELL",
                  dayRange.startMs,
                  effectiveEndMs,
                  maxPagesPerDay,
                  perDayBudget
                ),
              ]);

              const combined = [...buyRes.data, ...sellRes.data];
              const mapped =
                combined.length > 0
                  ? mapRawItemsToStoredRecords(userId, combined)
                  : [];

              if (mapped.length > 0) {
                await SupabaseVaultRepository.saveUserOrders(userId, mapped);
              }

              const openOrdersCount = mapped.filter(
                (r) =>
                  r.statusCategory === "IN_PROGRESS" ||
                  r.statusCategory === "IN_APPEAL"
              ).length;

              const hitRateLimit =
                String(buyRes.error ?? "").includes("429") ||
                String(buyRes.error ?? "").includes("418") ||
                String(sellRes.error ?? "").includes("429") ||
                String(sellRes.error ?? "").includes("418");

              const dayFullySynced =
                buyRes.success &&
                sellRes.success &&
                !buyRes.truncatedByBudget &&
                !sellRes.truncatedByBudget;

              const isClosedPastDay =
                dayRange.endMs < Date.now() - 60 * 60_000;

              if (dayFullySynced && isClosedPastDay) {
                await SupabaseVaultRepository.upsertDayCoverage({
                  userId,
                  dateIsoVet: dayIso,
                  isComplete: true,
                  buyCount: buyRes.data.length,
                  sellCount: sellRes.data.length,
                  openOrdersCount,
                  syncedAt: new Date().toISOString(),
                });
              }

              return {
                dayIso,
                mapped,
                dayFullySynced,
                hitRateLimit,
              };
            } catch {
              return {
                dayIso,
                mapped: [] as StoredP2POrderRecord[],
                dayFullySynced: false,
                hitRateLimit: false,
              };
            }
          })
        );

        for (const res of batchResults) {
          for (const rec of res.mapped) {
            freshRecordsMap.set(rec.orderNumber, rec);
          }
          if (!res.dayFullySynced) {
            incompleteDays.push(res.dayIso);
          }
          if (res.hitRateLimit) {
            rateLimitedHit = true;
          }
        }
      }

      if (incompleteDays.length === 0) {
        this.lastSyncTimestampByUser.set(userId, Date.now());
      }
    }

    const storedAfter = await SupabaseVaultRepository.getUserOrdersInRange(
      userId,
      { startMs, endMs }
    );

    const mergedMap = new Map<string, StoredP2POrderRecord>();
    for (const oldRec of storedAfter) {
      mergedMap.set(oldRec.orderNumber, oldRec);
    }
    for (const fresh of freshRecordsMap.values()) {
      if (fresh.createTimeMs < startMs || fresh.createTimeMs > endMs) continue;
      mergedMap.set(fresh.orderNumber, fresh);
    }

    const mergedSorted = Array.from(mergedMap.values()).sort((a, b) => {
      if (b.createTimeMs !== a.createTimeMs) {
        return b.createTimeMs - a.createTimeMs;
      }
      return b.orderNumber.localeCompare(a.orderNumber);
    });

    const uniqueIncomplete = Array.from(new Set(incompleteDays)).sort((a, b) =>
      a.localeCompare(b)
    );
    const isComplete = uniqueIncomplete.length === 0;
    const warningMessage = !isComplete
      ? `Sincronización parcial por volumen/límite de Binance: faltan ${uniqueIncomplete.length} día(s) (${uniqueIncomplete.slice(0, 5).map(formatDateIsoVe).join(", ")}${uniqueIncomplete.length > 5 ? "..." : ""}). Vuelve a pulsar descargar para completar los días restantes (los ya sincronizados quedaron guardados).`
      : undefined;

    return {
      orders: mergedSorted.map(toMirrorOrderDto),
      isComplete,
      incompleteDays: uniqueIncomplete,
      warningMessage,
    };
  }

  /**
   * Calcula los KPIs en tiempo real usando el motor por "Vuelta" y Brecha de Puntos
   * con la insignia persistente del usuario.
   * Cuando `period === "TODAY"`, opera en modo Control por Jornada:
   * - Si no hay jornada activa (`activeShift === null`), devuelve todo en 0.00.
   * - Si hay jornada activa, contabiliza únicamente órdenes con `createTimeMs >= shiftStartTimeMs`.
   */
  public static async getSummary(params: {
    readonly userId: string;
    readonly period: PeriodFilter;
    readonly method: LotMethod;
    readonly date?: string;
    readonly month?: string;
  }): Promise<PnlSummaryDto> {
    const taxConfig = await SupabaseVaultRepository.getUserTaxConfig(
      params.userId
    );

    if (params.period === "TODAY") {
      const activeShift = await SupabaseVaultRepository.getActiveShift(
        params.userId
      );

      if (!activeShift) {
        return calculateVueltaSummary({
          orders: [],
          period: "TODAY",
          periodLabel: "Jornada cerrada · En espera (0.00)",
          method: params.method,
          badge: taxConfig.merchantBadge,
          seniatTaxPercent: taxConfig.seniatTaxPercent,
        });
      }

      const nowMs = Date.now();
      const allMirrorOrders = await this.getUserOrdersFromVaultOrBinance(
        params.userId,
        false,
        { startMs: activeShift.shiftStartTimeMs, endMs: nowMs + 60_000 }
      );

      const shiftOrders = allMirrorOrders.filter(
        (o) => o.createTimeMs >= activeShift.shiftStartTimeMs
      );

      return calculateVueltaSummary({
        orders: shiftOrders,
        period: "TODAY",
        periodLabel: `Jornada #${activeShift.shiftNumber} · Desde ${activeShift.dateLabelVet} ${activeShift.startTimeVetLabel} VET`,
        method: params.method,
        badge: taxConfig.merchantBadge,
        seniatTaxPercent: taxConfig.seniatTaxPercent,
      });
    }

    const bounds = resolvePeriodBounds({
      period: params.period,
      date: params.date,
      month: params.month,
    });

    const isMonthQuery =
      params.period === "MONTH" ||
      Boolean(params.month && /^\d{4}-\d{2}$/.test(params.month));
    const isDayQuery =
      params.period === "DAY" ||
      Boolean(params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date));

    if ((isMonthQuery || isDayQuery) && bounds.startMs !== null && bounds.endMs !== null) {
      const synced = await this.ensureRangeCompletelySynced(
        params.userId,
        bounds.startMs,
        bounds.endMs,
        {
          totalBudgetMs: 18_000,
          forceRefreshToday: false,
        }
      );

      const periodOrders = synced.orders.filter(
        (o) =>
          o.createTimeMs >= bounds.startMs! &&
          o.createTimeMs <= bounds.endMs!
      );

      if (isMonthQuery) {
        const targetMonth =
          params.month && /^\d{4}-\d{2}$/.test(params.month)
            ? params.month
            : getCurrentVetMonthIso();
        const { summary } = buildDailyBreakdownAndMonthlySummary({
          userId: params.userId,
          targetMonth,
          monthOrders: periodOrders,
          periodLabel: bounds.periodLabel,
          badge: taxConfig.merchantBadge,
          seniatTaxPercent: taxConfig.seniatTaxPercent,
        });
        return summary;
      }

      return calculateVueltaSummary({
        orders: periodOrders,
        period: params.period,
        periodLabel: bounds.periodLabel,
        method: params.method,
        badge: taxConfig.merchantBadge,
        seniatTaxPercent: taxConfig.seniatTaxPercent,
      });
    }

    const allMirrorOrders = await this.getUserOrdersFromVaultOrBinance(
      params.userId,
      false,
      bounds
    );

    const periodOrders =
      bounds.startMs !== null && bounds.endMs !== null
        ? allMirrorOrders.filter(
            (o) =>
              o.createTimeMs >= bounds.startMs! &&
              o.createTimeMs <= bounds.endMs!
          )
        : allMirrorOrders;

    return calculateVueltaSummary({
      orders: periodOrders,
      period: params.period,
      periodLabel: bounds.periodLabel,
      method: params.method,
      badge: taxConfig.merchantBadge,
      seniatTaxPercent: taxConfig.seniatTaxPercent,
    });
  }

  /**
   * Devuelve el espejo exacto de órdenes paginado manteniendo el orden cronológico de Binance.
   * Cuando `period === "TODAY"`, filtra estrictamente por la jornada activa (o devuelve 0 órdenes si está cerrada).
   */
  public static async getPaginatedOrders(params: {
    readonly userId: string;
    readonly period?: PeriodFilter;
    readonly tradeType: TradeTypeFilter;
    readonly status?: OrderStatusFilter;
    readonly bank?: string;
    readonly date?: string;
    readonly month?: string;
    readonly page: number;
    readonly limit: number;
  }): Promise<{
    readonly items: readonly P2POrderRowDto[];
    readonly totalCount: number;
    readonly sellCount: number;
    readonly buyCount: number;
    readonly completedCount: number;
    readonly cancelledCount: number;
    readonly appealCount: number;
    readonly inProgressCount: number;
    readonly availableDates: readonly string[];
  }> {
    const effectivePeriod: PeriodFilter =
      params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
        ? "DAY"
        : params.month && /^\d{4}-\d{2}$/.test(params.month)
          ? "MONTH"
          : (params.period ?? "ALL");

    if (effectivePeriod === "TODAY") {
      const activeShift = await SupabaseVaultRepository.getActiveShift(
        params.userId
      );

      if (!activeShift) {
        return {
          items: [],
          totalCount: 0,
          sellCount: 0,
          buyCount: 0,
          completedCount: 0,
          cancelledCount: 0,
          appealCount: 0,
          inProgressCount: 0,
          availableDates: [],
        };
      }

      const nowMs = Date.now();
      const allOrders = await this.getUserOrdersFromVaultOrBinance(
        params.userId,
        false,
        { startMs: activeShift.shiftStartTimeMs, endMs: nowMs + 60_000 }
      );

      const shiftFiltered = allOrders.filter((order) => {
        if (order.createTimeMs < activeShift.shiftStartTimeMs) {
          return false;
        }
        if (params.tradeType !== "ALL" && order.tradeType !== params.tradeType) {
          return false;
        }
        if (
          params.status &&
          params.status !== "ALL" &&
          order.statusCategory !== params.status
        ) {
          return false;
        }
        if (
          params.bank &&
          params.bank.trim() !== "" &&
          !order.payMethodName
            .toLowerCase()
            .includes(params.bank.trim().toLowerCase())
        ) {
          return false;
        }
        return true;
      });

      const sellCount = shiftFiltered.filter((o) => o.tradeType === "SELL").length;
      const buyCount = shiftFiltered.filter((o) => o.tradeType === "BUY").length;
      const completedCount = shiftFiltered.filter(
        (o) => o.statusCategory === "COMPLETED"
      ).length;
      const cancelledCount = shiftFiltered.filter(
        (o) => o.statusCategory === "CANCELLED"
      ).length;
      const appealCount = shiftFiltered.filter(
        (o) => o.statusCategory === "IN_APPEAL"
      ).length;
      const inProgressCount = shiftFiltered.filter(
        (o) => o.statusCategory === "IN_PROGRESS"
      ).length;

      const startIndex = (params.page - 1) * params.limit;
      const pagedItems = shiftFiltered.slice(
        startIndex,
        startIndex + params.limit
      );

      return {
        items: pagedItems,
        totalCount: shiftFiltered.length,
        sellCount,
        buyCount,
        completedCount,
        cancelledCount,
        appealCount,
        inProgressCount,
        availableDates: [activeShift.dateLabelVet],
      };
    }

    const bounds =
      effectivePeriod === "ALL" && !params.date && !params.month
        ? { startMs: null, endMs: null }
        : resolvePeriodBounds({
            period: effectivePeriod,
            date: params.date,
            month: params.month,
          });

    const allOrders = await this.getUserOrdersFromVaultOrBinance(
      params.userId,
      false,
      bounds
    );

    const dateSet = new Set<string>();
    for (const ord of allOrders) {
      if (ord.dateLabelVet) {
        dateSet.add(ord.dateLabelVet);
      }
    }
    const availableDates = Array.from(dateSet);

    const filtered = allOrders.filter((order) => {
      if (bounds.startMs !== null && bounds.endMs !== null) {
        if (
          order.createTimeMs < bounds.startMs ||
          order.createTimeMs > bounds.endMs
        ) {
          return false;
        }
      }
      if (params.tradeType !== "ALL" && order.tradeType !== params.tradeType) {
        return false;
      }
      if (
        params.status &&
        params.status !== "ALL" &&
        order.statusCategory !== params.status
      ) {
        return false;
      }
      if (
        params.bank &&
        params.bank.trim() !== "" &&
        !order.payMethodName
          .toLowerCase()
          .includes(params.bank.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });

    const sellCount = filtered.filter((o) => o.tradeType === "SELL").length;
    const buyCount = filtered.filter((o) => o.tradeType === "BUY").length;
    const completedCount = filtered.filter(
      (o) => o.statusCategory === "COMPLETED"
    ).length;
    const cancelledCount = filtered.filter(
      (o) => o.statusCategory === "CANCELLED"
    ).length;
    const appealCount = filtered.filter(
      (o) => o.statusCategory === "IN_APPEAL"
    ).length;
    const inProgressCount = filtered.filter(
      (o) => o.statusCategory === "IN_PROGRESS"
    ).length;

    const startIndex = (params.page - 1) * params.limit;
    const pagedItems = filtered.slice(startIndex, startIndex + params.limit);

    return {
      items: pagedItems,
      totalCount: filtered.length,
      sellCount,
      buyCount,
      completedCount,
      cancelledCount,
      appealCount,
      inProgressCount,
      availableDates,
    };
  }

  // =========================================================================
  // SISTEMA DE CONTROL POR JORNADAS (TURNOS) Y CONSOLIDACIÓN 11:59:59 PM VET
  // =========================================================================

  /**
   * Consolida todas las jornadas cerradas (`ShiftClosure`) de una fecha `dateIsoVet`
   * en el registro `DailyTotalClosure` del día.
   */
  public static async consolidateDayClosures(
    userId: string,
    dateIsoVet: string
  ): Promise<DailyTotalClosureDto | null> {
    const dayShifts = await SupabaseVaultRepository.getShiftClosuresByDate(
      userId,
      dateIsoVet
    );
    if (dayShifts.length === 0) {
      return null;
    }

    const taxConfig = await SupabaseVaultRepository.getUserTaxConfig(userId);
    const lastShift = dayShifts[dayShifts.length - 1];
    const effectiveBadge =
      lastShift?.merchantBadge ?? taxConfig.merchantBadge;
    const badgeMeta = MERCHANT_BADGE_META[effectiveBadge];

    const dateLabelVet = formatDateIsoVe(dateIsoVet);
    const monthIsoVet = dateIsoVet.slice(0, 7);

    const mergedOrders = mergeChronologicalOrders(
      dayShifts.map((s) => s.orders)
    );

    const periodLabel = `Cierre Total del Día: ${dateLabelVet} (${dayShifts.length} ${dayShifts.length === 1 ? "jornada" : "jornadas"})`;

    const summary = buildAggregatedSummaryFromClosures({
      summaries: dayShifts.map((s) => s.summary),
      orders: mergedOrders,
      period: "DAY",
      periodLabel,
      badge: effectiveBadge,
      seniatTaxPercent: taxConfig.seniatTaxPercent,
    });

    const shiftsMeta: ShiftDigestMetaDto[] = dayShifts.map((s) => ({
      id: s.id,
      shiftNumber: s.shiftNumber,
      startTimeVetLabel: s.startTimeVetLabel,
      endTimeVetLabel: s.endTimeVetLabel,
      closedBy: s.closedBy,
      merchantBadge: s.merchantBadge,
      merchantBadgeLabel: s.merchantBadgeLabel,
      totalOrdersCount: s.orders.length,
      completedOrdersCount: s.summary.reconciledOrdersCount,
      totalVolumeUsdt: s.summary.totalVolumeUsdt,
      netProfitUsdt: s.summary.netProfitUsdt,
      netProfitVes: s.summary.netProfitVes,
    }));

    const id = `dtot_${userId}_${dateIsoVet}`;
    const executedAtVet =
      lastShift?.closedBy === "AUTO_2359"
        ? "23:59:59 VET (Auto-Cierre)"
        : `${lastShift?.endTimeVetLabel ?? "23:59:59"} VET`;

    const dailyTotalClosure: DailyTotalClosureDto = {
      id,
      userId,
      dateIsoVet,
      monthIsoVet,
      dateLabelVet,
      executedAtVet,
      shiftsCount: dayShifts.length,
      merchantBadge: effectiveBadge,
      merchantBadgeLabel: badgeMeta.label,
      summary,
      shiftsMeta,
      orders: mergedOrders,
      updatedAtIso: new Date().toISOString(),
    };

    const hashPayload = [
      userId,
      dateIsoVet,
      String(dayShifts.length),
      String(summary.reconciledOrdersCount),
      summary.totalVolumeUsdt,
      summary.grossProfitVes,
      summary.netProfitVes,
    ].join("|");
    const integrityHashSha256 = crypto
      .createHash("sha256")
      .update(hashPayload)
      .digest("hex");

    await SupabaseVaultRepository.saveDailyTotalClosure(
      dailyTotalClosure,
      integrityHashSha256
    );

    return dailyTotalClosure;
  }

  /**
   * Auto-cierre 23:59 desactivado: las jornadas permanecen abiertas (incluso varios días)
   * hasta que el usuario presione manualmente «Cerrar Jornada».
   * Se conserva el método como no-op por compatibilidad.
   */
  public static async ensurePendingDailyClosuresConsolidated(
    _userId: string,
    _forceCloseIf2359Today: boolean = false
  ): Promise<void> {
    // Intencionalmente vacío: sin auto-cierre nocturno ni lecturas masivas de cierres en cada request
  }

  private static async closeShiftInternal(
    userId: string,
    activeShift: ActiveShiftDto,
    options?: {
      readonly forcedEndMs?: number;
      readonly closedBy?: "MANUAL" | "AUTO_2359";
    }
  ): Promise<ShiftClosureDto> {
    const shiftEndTimeMs = Math.max(
      activeShift.shiftStartTimeMs,
      options?.forcedEndMs ?? Date.now()
    );

    const endTsInfo = formatVetOrderTimestamp(shiftEndTimeMs);
    const isMultiDay = endTsInfo.dateIso !== activeShift.dateIsoVet;

    const [allSynced, taxConfig, existingEndDayShifts] = await Promise.all([
      this.syncBinanceRange(
        userId,
        activeShift.shiftStartTimeMs,
        shiftEndTimeMs,
        { startMs: activeShift.shiftStartTimeMs, endMs: shiftEndTimeMs }
      ),
      SupabaseVaultRepository.getUserTaxConfig(userId),
      SupabaseVaultRepository.getShiftClosuresByDate(userId, endTsInfo.dateIso),
    ]);

    // Filtrar estrictamente órdenes dentro del intervalo [shiftStartTimeMs, shiftEndTimeMs]
    const shiftOrders = allSynced.filter(
      (o) =>
        o.createTimeMs >= activeShift.shiftStartTimeMs &&
        o.createTimeMs <= shiftEndTimeMs
    );

    const startTimeVetLabel = isMultiDay
      ? `${activeShift.dateLabelVet} ${activeShift.startTimeVetLabel}`
      : activeShift.startTimeVetLabel;
    const endTimeVetLabel = isMultiDay
      ? `${endTsInfo.dateLabel} ${endTsInfo.timeLabel}`
      : endTsInfo.timeLabel;

    const effectiveShiftNumber = isMultiDay
      ? existingEndDayShifts.length + 1
      : activeShift.shiftNumber;

    const effectiveBadge = activeShift.merchantBadge || taxConfig.merchantBadge;
    const badgeMeta = MERCHANT_BADGE_META[effectiveBadge];

    const periodLabel = isMultiDay
      ? `Cierre Jornada #${effectiveShiftNumber} (${startTimeVetLabel} → ${endTimeVetLabel} VET)`
      : `Cierre Jornada #${effectiveShiftNumber} (${endTsInfo.dateLabel} · ${startTimeVetLabel} - ${endTimeVetLabel} VET)`;

    const summary = calculateVueltaSummary({
      orders: shiftOrders,
      period: "TODAY",
      periodLabel,
      method: "FIFO",
      badge: effectiveBadge,
      seniatTaxPercent: taxConfig.seniatTaxPercent,
    });

    const closure: ShiftClosureDto = {
      id: `shf_${endTsInfo.dateIso}_j${effectiveShiftNumber}_${activeShift.shiftStartTimeMs}`,
      userId,
      dateIsoVet: endTsInfo.dateIso,
      dateLabelVet: endTsInfo.dateLabel,
      shiftNumber: effectiveShiftNumber,
      shiftStartTimeMs: activeShift.shiftStartTimeMs,
      shiftEndTimeMs,
      startTimeVetLabel,
      endTimeVetLabel,
      closedBy: "MANUAL",
      merchantBadge: effectiveBadge,
      merchantBadgeLabel: badgeMeta.label,
      badgeFeePercent: String(badgeMeta.feePercent),
      summary,
      orders: shiftOrders,
      createdAtIso: new Date().toISOString(),
    };

    await SupabaseVaultRepository.saveShiftClosure(closure);
    await SupabaseVaultRepository.clearActiveShift(userId);

    return closure;
  }

  /**
   * Obtiene el estado actual de la jornada y los cierres manuales de la fecha seleccionada.
   */
  public static async getShiftDashboardState(
    userId: string,
    dateIso?: string
  ): Promise<ShiftDashboardStateDto> {
    const targetDateIso =
      dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso)
        ? dateIso
        : getCurrentVetDateIso();
    const targetDateLabel = formatDateIsoVe(targetDateIso);

    const [activeShift, todayShifts] = await Promise.all([
      SupabaseVaultRepository.getActiveShift(userId),
      SupabaseVaultRepository.getShiftClosuresByDate(userId, targetDateIso),
    ]);

    return {
      activeShift,
      selectedDateIsoVet: targetDateIso,
      selectedDateLabelVet: targetDateLabel,
      nextShiftNumber: todayShifts.length + 1,
      todayShifts,
      todayTotalClosure: null,
    };
  }

  /**
   * Inicia una nueva jornada en `Date.now()` (hora America/Caracas), empezando en 0.00.
   * Permanece abierta hasta que el usuario presione manualmente «Cerrar Jornada».
   */
  public static async startShift(
    userId: string
  ): Promise<ShiftDashboardStateDto> {
    const existingActive = await SupabaseVaultRepository.getActiveShift(userId);
    if (existingActive) {
      return this.getShiftDashboardState(userId, getCurrentVetDateIso());
    }

    const nowMs = Date.now();
    const nowVet = formatVetOrderTimestamp(nowMs);
    const [todayShifts, taxConfig] = await Promise.all([
      SupabaseVaultRepository.getShiftClosuresByDate(userId, nowVet.dateIso),
      SupabaseVaultRepository.getUserTaxConfig(userId),
    ]);

    const shiftNumber = todayShifts.length + 1;
    const newShift: ActiveShiftDto = {
      shiftId: `act_${nowVet.dateIso}_j${shiftNumber}_${nowMs}`,
      userId,
      dateIsoVet: nowVet.dateIso,
      dateLabelVet: nowVet.dateLabel,
      shiftNumber,
      shiftStartTimeMs: nowMs,
      startTimeVetLabel: nowVet.timeLabel,
      merchantBadge: taxConfig.merchantBadge,
    };

    await SupabaseVaultRepository.saveActiveShift(newShift);
    return this.getShiftDashboardState(userId, nowVet.dateIso);
  }

  /**
   * Cierra manualmente la jornada actual en `Date.now()`, guarda el `ShiftClosure`
   * (sin alterar el registro contable diario/mensual) y deja el tablero en 0.00.
   */
  public static async closeShift(userId: string): Promise<{
    readonly closure: ShiftClosureDto | null;
    readonly state: ShiftDashboardStateDto;
  }> {
    const activeShift = await SupabaseVaultRepository.getActiveShift(userId);
    if (!activeShift) {
      const state = await this.getShiftDashboardState(userId);
      return { closure: null, state };
    }

    const closure = await this.closeShiftInternal(userId, activeShift, {
      forcedEndMs: Date.now(),
      closedBy: "MANUAL",
    });

    const state = await this.getShiftDashboardState(
      userId,
      closure.dateIsoVet
    );
    return { closure, state };
  }

  /**
   * Cron de auto-cierre desactivado: las jornadas ahora cierran únicamente de forma manual.
   */
  public static async runCronDailyCloseAllUsers(): Promise<{
    readonly processedUsers: number;
    readonly executedAtVet: string;
  }> {
    const nowVet = formatVetOrderTimestamp(Date.now());
    return {
      processedUsers: 0,
      executedAtVet: `${nowVet.dateTimeLabel} (-4:00 UTC)`,
    };
  }

  /**
   * Construye el reporte completo de:
   * - `SHIFT`: cierre manual individual de una jornada (`ShiftClosure`)
   * - `DAY`: reporte contable calendario de todas las transacciones del día VET (00:00:00–23:59:59)
   * - `MONTH`: libro contable/fiscal mensual de todas las transacciones del mes VET (con tabla día por día)
   */
  public static async buildClosingReport(params: {
    readonly userId: string;
    readonly scope: "DAY" | "MONTH" | "SHIFT";
    readonly date?: string;
    readonly month?: string;
    readonly shiftId?: string;
  }): Promise<ClosingReportData> {
    const taxConfig = await SupabaseVaultRepository.getUserTaxConfig(
      params.userId
    );
    const nowVet = formatVetOrderTimestamp(Date.now());
    const generatedAtVet = `${nowVet.dateTimeLabel} (-4:00 UTC)`;

    // 1. Reporte de Cierre Manual de Jornada Individual (SHIFT)
    if (params.scope === "SHIFT" && params.shiftId) {
      const shiftClosure = await SupabaseVaultRepository.getShiftClosureById(
        params.userId,
        params.shiftId
      );
      if (shiftClosure) {
        let effectiveOrders = shiftClosure.orders;
        const hasPendingOrders = effectiveOrders.some(
          (o) =>
            o.statusCategory === "IN_PROGRESS" ||
            o.statusCategory === "IN_APPEAL"
        );

        // Si al cerrar la jornada había órdenes en curso/apelación, refrescar su estado final en Binance
        if (hasPendingOrders && shiftClosure.shiftEndTimeMs >= shiftClosure.shiftStartTimeMs) {
          try {
            const refreshed = await this.syncBinanceRange(
              params.userId,
              shiftClosure.shiftStartTimeMs,
              shiftClosure.shiftEndTimeMs,
              {
                startMs: shiftClosure.shiftStartTimeMs,
                endMs: shiftClosure.shiftEndTimeMs,
              }
            );
            const filteredRefreshed = refreshed.filter(
              (o) =>
                o.createTimeMs >= shiftClosure.shiftStartTimeMs &&
                o.createTimeMs <= shiftClosure.shiftEndTimeMs
            );
            if (filteredRefreshed.length >= effectiveOrders.length) {
              effectiveOrders = filteredRefreshed;
            }
          } catch {
            // Mantener las órdenes guardadas si Binance no respondió
          }
        }

        const periodLabel = `Cierre Jornada #${shiftClosure.shiftNumber} — ${shiftClosure.dateLabelVet} (${shiftClosure.startTimeVetLabel} a ${shiftClosure.endTimeVetLabel} VET)`;
        // Recalcular con las reglas vigentes (solo COMPLETED + USDT + VES)
        const recomputedSummary = calculateVueltaSummary({
          orders: effectiveOrders,
          period: "TODAY",
          periodLabel,
          method: "FIFO",
          badge: shiftClosure.merchantBadge,
          seniatTaxPercent: taxConfig.seniatTaxPercent,
        });

        if (hasPendingOrders) {
          await SupabaseVaultRepository.saveShiftClosure({
            ...shiftClosure,
            orders: effectiveOrders,
            summary: recomputedSummary,
          }).catch(() => {});
        }

        const { excludedNonUsdtCount, excludedNonVesCount } =
          countExcludedCompletedOrders(effectiveOrders);

        return {
          scope: "SHIFT",
          periodKey: `${shiftClosure.dateIsoVet}_Jornada_${shiftClosure.shiftNumber}`,
          periodLabel,
          generatedAtVet,
          summary: recomputedSummary,
          orders: effectiveOrders,
          totalShiftsInPeriod: 1,
          excludedNonUsdtCount,
          excludedNonVesCount,
          syncComplete: true,
          incompleteDays: [],
        };
      }
    }

    // 2. Reporte Contable / Libro Fiscal del Mes Completo (MONTH) — Suma exacta día por día (VET)
    if (params.scope === "MONTH") {
      const targetMonth =
        params.month && /^\d{4}-\d{2}$/.test(params.month)
          ? params.month
          : getCurrentVetMonthIso();
      const monthRange = getVetMonthRangeMs(targetMonth);

      const syncedMonth = await this.ensureRangeCompletelySynced(
        params.userId,
        monthRange.startMs,
        monthRange.endMs,
        {
          totalBudgetMs: 46_000,
          maxPagesPerDay: 40,
          concurrency: 3,
          forceRefreshToday: true,
        }
      );

      const monthOrders = syncedMonth.orders.filter(
        (o) =>
          o.createTimeMs >= monthRange.startMs &&
          o.createTimeMs <= monthRange.endMs
      );

      const tempPeriodLabel = `Libro Fiscal Mensual: ${monthRange.labelEs}`;
      const {
        dailyBreakdown,
        summary,
        excludedNonUsdtCount,
        excludedNonVesCount,
      } = buildDailyBreakdownAndMonthlySummary({
        userId: params.userId,
        targetMonth,
        monthOrders,
        periodLabel: tempPeriodLabel,
        badge: taxConfig.merchantBadge,
        seniatTaxPercent: taxConfig.seniatTaxPercent,
      });

      const periodLabel = `Libro Fiscal Mensual: ${monthRange.labelEs} (${monthOrders.length} órdenes · ${dailyBreakdown.length} ${dailyBreakdown.length === 1 ? "día con actividad" : "días con actividad"})`;

      return {
        scope: "MONTH",
        periodKey: targetMonth,
        periodLabel,
        generatedAtVet,
        summary: {
          ...summary,
          periodLabel,
        },
        orders: monthOrders,
        dailyClosures: dailyBreakdown,
        totalShiftsInPeriod: dailyBreakdown.length,
        excludedNonUsdtCount,
        excludedNonVesCount,
        syncComplete: syncedMonth.isComplete,
        incompleteDays: syncedMonth.incompleteDays,
        syncWarning: syncedMonth.warningMessage,
      };
    }

    // 3. Reporte Contable del Día Calendario (DAY) — Todas las transacciones del día VET (00:00:00–23:59:59)
    const targetDate =
      params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
        ? params.date
        : getCurrentVetDateIso();

    const range = getVetDayRangeMs(targetDate);
    const syncedDay = await this.ensureRangeCompletelySynced(
      params.userId,
      range.startMs,
      range.endMs,
      {
        totalBudgetMs: 30_000,
        maxPagesPerDay: 40,
        concurrency: 2,
        forceRefreshToday: true,
      }
    );
    const periodOrders = syncedDay.orders.filter(
      (o) => o.createTimeMs >= range.startMs && o.createTimeMs <= range.endMs
    );
    const periodLabel = `Cierre Diario: ${range.labelEs} (00:00:00 - 23:59:59 VET)`;
    const summary = calculateVueltaSummary({
      orders: periodOrders,
      period: "DAY",
      periodLabel,
      method: "FIFO",
      badge: taxConfig.merchantBadge,
      seniatTaxPercent: taxConfig.seniatTaxPercent,
    });
    const { excludedNonUsdtCount, excludedNonVesCount } =
      countExcludedCompletedOrders(periodOrders);

    return {
      scope: "DAY",
      periodKey: targetDate,
      periodLabel,
      generatedAtVet,
      summary,
      orders: periodOrders,
      excludedNonUsdtCount,
      excludedNonVesCount,
      syncComplete: syncedDay.isComplete,
      incompleteDays: syncedDay.incompleteDays,
      syncWarning: syncedDay.warningMessage,
    };
  }

  /**
   * Actas de cierre diario guardadas y estado de la Bóveda API del usuario.
   */
  public static async getDailyClosings(userId: string): Promise<{
    readonly monthGrossUsdt: string;
    readonly monthGrossVes: string;
    readonly monthSeniatTax16Usdt: string;
    readonly monthSeniatTax16Ves: string;
    readonly monthNetFreeUsdt: string;
    readonly monthNetFreeVes: string;
    readonly closings: readonly DailyClosingActaDto[];
    readonly vaultStatus: {
      readonly isConfigured: boolean;
      readonly label: string;
      readonly apiKeyMasked: string;
      readonly isReadOnlyVerified: boolean;
      readonly withdrawalsBlocked: boolean;
      readonly spotTradingBlocked: boolean;
    };
  }> {
    const [closings, credential] = await Promise.all([
      SupabaseVaultRepository.getUserClosings(userId),
      SupabaseVaultRepository.getBinanceCredential(userId),
    ]);

    let grossUsdt = new Decimal(0);
    let grossVes = new Decimal(0);
    let taxUsdt = new Decimal(0);
    let taxVes = new Decimal(0);
    let netUsdt = new Decimal(0);
    let netVes = new Decimal(0);

    for (const c of closings) {
      grossUsdt = grossUsdt.plus(parseSafeDecimal(c.grossProfitUsdt));
      grossVes = grossVes.plus(parseSafeDecimal(c.grossProfitVes));
      taxUsdt = taxUsdt.plus(parseSafeDecimal(c.seniatTax16Usdt));
      taxVes = taxVes.plus(parseSafeDecimal(c.seniatTax16Ves));
      netUsdt = netUsdt.plus(parseSafeDecimal(c.netFreeProfitUsdt));
      netVes = netVes.plus(parseSafeDecimal(c.netFreeProfitVes));
    }

    return {
      monthGrossUsdt: formatDecimalMoney(grossUsdt),
      monthGrossVes: formatDecimalMoney(grossVes),
      monthSeniatTax16Usdt: formatDecimalMoney(taxUsdt),
      monthSeniatTax16Ves: formatDecimalMoney(taxVes),
      monthNetFreeUsdt: formatDecimalMoney(netUsdt),
      monthNetFreeVes: formatDecimalMoney(netVes),
      closings,
      vaultStatus: {
        isConfigured: Boolean(credential),
        label: credential ? credential.label : "Sin cuenta vinculada",
        apiKeyMasked: credential
          ? credential.apiKeyMasked
          : "Sin llave API conectada",
        isReadOnlyVerified: true,
        withdrawalsBlocked: true,
        spotTradingBlocked: true,
      },
    };
  }

  public static async saveBinanceVaultCredentials(params: {
    readonly userId: string;
    readonly label: string;
    readonly apiKey: string;
    readonly apiSecret: string;
  }) {
    const encrypted = encryptBinanceCredentials(
      params.apiKey,
      params.apiSecret
    );

    await SupabaseVaultRepository.saveBinanceCredential({
      userId: params.userId,
      label: params.label,
      apiKeyMasked: encrypted.apiKeyMasked,
      apiKeyEncrypted: encrypted.apiKeyEncrypted,
      apiSecretEncrypted: encrypted.apiSecretEncrypted,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      isReadOnlyVerified: true,
      updatedAt: new Date().toISOString(),
    });

    this.lastSyncTimestampByUser.delete(params.userId);
    this.inFlightSyncByUser.delete(params.userId);

    return {
      label: params.label,
      apiKeyMasked: encrypted.apiKeyMasked,
      encryptionAlgorithm: "AES-256-GCM",
      isReadOnlyVerified: true,
      withdrawalsBlocked: true,
      spotTradingBlocked: true,
      updatedAtVet: formatVetOrderTimestamp(Date.now()).timeLabel,
    };
  }

  public static async unlinkBinanceVaultCredentials(userId: string) {
    this.lastSyncTimestampByUser.delete(userId);
    this.inFlightSyncByUser.delete(userId);
    await SupabaseVaultRepository.deleteBinanceCredentialAndOrders(userId);

    return {
      unlinked: true,
      updatedAtVet: formatVetOrderTimestamp(Date.now()).timeLabel,
    };
  }

  public static async getVenezuelanBanksMonitor(
    amount: number = 5000
  ): Promise<readonly BankLiveMonitorDto[]> {
    return BinanceP2PLiveService.getLiveBrechas(amount);
  }

  public static async getMerchantBadgeConfig(
    userId: string
  ): Promise<MerchantBadgeConfigDto> {
    return SupabaseVaultRepository.getMerchantBadgeConfig(userId);
  }

  public static async updateMerchantBadgeConfig(
    userId: string,
    badge: MerchantBadgeType
  ): Promise<MerchantBadgeConfigDto> {
    return SupabaseVaultRepository.saveMerchantBadgeConfig(userId, badge);
  }

  public static async getUserTaxConfig(userId: string) {
    return SupabaseVaultRepository.getUserTaxConfig(userId);
  }

  public static async updateUserTaxConfig(
    userId: string,
    input: { seniatTaxPercent: number; makerFeePercent: number }
  ) {
    await SupabaseVaultRepository.saveUserTaxConfig(userId, input);
    return SupabaseVaultRepository.getUserTaxConfig(userId);
  }
}
