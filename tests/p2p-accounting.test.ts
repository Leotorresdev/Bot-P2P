import test from "node:test";
import assert from "node:assert/strict";
import type { P2POrderRowDto } from "@/features/p2p-ledger/schemas/p2p.schemas";
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
    timeVetLabel: overrides.timeVetLabel ?? "01/11/2026 • 10:00:00 a. m.",
    dateLabelVet: overrides.dateLabelVet ?? "01/11/2026",
    timeLabelVet: overrides.timeLabelVet ?? "10:00:00 a. m.",
    dateIsoVet: overrides.dateIsoVet ?? "2026-11-01",
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
    commissionUsdt: overrides.commissionUsdt ?? "0.2000",
  };
}

test("Promedio de compra y venta = Suma total Bs ÷ Suma total USDT (ponderado exacto)", () => {
  // Compras:
  // Orden 1: 100 USDT por 10,000 Bs (tasa 100)
  // Orden 2: 300 USDT por 32,400 Bs (tasa 108)
  // Total Compra = 42,400 Bs / 400 USDT = 106.00 Bs/USDT (NO 104.00 que sería promedio simple)
  //
  // Ventas:
  // Orden 3: 50 USDT por 5,500 Bs (tasa 110)
  // Orden 4: 350 USDT por 39,900 Bs (tasa 114)
  // Total Venta = 45,400 Bs / 400 USDT = 113.50 Bs/USDT (NO 112.00 que sería promedio simple)
  const orders: P2POrderRowDto[] = [
    makeOrder({
      orderNumber: "B1",
      tradeType: "BUY",
      amountUsdt: "100.00",
      unitPriceVes: "100.00",
      totalPriceVes: "10000.00",
    }),
    makeOrder({
      orderNumber: "B2",
      tradeType: "BUY",
      amountUsdt: "300.00",
      unitPriceVes: "108.00",
      totalPriceVes: "32400.00",
    }),
    makeOrder({
      orderNumber: "S1",
      tradeType: "SELL",
      amountUsdt: "50.00",
      unitPriceVes: "110.00",
      totalPriceVes: "5500.00",
    }),
    makeOrder({
      orderNumber: "S2",
      tradeType: "SELL",
      amountUsdt: "350.00",
      unitPriceVes: "114.00",
      totalPriceVes: "39900.00",
    }),
  ];

  const totals = calculateWeightedOrderTotals(orders);
  assert.equal(totals.totalBoughtVes.toFixed(2), "42400.00");
  assert.equal(totals.totalBoughtUsdt.toFixed(2), "400.00");
  assert.equal(totals.activeAvgBuy.toFixed(2), "106.00");

  assert.equal(totals.totalSoldVes.toFixed(2), "45400.00");
  assert.equal(totals.totalSoldUsdt.toFixed(2), "400.00");
  assert.equal(totals.activeAvgSell.toFixed(2), "113.50");

  const summary = calculateVueltaSummary({
    orders,
    period: "DAY",
    periodLabel: "Test Día",
    method: "FIFO",
    badge: "BRONZE",
    seniatTaxPercent: 16,
  });

  assert.equal(summary.totalBoughtVes, "42,400.00");
  assert.equal(summary.totalBoughtUsdt, "400.00");
  assert.equal(summary.activeAvgBuyRateVes, "106.00");
  assert.equal(summary.totalSoldVes, "45,400.00");
  assert.equal(summary.totalSoldUsdt, "400.00");
  assert.equal(summary.activeAvgSellRateVes, "113.50");
  assert.equal(summary.brechaPointsVes, "+7.50");
});

test("Deduplicación por orderNumber evita doble conteo (cantidades de más)", () => {
  const buyOrder = makeOrder({
    orderNumber: "DUP-BUY-001",
    tradeType: "BUY",
    amountUsdt: "250.00",
    unitPriceVes: "100.00",
    totalPriceVes: "25000.00",
  });
  const sellOrder = makeOrder({
    orderNumber: "DUP-SELL-001",
    tradeType: "SELL",
    amountUsdt: "250.00",
    unitPriceVes: "105.00",
    totalPriceVes: "26250.00",
  });

  // Simula el mismo orderNumber apareciendo repetido por desplazamiento de paginación en Binance
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
  assert.equal(summary.totalBoughtUsdt, "250.00");
  assert.equal(summary.totalBoughtVes, "25,000.00");
  assert.equal(summary.totalSoldUsdt, "250.00");
  assert.equal(summary.totalSoldVes, "26,250.00");
  assert.equal(summary.activeAvgBuyRateVes, "100.00");
  assert.equal(summary.activeAvgSellRateVes, "105.00");
});

test("Filtro estricto: solo COMPLETED + USDT + VES entran al promedio y volumen", () => {
  const orders: P2POrderRowDto[] = [
    makeOrder({
      orderNumber: "VALID-BUY",
      tradeType: "BUY",
      amountUsdt: "100.00",
      totalPriceVes: "10000.00",
    }),
    makeOrder({
      orderNumber: "CANCELLED-BUY",
      tradeType: "BUY",
      orderStatus: "CANCELLED",
      statusCategory: "CANCELLED",
      amountUsdt: "900.00",
      totalPriceVes: "99000.00",
    }),
    makeOrder({
      orderNumber: "EXPIRED-BUY",
      tradeType: "BUY",
      orderStatus: "8",
      statusCategory: "COMPLETED", // Simula estado corrompido
      amountUsdt: "500.00",
      totalPriceVes: "55000.00",
    }),
    makeOrder({
      orderNumber: "BTC-VES",
      tradeType: "BUY",
      asset: "BTC",
      fiat: "VES",
      amountUsdt: "0.01",
      totalPriceVes: "90000.00",
    }),
    makeOrder({
      orderNumber: "USDT-USD",
      tradeType: "BUY",
      asset: "USDT",
      fiat: "USD",
      amountUsdt: "500.00",
      totalPriceVes: "500.00",
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

  assert.equal(summary.totalBoughtUsdt, "100.00");
  assert.equal(summary.totalBoughtVes, "10,000.00");
  assert.equal(summary.activeAvgBuyRateVes, "100.00");
  assert.equal(summary.completedBuyCount, 1);
  assert.equal(summary.cancelledCount, 2);
});

test("Agregación mensual y de cierres usa suma exacta de órdenes deduplicadas sin deriva de redondeo", () => {
  // Día 1: tasa ~100, ganancia positiva
  // Día 2: tasa ~150, ganancia positiva (cambio brusco de tasa del Bs)
  const day1Orders: P2POrderRowDto[] = [
    makeOrder({
      orderNumber: "M-D1-B1",
      dateIsoVet: "2026-11-01",
      tradeType: "BUY",
      amountUsdt: "33.3333",
      unitPriceVes: "100.00",
      totalPriceVes: "3333.33",
    }),
    makeOrder({
      orderNumber: "M-D1-S1",
      dateIsoVet: "2026-11-01",
      tradeType: "SELL",
      amountUsdt: "33.3333",
      unitPriceVes: "102.00",
      totalPriceVes: "3400.00",
    }),
  ];
  const day2Orders: P2POrderRowDto[] = [
    makeOrder({
      orderNumber: "M-D2-B1",
      dateIsoVet: "2026-11-02",
      tradeType: "BUY",
      amountUsdt: "66.6667",
      unitPriceVes: "150.00",
      totalPriceVes: "10000.00",
    }),
    makeOrder({
      orderNumber: "M-D2-S1",
      dateIsoVet: "2026-11-02",
      tradeType: "SELL",
      amountUsdt: "66.6667",
      unitPriceVes: "153.00",
      totalPriceVes: "10200.00",
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
  // Suma exacta de compras: 33.3333 + 66.6667 = 100.0000 USDT; 3333.33 + 10000.00 = 13333.33 Bs
  // Promedio compra mensual exacto = 13333.33 / 100 = 133.33 Bs/USDT
  assert.equal(summary.totalBoughtUsdt, "100.00");
  assert.equal(summary.totalBoughtVes, "13,333.33");
  assert.equal(summary.activeAvgBuyRateVes, "133.33");
  // Suma exacta de ventas: 33.3333 + 66.6667 = 100.0000 USDT; 3400.00 + 10200.00 = 13600.00 Bs
  // Promedio venta mensual exacto = 13600.00 / 100 = 136.00 Bs/USDT
  assert.equal(summary.totalSoldUsdt, "100.00");
  assert.equal(summary.totalSoldVes, "13,600.00");
  assert.equal(summary.activeAvgSellRateVes, "136.00");
  // Ganancia neta sigue siendo positiva (suma día por día)
  assert.equal(summary.isNetProfitNegative, false);

  // Además: si dos cierres de turno comparten una orden en el límite, buildAggregatedSummaryFromClosures
  // NO debe duplicar su volumen en USDT/Bs al recibir `orders` deduplicados.
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
  assert.equal(consolidated.totalBoughtUsdt, "33.33");
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
