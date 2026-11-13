import "server-only";
import Decimal from "decimal.js";
import {
  MERCHANT_BADGE_META,
  type AveragePriceMode,
  type BankLiveMonitorDto,
  type DailyClosingActaDto,
  type LotMethod,
  type MerchantBadgeConfigDto,
  type MerchantBadgeType,
  type OrderStatusCategory,
  type OrderStatusFilter,
  type P2POrderRowDto,
  type PeriodFilter,
  type PnlSummaryDto,
  type TradeTypeFilter,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import {
  formatVetOrderTimestamp,
  getCurrentVetDateIso,
  getCurrentVetMonthIso,
  getVetDayRangeMs,
  getVetMonthRangeMs,
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
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api-gcp.binance.com",
] as const;

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
  readonly scope: "DAY" | "MONTH";
  readonly periodKey: string;
  readonly periodLabel: string;
  readonly generatedAtVet: string;
  readonly summary: PnlSummaryDto;
  readonly orders: readonly P2POrderRowDto[];
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
 * Conserva la precisión exacta recibida de Binance asegurando al menos `minDecimals` decimales.
 */
export function formatExactDecimalString(
  raw: string | undefined,
  minDecimals: number = 2
): string {
  try {
    const cleaned = (raw ?? "0").trim() || "0";
    const dec = new Decimal(cleaned);
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
    rawStr.includes("CANCEL") ||
    rawStr === "6" ||
    rawStr === "7"
  ) {
    const normalizedName =
      rawStr === "6"
        ? "CANCELLED"
        : rawStr === "7"
          ? "CANCELLED_BY_SYSTEM"
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

  const amountDec = new Decimal(rec.amountUsdt || "0");
  const priceDec = new Decimal(rec.unitPriceVes || "0");
  const totalStr =
    rec.totalPriceVes && new Decimal(rec.totalPriceVes).gt(0)
      ? rec.totalPriceVes
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
 * Consulta `/sapi/v1/c2c/orderMatch/listUserOrderHistory` paginando 100 en 100
 * sobre todas las sub-ventanas (<= 28 días) para no omitir ninguna orden del período.
 */
async function fetchBinanceOrdersInRange(
  apiKey: string,
  apiSecret: string,
  tradeType: "BUY" | "SELL",
  startMs: number,
  endMs: number,
  maxPagesPerWindow: number = 100
): Promise<{
  readonly success: boolean;
  readonly data: readonly BinanceC2COrderItem[];
  readonly error?: string;
}> {
  const windows = resolveSyncWindows(startMs, endMs);
  if (windows.length === 0) {
    return { success: true, data: [] };
  }

  let lastError = "";

  for (const host of BINANCE_HOSTS) {
    try {
      const accumulated: BinanceC2COrderItem[] = [];
      let hostSucceeded = true;

      for (const win of windows) {
        const windowOrders: BinanceC2COrderItem[] = [];
        let page = 1;

        while (page <= maxPagesPerWindow) {
          const timestamp = Date.now();
          // Mantener orden exacto de parámetros para firma HMAC-SHA256 en Binance SAPI
          const queryString = `tradeType=${tradeType}&startTimestamp=${win.startMs}&endTimestamp=${win.endMs}&page=${page}&rows=100&recvWindow=60000&timestamp=${timestamp}`;
          const signature = signBinanceQuery(queryString, apiSecret);

          const res = await fetch(
            `${host}/sapi/v1/c2c/orderMatch/listUserOrderHistory?${queryString}&signature=${signature}`,
            {
              method: "GET",
              headers: {
                "X-MBX-APIKEY": apiKey,
              },
              signal: AbortSignal.timeout(15000),
            }
          );

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
            const items = Array.isArray(json.data) ? json.data : [];
            windowOrders.push(...items);

            if (
              items.length === 0 ||
              items.length < 100 ||
              (typeof json.total === "number" &&
                windowOrders.length >= json.total)
            ) {
              break;
            }
            page++;
          } else {
            lastError = json.message || json.msg || `HTTP ${res.status}`;
            hostSucceeded = false;
            break;
          }
        }

        if (!hostSucceeded) break;
        accumulated.push(...windowOrders);
      }

      if (hostSucceeded) {
        return { success: true, data: accumulated };
      }

      console.warn(`[Binance SAPI C2C] Host ${host} respondió:`, lastError);

      if (
        lastError.includes("-2008") ||
        lastError.includes("-2014") ||
        lastError.includes("-1022")
      ) {
        break;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[Binance SAPI C2C] Falló host ${host}:`, lastError);
    }
  }

  return { success: false, data: [], error: lastError };
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
    const statusInfo = mapBinanceOrderStatus(o.orderStatus);
    const amountDec = new Decimal(o.amount || "0");
    const unitPriceDec = new Decimal(o.unitPrice || "0");
    const totalDec = o.totalPrice
      ? new Decimal(o.totalPrice)
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
 * Solo las órdenes COMPLETED suman al volumen y a las ganancias.
 */
export function calculateVueltaSummary(params: {
  readonly orders: readonly P2POrderRowDto[];
  readonly period: PeriodFilter;
  readonly periodLabel: string;
  readonly method: LotMethod;
  readonly avgMode: AveragePriceMode;
  readonly badge: MerchantBadgeType;
  readonly seniatTaxPercent?: number;
}): PnlSummaryDto {
  const {
    orders,
    period,
    periodLabel,
    method,
    avgMode,
    badge,
    seniatTaxPercent = 16,
  } = params;

  const badgeMeta = MERCHANT_BADGE_META[badge];

  let totalSoldUsdt = new Decimal(0);
  let totalSoldVes = new Decimal(0);
  let totalBoughtUsdt = new Decimal(0);
  let totalBoughtVes = new Decimal(0);

  let sumSellUnitPrices = new Decimal(0);
  let sumBuyUnitPrices = new Decimal(0);

  let completedSellCount = 0;
  let completedBuyCount = 0;
  let cancelledCount = 0;
  let appealCount = 0;
  let inProgressCount = 0;

  for (const order of orders) {
    if (order.statusCategory === "CANCELLED") {
      cancelledCount += 1;
      continue;
    }
    if (order.statusCategory === "IN_APPEAL") {
      appealCount += 1;
      continue;
    }
    if (order.statusCategory !== "COMPLETED") {
      inProgressCount += 1;
      continue;
    }

    // Únicamente órdenes COMPLETED suman al volumen y ganancias
    const amt = new Decimal(order.amountUsdt || "0");
    const price = new Decimal(order.unitPriceVes || "0");
    const total = new Decimal(order.totalPriceVes || "0");

    if (order.tradeType === "SELL") {
      completedSellCount += 1;
      totalSoldUsdt = totalSoldUsdt.plus(amt);
      totalSoldVes = totalSoldVes.plus(total);
      sumSellUnitPrices = sumSellUnitPrices.plus(price);
    } else {
      completedBuyCount += 1;
      totalBoughtUsdt = totalBoughtUsdt.plus(amt);
      totalBoughtVes = totalBoughtVes.plus(total);
      sumBuyUnitPrices = sumBuyUnitPrices.plus(price);
    }
  }

  // 1. Precios Promedio Totales
  const avgSellWeighted = totalSoldUsdt.gt(0)
    ? totalSoldVes.div(totalSoldUsdt)
    : new Decimal(0);
  const avgBuyWeighted = totalBoughtUsdt.gt(0)
    ? totalBoughtVes.div(totalBoughtUsdt)
    : new Decimal(0);

  const avgSellSimple =
    completedSellCount > 0
      ? sumSellUnitPrices.div(completedSellCount)
      : new Decimal(0);
  const avgBuySimple =
    completedBuyCount > 0
      ? sumBuyUnitPrices.div(completedBuyCount)
      : new Decimal(0);

  const activeAvgSell = avgMode === "SIMPLE" ? avgSellSimple : avgSellWeighted;
  const activeAvgBuy = avgMode === "SIMPLE" ? avgBuySimple : avgBuyWeighted;

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

  // 4. Ganancia Bruta de la Vuelta
  const grossProfitBs = vueltaVolumeUsdt.mul(brechaPoints);
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

  const totalCompletedCount = completedSellCount + completedBuyCount;

  return {
    period,
    periodLabel,
    method,
    avgMode,
    merchantBadge: badgeMeta.id,
    merchantBadgeLabel: badgeMeta.label,
    badgeFeePercent: String(badgeMeta.feePercent),
    badgeFeeFactor: badgeMeta.feeFactor,

    totalSoldUsdt: formatDecimalMoney(totalSoldUsdt, 2),
    totalSoldVes: formatDecimalMoney(totalSoldVes, 2),
    totalBoughtUsdt: formatDecimalMoney(totalBoughtUsdt, 2),
    totalBoughtVes: formatDecimalMoney(totalBoughtVes, 2),
    totalVolumeUsdt: formatDecimalMoney(totalVolumeUsdt, 2),

    avgSellRateWeightedVes: formatDecimalMoney(avgSellWeighted, 2),
    avgBuyRateWeightedVes: formatDecimalMoney(avgBuyWeighted, 2),
    avgSellRateSimpleVes: formatDecimalMoney(avgSellSimple, 2),
    avgBuyRateSimpleVes: formatDecimalMoney(avgBuySimple, 2),
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

    // Campos compatibles para módulos auxiliares
    netFreeProfitUsdt: netProfitUsdt.toFixed(2),
    netFreeProfitVes: formatDecimalMoney(netProfitBs, 2),
    seniatTax16Usdt: "0.00",
    seniatTax16Ves: "0.00",
    seniatTaxRatePercent: String(seniatTaxPercent),
    makerFeeRatePercent: String(badgeMeta.feePercent),
    exemptCapitalUsdt: formatDecimalMoney(totalBoughtUsdt, 2),
    exemptCapitalVes: formatDecimalMoney(totalBoughtVes, 2),
    currentWacCostVes: activeAvgBuy.toFixed(2),
    availableVaultUsdt: formatDecimalMoney(pendingUsdtDec, 2),
    totalBinanceFeesUsdt: volumeCommissionUsdt.toFixed(2),
    nextClosingTimeVet: "11:59 PM (-4:00 UTC)",
    lastSyncSecondsAgo: 2,
    workingCapitalUsdt: formatDecimalMoney(totalVolumeUsdt, 2),
    workingCapitalVes: formatDecimalMoney(totalSoldVes.plus(totalBoughtVes), 2),
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
    const now = Date.now();
    return {
      startMs: now - 7 * 86_400_000,
      endMs: now + 60_000,
      periodLabel: "Últimos 7 días",
    };
  }

  if (period === "30D") {
    const now = Date.now();
    return {
      startMs: now - 30 * 86_400_000,
      endMs: now + 60_000,
      periodLabel: "Últimos 30 días",
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
  private static readonly lastSyncTimestampByUser = new Map<string, number>();
  private static readonly inFlightSyncByUser = new Map<
    string,
    Promise<readonly P2POrderRowDto[]>
  >();

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
              headers: {
                "X-MBX-APIKEY": apiKey,
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
   * Sincroniza desde Binance un rango específico (ej. Día o Mes completo paginado de 100 en 100)
   * y guarda todas las órdenes (todos los estados/tipos) en la base de datos.
   */
  public static async syncBinanceRange(
    userId: string,
    startMs: number,
    endMs: number
  ): Promise<readonly P2POrderRowDto[]> {
    const credential =
      await SupabaseVaultRepository.getBinanceCredential(userId);
    if (!credential) {
      const stored = await SupabaseVaultRepository.getUserOrders(userId);
      return stored.map(toMirrorOrderDto);
    }

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
        const records = mapRawItemsToStoredRecords(userId, combined);
        await SupabaseVaultRepository.saveUserOrders(userId, records);
        this.lastSyncTimestampByUser.set(userId, Date.now());
      }
    } catch (err) {
      console.error(
        "[P2PAccountingService] Error sincronizando rango desde Binance:",
        err
      );
    }

    const storedAfter = await SupabaseVaultRepository.getUserOrders(userId);
    return storedAfter.map(toMirrorOrderDto);
  }

  /**
   * Obtiene el espejo exacto de órdenes Binance P2P (todos los tipos y estados,
   * orden cronológico idéntico createTime DESC sin agrupar ni alterar).
   */
  public static async getUserOrdersFromVaultOrBinance(
    userId: string,
    forceFresh: boolean = false
  ): Promise<readonly P2POrderRowDto[]> {
    const credential =
      await SupabaseVaultRepository.getBinanceCredential(userId);

    if (!credential) {
      const stored = await SupabaseVaultRepository.getUserOrders(userId);
      return stored.map(toMirrorOrderDto);
    }

    const now = Date.now();
    const lastSync = this.lastSyncTimestampByUser.get(userId) ?? 0;

    if (!forceFresh && now - lastSync < 6000) {
      const cached = await SupabaseVaultRepository.getUserOrders(userId);
      return cached.map(toMirrorOrderDto);
    }

    const activePromise = this.inFlightSyncByUser.get(userId);
    if (activePromise) {
      return activePromise;
    }

    const syncPromise = (async (): Promise<readonly P2POrderRowDto[]> => {
      try {
        const endMs = Date.now() + 60_000;
        const startMs = Date.now() - MAX_BINANCE_WINDOW_MS;
        return await this.syncBinanceRange(userId, startMs, endMs);
      } finally {
        P2PAccountingService.inFlightSyncByUser.delete(userId);
      }
    })();

    this.inFlightSyncByUser.set(userId, syncPromise);
    return syncPromise;
  }

  /**
   * Calcula los KPIs en tiempo real usando el motor por "Vuelta" y Brecha de Puntos
   * con la insignia persistente del usuario.
   */
  public static async getSummary(params: {
    readonly userId: string;
    readonly period: PeriodFilter;
    readonly method: LotMethod;
    readonly avgMode: AveragePriceMode;
    readonly date?: string;
    readonly month?: string;
  }): Promise<PnlSummaryDto> {
    const [allMirrorOrders, taxConfig] = await Promise.all([
      this.getUserOrdersFromVaultOrBinance(params.userId),
      SupabaseVaultRepository.getUserTaxConfig(params.userId),
    ]);

    const bounds = resolvePeriodBounds({
      period: params.period,
      date: params.date,
      month: params.month,
    });

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
      avgMode: params.avgMode,
      badge: taxConfig.merchantBadge,
      seniatTaxPercent: taxConfig.seniatTaxPercent,
    });
  }

  /**
   * Devuelve el espejo exacto de órdenes paginado manteniendo el orden cronológico de Binance.
   * No elimina órdenes canceladas ni apeladas salvo que el usuario elija un filtro explícito.
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
    const allOrders = await this.getUserOrdersFromVaultOrBinance(params.userId);

    const dateSet = new Set<string>();
    for (const ord of allOrders) {
      if (ord.dateLabelVet) {
        dateSet.add(ord.dateLabelVet);
      }
    }
    const availableDates = Array.from(dateSet);

    // Filtrado únicamente por parámetros explícitos del usuario (por defecto period="ALL", status="ALL")
    const effectivePeriod: PeriodFilter =
      params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
        ? "DAY"
        : params.month && /^\d{4}-\d{2}$/.test(params.month)
          ? "MONTH"
          : (params.period ?? "ALL");

    const bounds =
      effectivePeriod === "ALL" && !params.date && !params.month
        ? { startMs: null, endMs: null }
        : resolvePeriodBounds({
            period: effectivePeriod,
            date: params.date,
            month: params.month,
          });

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

  /**
   * Construye el reporte completo de Cierre del Día o Cierre del Mes sincronizando
   * todas las páginas de Binance SAPI para el período solicitado.
   */
  public static async buildClosingReport(params: {
    readonly userId: string;
    readonly scope: "DAY" | "MONTH";
    readonly date?: string;
    readonly month?: string;
    readonly avgMode: AveragePriceMode;
  }): Promise<ClosingReportData> {
    const taxConfig = await SupabaseVaultRepository.getUserTaxConfig(
      params.userId
    );

    const range =
      params.scope === "MONTH"
        ? getVetMonthRangeMs(params.month || getCurrentVetMonthIso())
        : getVetDayRangeMs(params.date || getCurrentVetDateIso());

    const periodKey =
      params.scope === "MONTH"
        ? (params.month || getCurrentVetMonthIso())
        : (params.date || getCurrentVetDateIso());

    // Sincronización exhaustiva paginada en bloques <= 28d desde Binance para no omitir ninguna orden
    const allSynced = await this.syncBinanceRange(
      params.userId,
      range.startMs,
      range.endMs
    );

    // Respetar orden cronológico exacto dentro del rango (00:00:00 a 23:59:59 hora Venezuela)
    const periodOrders = allSynced.filter(
      (o) => o.createTimeMs >= range.startMs && o.createTimeMs <= range.endMs
    );

    const periodLabel =
      params.scope === "MONTH"
        ? `Cierre Mensual: ${range.labelEs} (-4:00 UTC)`
        : `Cierre Diario: ${range.labelEs} (00:00:00 - 23:59:59 VET)`;

    const summary = calculateVueltaSummary({
      orders: periodOrders,
      period: params.scope === "MONTH" ? "MONTH" : "DAY",
      periodLabel,
      method: "FIFO",
      avgMode: params.avgMode,
      badge: taxConfig.merchantBadge,
      seniatTaxPercent: taxConfig.seniatTaxPercent,
    });

    const nowVet = formatVetOrderTimestamp(Date.now());

    return {
      scope: params.scope,
      periodKey,
      periodLabel,
      generatedAtVet: `${nowVet.dateTimeLabel} (-4:00 UTC)`,
      summary,
      orders: periodOrders,
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

    const parseNum = (str: string) =>
      new Decimal(str.replace(/,/g, "") || "0");

    for (const c of closings) {
      grossUsdt = grossUsdt.plus(parseNum(c.grossProfitUsdt));
      grossVes = grossVes.plus(parseNum(c.grossProfitVes));
      taxUsdt = taxUsdt.plus(parseNum(c.seniatTax16Usdt));
      taxVes = taxVes.plus(parseNum(c.seniatTax16Ves));
      netUsdt = netUsdt.plus(parseNum(c.netFreeProfitUsdt));
      netVes = netVes.plus(parseNum(c.netFreeProfitVes));
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
