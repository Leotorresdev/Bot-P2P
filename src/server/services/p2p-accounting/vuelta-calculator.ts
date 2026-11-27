import {
  MERCHANT_BADGE_META,
  type DailyTotalClosureDto,
  type LotMethod,
  type MerchantBadgeType,
  type P2POrderRowDto,
  type PeriodFilter,
  type PnlSummaryDto,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import {
  UTC_MINUS_4_OFFSET_MS,
  formatDateIsoVe,
  getCurrentVetDateIso,
  getCurrentVetMonthIso,
  getVetDayRangeMs,
  getVetMonthRangeMs,
  getVetNDaysRangeMs,
} from "@/lib/timezone-utc4";
import {
  Decimal,
  formatDecimalMoney,
  parseSafeDecimal,
} from "./decimal-utils";
import {
  countExcludedCompletedOrders,
  deduplicateOrdersByNumber,
  evaluateOrderCalculationEligibility,
} from "./order-eligibility";

export interface WeightedOrderTotals {
  readonly totalSoldUsdt: Decimal;
  readonly totalSoldVes: Decimal;
  readonly totalBoughtUsdt: Decimal;
  readonly totalBoughtVes: Decimal;
  /** Promedio de precio de venta = Σ(órdenes de venta en Bs) ÷ Σ(órdenes de venta en USDT) */
  readonly activeAvgSell: Decimal;
  /** Promedio de precio de compra = Σ(órdenes de compra en Bs) ÷ Σ(órdenes de compra en USDT) */
  readonly activeAvgBuy: Decimal;
  readonly completedSellCount: number;
  readonly completedBuyCount: number;
  readonly cancelledCount: number;
  readonly appealCount: number;
  readonly inProgressCount: number;
  readonly uniqueOrdersCount: number;
}

/**
 * Calcula los totales exactos en Bs y USDT y los promedios ponderados exactos
 * a partir de las órdenes deduplicadas por `orderNumber` y filtradas por elegibilidad (`COMPLETED + USDT + VES`):
 * - Promedio de precio de compra = Σ(órdenes de compra en Bs) ÷ Σ(órdenes de compra en USDT)
 * - Promedio de precio de venta  = Σ(órdenes de venta en Bs)  ÷ Σ(órdenes de venta en USDT)
 */
export function calculateWeightedOrderTotals(
  orders: readonly P2POrderRowDto[]
): WeightedOrderTotals {
  const uniqueOrders = deduplicateOrdersByNumber(orders);

  let totalSoldUsdt = new Decimal(0);
  let totalSoldVes = new Decimal(0);
  let totalBoughtUsdt = new Decimal(0);
  let totalBoughtVes = new Decimal(0);

  let completedSellCount = 0;
  let completedBuyCount = 0;
  let cancelledCount = 0;
  let appealCount = 0;
  let inProgressCount = 0;

  for (const order of uniqueOrders) {
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

    if (!eligibility.included) {
      continue;
    }

    const amt = parseSafeDecimal(order.amountUsdt);
    const price = parseSafeDecimal(order.unitPriceVes);
    const parsedTotal = parseSafeDecimal(order.totalPriceVes);
    const total = parsedTotal.gt(0) ? parsedTotal : amt.mul(price);

    if (order.tradeType === "SELL") {
      completedSellCount += 1;
      totalSoldUsdt = totalSoldUsdt.plus(amt);
      totalSoldVes = totalSoldVes.plus(total);
    } else if (order.tradeType === "BUY") {
      completedBuyCount += 1;
      totalBoughtUsdt = totalBoughtUsdt.plus(amt);
      totalBoughtVes = totalBoughtVes.plus(total);
    }
  }

  const activeAvgSell = totalSoldUsdt.gt(0)
    ? totalSoldVes.div(totalSoldUsdt)
    : new Decimal(0);
  const activeAvgBuy = totalBoughtUsdt.gt(0)
    ? totalBoughtVes.div(totalBoughtUsdt)
    : new Decimal(0);

  return {
    totalSoldUsdt,
    totalSoldVes,
    totalBoughtUsdt,
    totalBoughtVes,
    activeAvgSell,
    activeAvgBuy,
    completedSellCount,
    completedBuyCount,
    cancelledCount,
    appealCount,
    inProgressCount,
    uniqueOrdersCount: uniqueOrders.length,
  };
}

/**
 * Motor puro de cálculo por "Vuelta" y Brecha de Puntos basado en promedios ponderados exactos
 * de Venta y Compra y comisión de Insignia (Bronce/Plata/Oro) sobre Volumen Total.
 * Solo las órdenes COMPLETED en USDT/VES (deduplicadas por `orderNumber`) suman al volumen y ganancias.
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
  const totals = calculateWeightedOrderTotals(orders);

  const {
    totalSoldUsdt,
    totalSoldVes,
    totalBoughtUsdt,
    totalBoughtVes,
    activeAvgSell,
    activeAvgBuy,
    completedSellCount,
    completedBuyCount,
    cancelledCount,
    appealCount,
    inProgressCount,
    uniqueOrdersCount,
  } = totals;

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
    totalOrdersInPeriod: uniqueOrdersCount,
    reconciledOrdersCount: totalCompletedCount,

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
 * Agrega una colección de resúmenes de cierres (por ejemplo, todos los `DailyTotalClosure`
 * de un mes para el Cierre Mensual, o todos los `ShiftClosure` de un día):
 * - Los totales en Bs/USDT y los promedios ponderados (`Σ Bs ÷ Σ USDT`) se calculan
 *   directamente desde las órdenes deduplicadas (cuando están presentes) para eliminar
 *   deriva de redondeo y doble conteo entre cierres.
 * - Las ganancias brutas/netas y comisiones se agregan día por día (anti falso negativo cambiario).
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
  const hasRawOrders = orders.length > 0;
  const orderTotals = hasRawOrders ? calculateWeightedOrderTotals(orders) : null;

  let summarySoldUsdt = new Decimal(0);
  let summarySoldVes = new Decimal(0);
  let summaryBoughtUsdt = new Decimal(0);
  let summaryBoughtVes = new Decimal(0);
  let vueltaVolumeUsdt = new Decimal(0);

  let grossProfitVes = new Decimal(0);
  let grossProfitUsdt = new Decimal(0);
  let volumeCommissionUsdt = new Decimal(0);
  let volumeCommissionBs = new Decimal(0);
  let netProfitUsdt = new Decimal(0);
  let netProfitBs = new Decimal(0);

  let summarySellCount = 0;
  let summaryBuyCount = 0;
  let summaryCancelledCount = 0;
  let summaryAppealCount = 0;
  let summaryInProgressCount = 0;

  for (const s of summaries) {
    summarySoldUsdt = summarySoldUsdt.plus(parseSafeDecimal(s.totalSoldUsdt));
    summarySoldVes = summarySoldVes.plus(parseSafeDecimal(s.totalSoldVes));
    summaryBoughtUsdt = summaryBoughtUsdt.plus(
      parseSafeDecimal(s.totalBoughtUsdt)
    );
    summaryBoughtVes = summaryBoughtVes.plus(
      parseSafeDecimal(s.totalBoughtVes)
    );
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

    summarySellCount += s.completedSellCount;
    summaryBuyCount += s.completedBuyCount;
    summaryCancelledCount += s.cancelledCount;
    summaryAppealCount += s.appealCount;
    summaryInProgressCount += s.inProgressCount;
  }

  // Usar totales exactos desde órdenes deduplicadas cuando estén disponibles (evita redondeo acumulado y doble conteo)
  const totalSoldUsdt = orderTotals ? orderTotals.totalSoldUsdt : summarySoldUsdt;
  const totalSoldVes = orderTotals ? orderTotals.totalSoldVes : summarySoldVes;
  const totalBoughtUsdt = orderTotals
    ? orderTotals.totalBoughtUsdt
    : summaryBoughtUsdt;
  const totalBoughtVes = orderTotals
    ? orderTotals.totalBoughtVes
    : summaryBoughtVes;
  const totalVolumeUsdt = totalSoldUsdt.plus(totalBoughtUsdt);

  const completedSellCount = orderTotals
    ? orderTotals.completedSellCount
    : summarySellCount;
  const completedBuyCount = orderTotals
    ? orderTotals.completedBuyCount
    : summaryBuyCount;
  const cancelledCount = orderTotals
    ? orderTotals.cancelledCount
    : summaryCancelledCount;
  const appealCount = orderTotals
    ? orderTotals.appealCount
    : summaryAppealCount;
  const inProgressCount = orderTotals
    ? orderTotals.inProgressCount
    : summaryInProgressCount;
  const totalOrdersInPeriod = orderTotals
    ? orderTotals.uniqueOrdersCount
    : orders.length;

  // Promedio de precio de venta = Σ(órdenes de venta en Bs) ÷ Σ(órdenes de venta en USDT)
  // Promedio de precio de compra = Σ(órdenes de compra en Bs) ÷ Σ(órdenes de compra en USDT)
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
    totalOrdersInPeriod,
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

/**
 * Enumera todas las fechas calendario VET (`YYYY-MM-DD`) cubiertas por `[startMs, endMs]`,
 * acotadas al día actual VET (no sincroniza días futuros).
 */
export function enumerateVetDateIsosInRange(
  startMs: number,
  endMs: number,
  nowMs: number = Date.now()
): string[] {
  const effectiveEndMs = Math.min(endMs, nowMs);
  if (effectiveEndMs < startMs) return [];

  const dates: string[] = [];
  const startVet = new Date(startMs + UTC_MINUS_4_OFFSET_MS);
  const endVet = new Date(effectiveEndMs + UTC_MINUS_4_OFFSET_MS);

  const cursor = new Date(
    Date.UTC(
      startVet.getUTCFullYear(),
      startVet.getUTCMonth(),
      startVet.getUTCDate()
    )
  );
  const endCursor = new Date(
    Date.UTC(endVet.getUTCFullYear(), endVet.getUTCMonth(), endVet.getUTCDate())
  );

  while (cursor.getTime() <= endCursor.getTime()) {
    const yyyy = cursor.getUTCFullYear();
    const mm = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(cursor.getUTCDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
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

  const uniqueMonthOrders = deduplicateOrdersByNumber(monthOrders);

  const ordersByDay = new Map<string, P2POrderRowDto[]>();
  for (const order of uniqueMonthOrders) {
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
          orders: uniqueMonthOrders,
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
    countExcludedCompletedOrders(uniqueMonthOrders);

  return {
    dailyBreakdown,
    summary,
    excludedNonUsdtCount,
    excludedNonVesCount,
  };
}

export function resolvePeriodBounds(params: {
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

  if (period === "MONTH" || (month && /^\d{4}-\d{2}$/.test(month))) {
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

  const todayIso = getCurrentVetDateIso();
  const todayRange = getVetDayRangeMs(todayIso);
  return {
    startMs: todayRange.startMs,
    endMs: todayRange.endMs,
    periodLabel: `Hoy ${todayRange.labelEs} (-4:00 UTC)`,
  };
}
