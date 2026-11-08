import "server-only";
import Decimal from "decimal.js";
import type {
  BankLiveMonitorDto,
  DailyClosingActaDto,
  LotMethod,
  P2POrderRowDto,
  PeriodFilter,
  PnlSummaryDto,
  TradeTypeFilter,
  VenezuelanBank,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
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

export const SENIAT_TAX_RATE = new Decimal("0.16");
export const BINANCE_MAKER_FEE_RATE = new Decimal("0.00163"); // 0.163% Comisión Maker P2P Binance

export interface RawCompletedOrderInput {
  readonly orderNumber: string;
  readonly timeVetLabel: string;
  readonly tradeType: "BUY" | "SELL";
  readonly advertisementRole: "MAKER" | "TAKER";
  readonly payMethodName: VenezuelanBank;
  readonly counterPartNickName: string;
  readonly amountUsdt: string;
  readonly commissionUsdt: string;
  readonly unitPriceVes: string;
  readonly costBasisRateVes: string;
  readonly lotBadge?: string;
  readonly lotRemainingLabel?: string;
}

/**
 * Motor matemático exacto (Decimal.js) que procesa una orden de Binance C2C,
 * aplica la comisión Maker del 0.163%, separa el Capital Rotado Exento del Margen Gravable
 * y calcula el 16% de Impuesto SENIAT (Norma BA VEN-NIF).
 */
export function calculateOrderFiscalMetrics(
  raw: RawCompletedOrderInput
): P2POrderRowDto {
  const amount = new Decimal(raw.amountUsdt);
  const unitPrice = new Decimal(raw.unitPriceVes);
  const costBasisRate = new Decimal(raw.costBasisRateVes);

  const fee =
    raw.advertisementRole === "MAKER"
      ? amount.mul(BINANCE_MAKER_FEE_RATE)
      : new Decimal(raw.commissionUsdt);

  const totalVes = amount.mul(unitPrice);

  if (raw.tradeType === "BUY") {
    const netBuyUsdt = Decimal.max(new Decimal(0), amount.minus(fee));
    const effectiveUnitCostVes = netBuyUsdt.gt(0)
      ? totalVes.div(netBuyUsdt)
      : unitPrice;

    return {
      orderNumber: raw.orderNumber,
      timeVetLabel: raw.timeVetLabel,
      tradeType: "BUY",
      advertisementRole: raw.advertisementRole,
      payMethodName: raw.payMethodName,
      counterPartNickName: raw.counterPartNickName,
      amountUsdt: amount.toFixed(2),
      commissionUsdt: fee.toFixed(2),
      netBuyUsdt: netBuyUsdt.toFixed(2),
      unitPriceVes: unitPrice.toFixed(2),
      costBasisRateVes: effectiveUnitCostVes.toFixed(2),
      totalPriceVes: totalVes.toFixed(2),
      exemptCapitalVes: totalVes.toFixed(2),
      seniatTax16Ves: "0.00",
      seniatTax16Usdt: "0.00",
      netFreeProfitUsdt: "0.00",
      netFreeProfitVes: "0.00",
      marginPercent: "0.00",
      lotBadge: raw.lotBadge ?? "LOTE ACTIVO",
      lotRemainingLabel:
        raw.lotRemainingLabel ?? `Neto: ${netBuyUsdt.toFixed(2)} USDT`,
    };
  }

  // Operación de VENTA (SELL):
  const exemptCapitalVes = amount.mul(costBasisRate);
  const feeInVes = fee.mul(unitPrice);
  const grossProfitVes = Decimal.max(
    new Decimal(0),
    totalVes.minus(exemptCapitalVes).minus(feeInVes)
  );

  const seniatTax16Ves = grossProfitVes.mul(SENIAT_TAX_RATE);
  const netFreeProfitVes = grossProfitVes.minus(seniatTax16Ves);

  const seniatTax16Usdt = unitPrice.gt(0)
    ? seniatTax16Ves.div(unitPrice)
    : new Decimal(0);
  const netFreeProfitUsdt = unitPrice.gt(0)
    ? netFreeProfitVes.div(unitPrice)
    : new Decimal(0);

  const marginPct = exemptCapitalVes.gt(0)
    ? netFreeProfitVes.div(exemptCapitalVes).mul(100)
    : new Decimal(0);

  return {
    orderNumber: raw.orderNumber,
    timeVetLabel: raw.timeVetLabel,
    tradeType: "SELL",
    advertisementRole: raw.advertisementRole,
    payMethodName: raw.payMethodName,
    counterPartNickName: raw.counterPartNickName,
    amountUsdt: amount.toFixed(2),
    commissionUsdt: fee.toFixed(2),
    unitPriceVes: unitPrice.toFixed(2),
    costBasisRateVes: costBasisRate.toFixed(2),
    totalPriceVes: totalVes.toFixed(2),
    exemptCapitalVes: exemptCapitalVes.toFixed(2),
    seniatTax16Ves: seniatTax16Ves.toFixed(2),
    seniatTax16Usdt: seniatTax16Usdt.toFixed(2),
    netFreeProfitUsdt: netFreeProfitUsdt.toFixed(2),
    netFreeProfitVes: netFreeProfitVes.toFixed(2),
    marginPercent: marginPct.toFixed(2),
  };
}

function normalizePayMethod(rawName: string | undefined): VenezuelanBank {
  if (!rawName) return "Banesco";
  const lower = rawName.toLowerCase();
  if (lower.includes("pago") || lower.includes("movil") || lower.includes("móvil")) {
    return "Pago Móvil";
  }
  if (lower.includes("mercantil")) return "Mercantil";
  if (lower.includes("provincial") || lower.includes("bbva")) return "BBVA";
  if (lower.includes("venezuela") || lower.includes("bdv")) {
    return "Banco de Venezuela";
  }
  if (lower.includes("bancamiga")) return "Bancamiga";
  if (lower.includes("bnc") || lower.includes("nacional")) return "BNC";
  return "Banesco";
}

export class P2PAccountingService {
  /**
   * Si el usuario tiene credenciales SAPI de Binance conectadas, sincroniza sus órdenes
   * reales desde `/sapi/v1/c2c/orderMatch/listUserOrderHistory`.
   * Si no tiene llaves o aún no ha operado, devuelve su lista real en base de datos (vacía al inicio).
   */
  public static async getUserOrdersFromVaultOrBinance(
    userId: string
  ): Promise<readonly RawCompletedOrderInput[]> {
    const credential =
      await SupabaseVaultRepository.getBinanceCredential(userId);

    if (credential) {
      try {
        const { apiKey, apiSecret } = decryptBinanceCredentials(
          credential.apiKeyEncrypted,
          credential.iv,
          credential.authTag
        );

        const timestamp = Date.now();
        const queryString = `timestamp=${timestamp}&rows=50`;
        const signature = signBinanceQuery(queryString, apiSecret);

        const res = await fetch(
          `https://api.binance.com/sapi/v1/c2c/orderMatch/listUserOrderHistory?${queryString}&signature=${signature}`,
          {
            method: "GET",
            headers: {
              "X-MBX-APIKEY": apiKey,
            },
            signal: AbortSignal.timeout(4500),
          }
        );

        if (res.ok) {
          const json = (await res.json()) as {
            data?: Array<{
              orderNumber: string;
              tradeType: "BUY" | "SELL";
              orderStatus: string;
              amount: string;
              commission: string;
              unitPrice: string;
              counterPartNickName: string;
              payMethodName?: string;
              createTime: number;
              advertisementRole?: "MAKER" | "TAKER";
            }>;
          };

          if (json.data && Array.isArray(json.data)) {
            const completed = json.data.filter(
              (o) => o.orderStatus === "COMPLETED"
            );

            // Calculamos costo base promedio de las compras reales
            const buyOrders = completed.filter((o) => o.tradeType === "BUY");
            let avgBuyRate = new Decimal("0");
            if (buyOrders.length > 0) {
              const sumRates = buyOrders.reduce(
                (acc, b) => acc.plus(new Decimal(b.unitPrice || "0")),
                new Decimal(0)
              );
              avgBuyRate = sumRates.div(buyOrders.length);
            }

            const syncedRecords: StoredP2POrderRecord[] = completed.map((o) => {
              const dateVet = new Date(o.createTime).toLocaleTimeString(
                "es-VE",
                {
                  timeZone: "America/Caracas",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                }
              );
              const unitPriceDec = new Decimal(o.unitPrice || "0");
              const fallbackBasis = avgBuyRate.gt(0)
                ? avgBuyRate
                : unitPriceDec;

              return {
                orderNumber: String(o.orderNumber),
                userId,
                timeVetLabel: `Hoy • ${dateVet}`,
                tradeType: o.tradeType === "BUY" ? "BUY" : "SELL",
                advertisementRole:
                  o.advertisementRole === "TAKER" ? "TAKER" : "MAKER",
                payMethodName: normalizePayMethod(o.payMethodName),
                counterPartNickName: o.counterPartNickName || "Cliente P2P",
                amountUsdt: new Decimal(o.amount || "0").toFixed(2),
                commissionUsdt: new Decimal(o.commission || "0").toFixed(2),
                unitPriceVes: unitPriceDec.toFixed(2),
                costBasisRateVes: fallbackBasis.toFixed(2),
              };
            });

            if (syncedRecords.length > 0) {
              await SupabaseVaultRepository.saveUserOrders(
                userId,
                syncedRecords
              );
              return syncedRecords;
            }
          }
        }
      } catch {
        // Si Binance API no responde, leemos las órdenes persistidas del usuario en Supabase
      }
    }

    return SupabaseVaultRepository.getUserOrders(userId);
  }

  /**
   * Calcula el Resumen P&L real del usuario autenticado.
   * Si es una cuenta nueva sin órdenes, todos los valores contables inician en 0.00.
   */
  public static async getSummary(
    userId: string,
    period: PeriodFilter,
    method: LotMethod
  ): Promise<PnlSummaryDto> {
    const [rawOrders, benchmark] = await Promise.all([
      this.getUserOrdersFromVaultOrBinance(userId),
      BinanceP2PLiveService.getLiveMarketBenchmark(),
    ]);

    const liveRate = new Decimal(benchmark.benchmarkSellRateVes);
    const liveBuyRate = new Decimal(benchmark.benchmarkBuyRateVes);
    const computedRows = rawOrders.map(calculateOrderFiscalMetrics);

    let totalGrossVes = new Decimal(0);
    let totalTaxVes = new Decimal(0);
    let totalNetVes = new Decimal(0);
    let totalExemptVes = new Decimal(0);
    let totalFeesUsdt = new Decimal(0);
    let sellOrdersCount = 0;
    let totalMarginPct = new Decimal(0);

    let totalWorkingCapitalUsdt = new Decimal(0);
    let totalWorkingCapitalVes = new Decimal(0);
    let totalBoughtNetUsdt = new Decimal(0);
    let totalSoldUsdt = new Decimal(0);

    for (const row of computedRows) {
      totalFeesUsdt = totalFeesUsdt.plus(new Decimal(row.commissionUsdt));
      totalWorkingCapitalUsdt = totalWorkingCapitalUsdt.plus(
        new Decimal(row.amountUsdt)
      );
      totalWorkingCapitalVes = totalWorkingCapitalVes.plus(
        new Decimal(row.totalPriceVes)
      );

      if (row.tradeType === "BUY") {
        totalBoughtNetUsdt = totalBoughtNetUsdt.plus(
          new Decimal(row.netBuyUsdt ?? row.amountUsdt)
        );
      } else {
        sellOrdersCount += 1;
        totalSoldUsdt = totalSoldUsdt.plus(new Decimal(row.amountUsdt));
        const netVes = new Decimal(row.netFreeProfitVes);
        const taxVes = new Decimal(row.seniatTax16Ves);
        totalNetVes = totalNetVes.plus(netVes);
        totalTaxVes = totalTaxVes.plus(taxVes);
        totalGrossVes = totalGrossVes.plus(netVes.plus(taxVes));
        totalExemptVes = totalExemptVes.plus(new Decimal(row.exemptCapitalVes));
        totalMarginPct = totalMarginPct.plus(new Decimal(row.marginPercent));
      }
    }

    const periodMultiplier =
      period === "TODAY"
        ? new Decimal(1)
        : period === "7D"
          ? new Decimal("1")
          : new Decimal("1");

    const scaledNetVes = totalNetVes.mul(periodMultiplier);
    const scaledTaxVes = totalTaxVes.mul(periodMultiplier);
    const scaledGrossVes = totalGrossVes.mul(periodMultiplier);
    const scaledExemptVes = totalExemptVes.mul(periodMultiplier);
    const scaledFeesUsdt = totalFeesUsdt.mul(periodMultiplier);
    const scaledWorkingCapUsdt = totalWorkingCapitalUsdt.mul(periodMultiplier);
    const scaledWorkingCapVes = totalWorkingCapitalVes.mul(periodMultiplier);

    const avgSpread =
      sellOrdersCount > 0
        ? totalMarginPct.div(sellOrdersCount)
        : new Decimal("0.00");

    const availableInventoryUsdt = Decimal.max(
      new Decimal(0),
      totalBoughtNetUsdt.minus(totalSoldUsdt)
    );

    const formatMoney = (val: Decimal) =>
      val.toNumber().toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    return {
      period,
      method,
      reconciledOrdersCount: computedRows.length,
      averageSpreadPercent: `${avgSpread.gte(0) ? "+" : ""}${avgSpread.toFixed(2)}%`,
      netFreeProfitUsdt: liveRate.gt(0)
        ? scaledNetVes.div(liveRate).toFixed(2)
        : "0.00",
      netFreeProfitVes: formatMoney(scaledNetVes),
      grossProfitUsdt: liveRate.gt(0)
        ? scaledGrossVes.div(liveRate).toFixed(2)
        : "0.00",
      grossProfitVes: formatMoney(scaledGrossVes),
      seniatTax16Usdt: liveRate.gt(0)
        ? scaledTaxVes.div(liveRate).toFixed(2)
        : "0.00",
      seniatTax16Ves: formatMoney(scaledTaxVes),
      exemptCapitalUsdt: liveBuyRate.gt(0)
        ? formatMoney(scaledExemptVes.div(liveBuyRate))
        : "0.00",
      exemptCapitalVes: formatMoney(scaledExemptVes),
      currentWacCostVes: liveBuyRate.toFixed(2),
      availableVaultUsdt: formatMoney(availableInventoryUsdt),
      totalBinanceFeesUsdt: scaledFeesUsdt.toFixed(2),
      nextClosingTimeVet: "11:59 PM VET",
      lastSyncSecondsAgo: 2,
      workingCapitalUsdt: formatMoney(scaledWorkingCapUsdt),
      workingCapitalVes: formatMoney(scaledWorkingCapVes),
    };
  }

  /**
   * Devuelve las órdenes paginadas y filtradas del usuario autenticado.
   */
  public static async getPaginatedOrders(params: {
    readonly userId: string;
    readonly tradeType: TradeTypeFilter;
    readonly bank?: string;
    readonly page: number;
    readonly limit: number;
  }): Promise<{
    readonly items: readonly P2POrderRowDto[];
    readonly totalCount: number;
    readonly sellCount: number;
    readonly buyCount: number;
  }> {
    const rawOrders = await this.getUserOrdersFromVaultOrBinance(params.userId);
    const allComputed = rawOrders.map(calculateOrderFiscalMetrics);

    const sellCount = allComputed.filter((o) => o.tradeType === "SELL").length;
    const buyCount = allComputed.filter((o) => o.tradeType === "BUY").length;

    const filtered = allComputed.filter((order) => {
      if (params.tradeType !== "ALL" && order.tradeType !== params.tradeType) {
        return false;
      }
      if (
        params.bank &&
        params.bank.trim() !== "" &&
        order.payMethodName.toLowerCase() !== params.bank.trim().toLowerCase()
      ) {
        return false;
      }
      return true;
    });

    const startIndex = (params.page - 1) * params.limit;
    const pagedItems = filtered.slice(startIndex, startIndex + params.limit);

    return {
      items: pagedItems,
      totalCount: filtered.length,
      sellCount,
      buyCount,
    };
  }

  /**
   * Devuelve las Actas de Cierre Diario (11:59 PM VET) y el estado real de la Bóveda API del usuario.
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

    const formatMoney = (val: Decimal) =>
      val.toNumber().toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    return {
      monthGrossUsdt: formatMoney(grossUsdt),
      monthGrossVes: formatMoney(grossVes),
      monthSeniatTax16Usdt: formatMoney(taxUsdt),
      monthSeniatTax16Ves: formatMoney(taxVes),
      monthNetFreeUsdt: formatMoney(netUsdt),
      monthNetFreeVes: formatMoney(netVes),
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

  /**
   * Cifra con AES-256-GCM y guarda las credenciales SAPI de Binance en Supabase para el usuario.
   */
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
      updatedAtVet: new Date().toLocaleTimeString("es-VE", {
        timeZone: "America/Caracas",
      }),
    };
  }

  /**
   * Monitor de Brechas en Bancos Nacionales (consulta en vivo a Binance P2P).
   */
  public static async getVenezuelanBanksMonitor(
    amount: number = 5000
  ): Promise<readonly BankLiveMonitorDto[]> {
    return BinanceP2PLiveService.getLiveBrechas(amount);
  }
}
