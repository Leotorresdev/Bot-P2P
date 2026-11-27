import test from "node:test";
import assert from "node:assert/strict";
import type { P2POrderRowDto } from "@/features/p2p-ledger/schemas/p2p.schemas";
import { getBinanceAppOrderUsdtDecimal } from "@/lib/format-currency";
import {
  buildAggregatedSummaryFromClosures,
  buildDailyBreakdownAndMonthlySummary,
  calculateVueltaSummary,
  calculateWeightedOrderTotals,
} from "@/server/services/p2p-accounting/vuelta-calculator";
import {
  evaluateOrderCalculationEligibility,
  mapBinanceOrderStatus,
} from "@/server/services/p2p-accounting/order-eligibility";
import { resolvePositiveTotalPriceVes } from "@/server/db/vault/vault-local-store";

function makeOrder(overrides: Partial<P2POrderRowDto>): P2POrderRowDto {
  return {
    orderNumber: overrides.orderNumber ?? "ORD-1",
    advNo: overrides.advNo ?? "ADV-1",
    createTimeMs: overrides.createTimeMs ?? 1_760_000_000_000,
    timeVetLabel: overrides.timeVetLabel ?? "27/11/2026 • 14:00:00",
    dateLabelVet: overrides.dateLabelVet ?? "27/11/2026",
    timeLabelVet: overrides.timeLabelVet ?? "14:00:00",
    dateIsoVet: overrides.dateIsoVet ?? "2026-11-27",
    monthIsoVet: overrides.monthIsoVet ?? "2026-11",
    tradeType: overrides.tradeType ?? "BUY",
    orderStatus: overrides.orderStatus ?? "COMPLETED",
    statusCategory: overrides.statusCategory ?? "COMPLETED",
    statusLabel: overrides.statusLabel ?? "Completada",
    advertisementRole: overrides.advertisementRole ?? "MAKER",
    asset: overrides.asset ?? "USDT",
    fiat: overrides.fiat ?? "VES",
    payMethodName: overrides.payMethodName ?? "Banesco",
    counterPartNickName: overrides.counterPartNickName ?? "Cliente",
    unitPriceVes: overrides.unitPriceVes ?? "100.00",
    amountUsdt: overrides.amountUsdt ?? "100.00",
    totalPriceVes: overrides.totalPriceVes ?? "10000.00",
    commissionUsdt: overrides.commissionUsdt ?? "0.0000",
  };
}

test("Fórmula exacta con 100 USDT (brecha +10 Bs, comisión 0.20 + 0.20): 0 doble descuento y 0 deriva", () => {
  const orders: P2POrderRowDto[] = [
    makeOrder({
      orderNumber: "B100",
      tradeType: "BUY",
      amountUsdt: "100.00",
      unitPriceVes: "1000.00",
      totalPriceVes: "100000.00",
      commissionUsdt: "0.2000",
    }),
    makeOrder({
      orderNumber: "S100",
      tradeType: "SELL",
      amountUsdt: "100.00",
      unitPriceVes: "1010.00",
      totalPriceVes: "101000.00",
      commissionUsdt: "0.2000",
    }),
  ];

  // App Binance: Compra = 99.80 ("Cantidad recibida"), Venta = 100.20 ("Cantidad total")
  assert.equal(getBinanceAppOrderUsdtDecimal(orders[0]!).toFixed(2), "99.80");
  assert.equal(getBinanceAppOrderUsdtDecimal(orders[1]!).toFixed(2), "100.20");

  const summary = calculateVueltaSummary({
    orders,
    period: "DAY",
    periodLabel: "Test 100 USDT",
    method: "FIFO",
    badge: "BRONZE",
    seniatTaxPercent: 16,
  });

  // Volúmenes visibles = exactos app Binance
  assert.equal(summary.totalBoughtUsdt, "99.80");
  assert.equal(summary.totalSoldUsdt, "100.20");
  assert.equal(summary.totalVolumeUsdt, "200.00");
  // Promedios limpios sin comisión
  assert.equal(summary.activeAvgBuyRateVes, "1,000.00");
  assert.equal(summary.activeAvgSellRateVes, "1,010.00");
  assert.equal(summary.brechaPointsVes, "+10.00");
  // Ganancia Bruta exacta (100 * 10 Bs = 1.00 USDT) - Comisión Real (0.40 USDT) = +0.60 USDT exactos
  assert.equal(summary.grossProfitUsdt, "1.00");
  assert.equal(summary.volumeCommissionUsdt, "0.40");
  assert.equal(summary.netProfitUsdt, "0.60");
});

test("Regresión real Jornada 2 (14 órdenes reales Binance con truncado a 2 decimales y comisiones reales)", () => {
  const realOrders: P2POrderRowDto[] = [
    // 9 Compras reales a 1,074.201
    makeOrder({ orderNumber: "22959695393726087168", tradeType: "BUY", totalPriceVes: "47000.00", unitPriceVes: "1074.201", amountUsdt: "43.75", commissionUsdt: "0.1000" }),
    makeOrder({ orderNumber: "22959694982127280128", tradeType: "BUY", totalPriceVes: "20000.00", unitPriceVes: "1074.201", amountUsdt: "18.61", commissionUsdt: "0.0400" }),
    makeOrder({ orderNumber: "22959694647912140800", tradeType: "BUY", totalPriceVes: "20345.366", unitPriceVes: "1074.201", amountUsdt: "18.94", commissionUsdt: "0.0400" }),
    makeOrder({ orderNumber: "22959694514911608832", tradeType: "BUY", totalPriceVes: "21419.567", unitPriceVes: "1074.201", amountUsdt: "19.94", commissionUsdt: "0.0400" }),
    makeOrder({ orderNumber: "22959694182810673152", tradeType: "BUY", totalPriceVes: "28400.00", unitPriceVes: "1074.201", amountUsdt: "26.43", commissionUsdt: "0.0600" }),
    makeOrder({ orderNumber: "22959694072062050304", tradeType: "BUY", totalPriceVes: "24500.00", unitPriceVes: "1074.201", amountUsdt: "22.80", commissionUsdt: "0.0500" }),
    makeOrder({ orderNumber: "22959693827948699648", tradeType: "BUY", totalPriceVes: "73000.00", unitPriceVes: "1074.201", amountUsdt: "67.95", commissionUsdt: "0.1600" }),
    makeOrder({ orderNumber: "22959693745765568512", tradeType: "BUY", totalPriceVes: "20000.00", unitPriceVes: "1074.201", amountUsdt: "18.61", commissionUsdt: "0.0400" }),
    makeOrder({ orderNumber: "22959693594345865216", tradeType: "BUY", totalPriceVes: "55825.00", unitPriceVes: "1074.201", amountUsdt: "51.96", commissionUsdt: "0.1200" }),
    // 5 Ventas reales (4 a 1,083.979 + 1 a 1,085.199) + 1 cancelada
    makeOrder({ orderNumber: "22959692372342476800", tradeType: "SELL", totalPriceVes: "44000.00", unitPriceVes: "1083.979", amountUsdt: "40.59", commissionUsdt: "0.1000" }),
    makeOrder({ orderNumber: "22959691847041363968", tradeType: "SELL", totalPriceVes: "54263.988", unitPriceVes: "1083.979", amountUsdt: "50.06", commissionUsdt: "0.1200" }),
    makeOrder({ orderNumber: "22959691768252706816", tradeType: "SELL", orderStatus: "CANCELLED", statusCategory: "CANCELLED", totalPriceVes: "43424.198", unitPriceVes: "1083.979", amountUsdt: "40.06", commissionUsdt: "0.1000" }),
    makeOrder({ orderNumber: "22959691317396103168", tradeType: "SELL", totalPriceVes: "62000.00", unitPriceVes: "1083.979", amountUsdt: "57.19", commissionUsdt: "0.1400" }),
    makeOrder({ orderNumber: "22959691224834760704", tradeType: "SELL", totalPriceVes: "75800.00", unitPriceVes: "1083.979", amountUsdt: "69.92", commissionUsdt: "0.1700" }),
    makeOrder({ orderNumber: "22959683463878037504", tradeType: "SELL", totalPriceVes: "50000.00", unitPriceVes: "1085.199", amountUsdt: "46.07", commissionUsdt: "0.1100" }),
  ];

  const totals = calculateWeightedOrderTotals(realOrders);
  assert.equal(totals.activeAvgBuy.toFixed(3), "1074.201");
  assert.equal(totals.activeAvgSell.toFixed(3), "1084.192");
  assert.equal(totals.totalBoughtUsdt.toFixed(2), "288.34");
  assert.equal(totals.totalSoldUsdt.toFixed(2), "264.47");
  assert.equal(totals.totalBinanceCommissionUsdt.toFixed(2), "1.29");

  const summary = calculateVueltaSummary({
    orders: realOrders,
    period: "TODAY",
    periodLabel: "Jornada 2 Real",
    method: "FIFO",
    badge: "BRONZE",
    seniatTaxPercent: 16,
  });

  assert.equal(summary.totalBoughtUsdt, "288.34");
  assert.equal(summary.totalSoldUsdt, "264.47");
  assert.equal(summary.totalVolumeUsdt, "552.81");
  assert.equal(summary.activeAvgBuyRateVes, "1,074.20");
  assert.equal(summary.activeAvgSellRateVes, "1,084.19");
  assert.equal(summary.brechaPointsVes, "+9.99");
  assert.equal(summary.grossProfitUsdt, "2.69");
  assert.equal(summary.volumeCommissionUsdt, "1.29");
  assert.equal(summary.netProfitUsdt, "1.40");
  assert.equal(summary.cancelledCount, 1);
});

test("Deduplicación por orderNumber evita doble conteo (cantidades de más)", () => {
  const buyOrder = makeOrder({
    orderNumber: "DUP-BUY-001",
    tradeType: "BUY",
    amountUsdt: "250.00",
    unitPriceVes: "100.00",
    totalPriceVes: "25000.00",
    commissionUsdt: "0.5000",
  });
  const sellOrder = makeOrder({
    orderNumber: "DUP-SELL-001",
    tradeType: "SELL",
    amountUsdt: "250.00",
    unitPriceVes: "105.00",
    totalPriceVes: "26250.00",
    commissionUsdt: "0.5000",
  });

  const summary = calculateVueltaSummary({
    orders: [buyOrder, buyOrder, sellOrder, sellOrder, sellOrder],
    period: "DAY",
    periodLabel: "Test Duplicados",
    method: "FIFO",
    badge: "SILVER",
    seniatTaxPercent: 16,
  });

  assert.equal(summary.completedBuyCount, 1);
  assert.equal(summary.completedSellCount, 1);
  assert.equal(summary.totalBoughtUsdt, "249.50");
  assert.equal(summary.totalBoughtVes, "25,000.00");
  assert.equal(summary.totalSoldUsdt, "250.50");
  assert.equal(summary.totalSoldVes, "26,250.00");
  assert.equal(summary.activeAvgBuyRateVes, "100.00");
  assert.equal(summary.activeAvgSellRateVes, "105.00");
  assert.equal(summary.volumeCommissionUsdt, "1.00");
});

test("Filtro estricto: solo COMPLETED + USDT + VES entran al promedio y volumen", () => {
  const orders: P2POrderRowDto[] = [
    makeOrder({
      orderNumber: "VALID-BUY",
      tradeType: "BUY",
      amountUsdt: "100.00",
      unitPriceVes: "100.00",
      totalPriceVes: "10000.00",
      commissionUsdt: "0.2000",
    }),
    makeOrder({
      orderNumber: "CANCELLED-BUY",
      tradeType: "BUY",
      orderStatus: "CANCELLED",
      statusCategory: "CANCELLED",
      amountUsdt: "900.00",
      totalPriceVes: "99000.00",
      commissionUsdt: "1.8000",
    }),
    makeOrder({
      orderNumber: "EXPIRED-BUY",
      tradeType: "BUY",
      orderStatus: "8",
      statusCategory: "COMPLETED",
      amountUsdt: "500.00",
      totalPriceVes: "55000.00",
      commissionUsdt: "1.0000",
    }),
    makeOrder({
      orderNumber: "BTC-VES",
      tradeType: "BUY",
      asset: "BTC",
      fiat: "VES",
      amountUsdt: "0.01",
      totalPriceVes: "90000.00",
      commissionUsdt: "0.0001",
    }),
    makeOrder({
      orderNumber: "USDT-USD",
      tradeType: "BUY",
      asset: "USDT",
      fiat: "USD",
      amountUsdt: "500.00",
      totalPriceVes: "500.00",
      commissionUsdt: "1.0000",
    }),
  ];

  assert.equal(mapBinanceOrderStatus("8").statusCategory, "CANCELLED");
  assert.equal(evaluateOrderCalculationEligibility(orders[0]!).included, true);
  assert.equal(evaluateOrderCalculationEligibility(orders[2]!).included, false);
  assert.equal(evaluateOrderCalculationEligibility(orders[3]!).included, false);
  assert.equal(evaluateOrderCalculationEligibility(orders[4]!).included, false);

  const summary = calculateVueltaSummary({
    orders,
    period: "DAY",
    periodLabel: "Test Filtro",
    method: "FIFO",
    badge: "GOLD",
    seniatTaxPercent: 16,
  });

  assert.equal(summary.totalBoughtUsdt, "99.80");
  assert.equal(summary.totalBoughtVes, "10,000.00");
  assert.equal(summary.activeAvgBuyRateVes, "100.00");
  assert.equal(summary.volumeCommissionUsdt, "0.20");
  assert.equal(summary.completedBuyCount, 1);
  assert.equal(summary.cancelledCount, 2);
});

test("Agregación mensual y de cierres usa suma exacta de órdenes deduplicadas sin deriva", () => {
  const day1Orders: P2POrderRowDto[] = [
    makeOrder({
      orderNumber: "M-D1-B1",
      dateIsoVet: "2026-11-01",
      tradeType: "BUY",
      amountUsdt: "33.33",
      unitPriceVes: "100.00",
      totalPriceVes: "3333.33",
      commissionUsdt: "0.0700",
    }),
    makeOrder({
      orderNumber: "M-D1-S1",
      dateIsoVet: "2026-11-01",
      tradeType: "SELL",
      amountUsdt: "33.33",
      unitPriceVes: "102.00",
      totalPriceVes: "3400.00",
      commissionUsdt: "0.0700",
    }),
  ];
  const day2Orders: P2POrderRowDto[] = [
    makeOrder({
      orderNumber: "M-D2-B1",
      dateIsoVet: "2026-11-02",
      tradeType: "BUY",
      amountUsdt: "66.67",
      unitPriceVes: "150.00",
      totalPriceVes: "10000.00",
      commissionUsdt: "0.1400",
    }),
    makeOrder({
      orderNumber: "M-D2-S1",
      dateIsoVet: "2026-11-02",
      tradeType: "SELL",
      amountUsdt: "66.67",
      unitPriceVes: "153.00",
      totalPriceVes: "10200.00",
      commissionUsdt: "0.1400",
    }),
  ];

  const { summary, dailyBreakdown } = buildDailyBreakdownAndMonthlySummary({
    userId: "usr_test",
    targetMonth: "2026-11",
    monthOrders: [...day1Orders, ...day2Orders],
    periodLabel: "Noviembre 2026",
    badge: "BRONZE",
    seniatTaxPercent: 16,
  });

  assert.equal(dailyBreakdown.length, 2);
  // App Binance: Comprado = (33.33 - 0.07) + (66.67 - 0.14) = 99.79 USDT
  // App Binance: Vendido  = (33.33 + 0.07) + (66.67 + 0.14) = 100.21 USDT
  assert.equal(summary.totalBoughtUsdt, "99.79");
  assert.equal(summary.totalBoughtVes, "13,333.33");
  assert.equal(summary.activeAvgBuyRateVes, "133.33");
  assert.equal(summary.totalSoldUsdt, "100.21");
  assert.equal(summary.totalSoldVes, "13,600.00");
  assert.equal(summary.activeAvgSellRateVes, "136.00");
  assert.equal(summary.volumeCommissionUsdt, "0.42");
  assert.equal(summary.isNetProfitNegative, false);

  // Consolidación de cierres con orden solapada no duplica volumen
  const shift1 = calculateVueltaSummary({
    orders: [day1Orders[0]!],
    period: "TODAY",
    periodLabel: "J1",
    method: "FIFO",
    badge: "BRONZE",
  });
  const shift2 = calculateVueltaSummary({
    orders: [day1Orders[0]!, day1Orders[1]!],
    period: "TODAY",
    periodLabel: "J2",
    method: "FIFO",
    badge: "BRONZE",
  });
  const consolidated = buildAggregatedSummaryFromClosures({
    summaries: [shift1, shift2],
    orders: day1Orders,
    period: "DAY",
    periodLabel: "Consolidado",
    badge: "BRONZE",
  });
  assert.equal(consolidated.totalBoughtUsdt, "33.26");
  assert.equal(consolidated.totalBoughtVes, "3,333.33");
});

test("resolvePositiveTotalPriceVes ignora DEFAULT '0' de Postgres y recupera el total real de metadatos v2", () => {
  const resolved = resolvePositiveTotalPriceVes({
    candidates: ["0", "15432.50", "0"],
    amountUsdt: "100.00",
    unitPriceVes: "154.00",
  });
  assert.equal(resolved, "15432.5");

  const fallback = resolvePositiveTotalPriceVes({
    candidates: ["0", null, undefined],
    amountUsdt: "100.5",
    unitPriceVes: "120.2",
  });
  assert.equal(fallback, "12080.1");
});
