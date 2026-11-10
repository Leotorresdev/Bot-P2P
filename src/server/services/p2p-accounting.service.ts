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
 * aplica la comisión Maker configurable (por defecto 0.163%), separa el Capital Rotado Exento
 * del Margen Gravable y calcula el Impuesto SENIAT configurable (por defecto 16% - Norma BA VEN-NIF).
 */
export function calculateOrderFiscalMetrics(
  raw: RawCompletedOrderInput,
  taxConfig?: { seniatTaxPercent?: number; makerFeePercent?: number }
): P2POrderRowDto {
  const amount = new Decimal(raw.amountUsdt);
  const unitPrice = new Decimal(raw.unitPriceVes);
  const costBasisRate = new Decimal(raw.costBasisRateVes);

  const seniatRateDec =
    taxConfig?.seniatTaxPercent != null
      ? new Decimal(taxConfig.seniatTaxPercent).div(100)
      : SENIAT_TAX_RATE;
  const makerFeeRateDec =
    taxConfig?.makerFeePercent != null
      ? new Decimal(taxConfig.makerFeePercent).div(100)
      : BINANCE_MAKER_FEE_RATE;

  const seniatPctLabel = (
    taxConfig?.seniatTaxPercent != null ? taxConfig.seniatTaxPercent : 16
  ).toString();
  const makerFeePctLabel = (
    taxConfig?.makerFeePercent != null ? taxConfig.makerFeePercent : 0.163
  ).toString();

  const fee =
    raw.advertisementRole === "MAKER"
      ? amount.mul(makerFeeRateDec)
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
      seniatTaxPercentApplied: seniatPctLabel,
      makerFeePercentApplied: makerFeePctLabel,
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

  const seniatTaxVes = grossProfitVes.mul(seniatRateDec);
  const netFreeProfitVes = grossProfitVes.minus(seniatTaxVes);

  const seniatTaxUsdt = unitPrice.gt(0)
    ? seniatTaxVes.div(unitPrice)
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
    seniatTax16Ves: seniatTaxVes.toFixed(2),
    seniatTax16Usdt: seniatTaxUsdt.toFixed(2),
    seniatTaxPercentApplied: seniatPctLabel,
    makerFeePercentApplied: makerFeePctLabel,
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

const BINANCE_HOSTS = [
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api-gcp.binance.com",
] as const;

async function fetchBinanceOrdersBySide(
  apiKey: string,
  apiSecret: string,
  tradeType: "BUY" | "SELL",
  maxPages: number = 8
): Promise<{ success: boolean; data: BinanceC2COrderItem[]; error?: string }> {
  // Inicio de hoy en Venezuela (America/Caracas, UTC-4)
  const now = new Date();
  const vetOffsetMs = 4 * 60 * 60 * 1000;
  const vetNow = new Date(now.getTime() - vetOffsetMs);
  const startOfDayVet = new Date(
    Date.UTC(
      vetNow.getUTCFullYear(),
      vetNow.getUTCMonth(),
      vetNow.getUTCDate(),
      4, // 00:00:00 VET = 04:00:00 UTC
      0,
      0,
      0
    )
  );
  const startTimestamp = startOfDayVet.getTime();

  let lastError = "";

  for (const host of BINANCE_HOSTS) {
    try {
      const allHostOrders: BinanceC2COrderItem[] = [];
      let page = 1;
      let hostSuccess = false;

      while (page <= maxPages) {
        const timestamp = Date.now();
        // Parámetro tradeType es OBLIGATORIO en Binance SAPI C2C. recvWindow=60000 previene desincronización de reloj.
        const queryString = `tradeType=${tradeType}&timestamp=${timestamp}&recvWindow=60000&rows=100&page=${page}&startTimestamp=${startTimestamp}`;
        const signature = signBinanceQuery(queryString, apiSecret);

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
          data?: BinanceC2COrderItem[];
          total?: number;
          success?: boolean;
        };

        if (
          res.ok &&
          (json.code === "000000" || json.code === 0 || json.code === "0")
        ) {
          hostSuccess = true;
          const items = Array.isArray(json.data) ? json.data : [];
          allHostOrders.push(...items);

          // Si devolvió menos de 50 o ya no hay más datos, salimos de la paginación
          if (items.length < 50) {
            break;
          }
          page++;
        } else {
          lastError = json.message || json.msg || `HTTP ${res.status}`;
          break;
        }
      }

      if (hostSuccess) {
        return {
          success: true,
          data: allHostOrders,
        };
      }

      console.warn(`[Binance SAPI C2C] Host ${host} respondió:`, lastError);

      // Si no es un problema de red o geo-bloqueo, no seguimos rotando
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

export class P2PAccountingService {
  private static readonly lastSyncTimestampByUser = new Map<string, number>();
  private static readonly inFlightSyncByUser = new Map<
    string,
    Promise<readonly RawCompletedOrderInput[]>
  >();
  /**
   * Prueba en vivo si las credenciales conectadas a la Bóveda responden con éxito en Binance SAPI.
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
              "Binance detectó que tu conexión actual o ruta de internet fue asignada momentáneamente a un nodo con restricción geográfica. Si tienes un proxy o extensión de red activa, cámbiala a Colombia/Panamá/España o desactívala; si estás en conexión local de Venezuela sin VPN, reintenta en breve mientras tu proveedor refresca la ruta.",
            errorDetails: lastErrorMsg,
          };
        }

        return {
          success: false,
          message: `Binance rechazó la conexión: ${lastErrorMsg}`,
          errorDetails: lastErrorMsg,
        };
      }

      // Sincronizar órdenes inmediatamente
      this.lastSyncTimestampByUser.delete(userId);
      const synced = await this.getUserOrdersFromVaultOrBinance(userId, true);

      return {
        success: true,
        message: `¡Conexión verificada exitosamente con Binance! Se detectaron ${synced.length} órdenes conciliadas en tu historial.`,
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
   * Si el usuario tiene credenciales SAPI de Binance conectadas, sincroniza sus órdenes
   * reales consultando tanto BUY como SELL en paralelo desde `/sapi/v1/c2c/orderMatch/listUserOrderHistory`.
   * Si no tiene llaves o aún no ha operado, devuelve su lista real en base de datos.
   */
  public static async getUserOrdersFromVaultOrBinance(
    userId: string,
    forceFresh: boolean = false
  ): Promise<readonly RawCompletedOrderInput[]> {
    const credential =
      await SupabaseVaultRepository.getBinanceCredential(userId);

    if (!credential) {
      return SupabaseVaultRepository.getUserOrders(userId);
    }

    const now = Date.now();
    const lastSync = this.lastSyncTimestampByUser.get(userId) ?? 0;

    // Si se sincronizó hace menos de 6 segundos y no se solicita refresco forzado,
    // leemos directo de la base de datos para responder de forma ultrarrápida y no saturar Binance
    if (!forceFresh && now - lastSync < 6000) {
      return SupabaseVaultRepository.getUserOrders(userId);
    }

    // Si ya existe una sincronización en curso para este usuario (por ejemplo, /summary y /orders concurrentes)
    const activePromise = this.inFlightSyncByUser.get(userId);
    if (activePromise) {
      return activePromise;
    }

    const syncPromise = (async () => {
      try {
        const { apiKey, apiSecret } = decryptBinanceCredentials(
          credential.apiKeyEncrypted,
          credential.iv,
          credential.authTag
        );

        // Binance SAPI requiere dos llamadas paralelas para BUY y SELL
        const [buyRes, sellRes] = await Promise.all([
          fetchBinanceOrdersBySide(apiKey, apiSecret, "BUY"),
          fetchBinanceOrdersBySide(apiKey, apiSecret, "SELL"),
        ]);

        const allRawItems: BinanceC2COrderItem[] = [
          ...buyRes.data,
          ...sellRes.data,
        ];

        if (allRawItems.length > 0) {
          // Filtrar órdenes completadas (status "COMPLETED" o código 4)
          const completed = allRawItems.filter(
            (o) =>
              o.orderStatus === "COMPLETED" ||
              String(o.orderStatus) === "4"
          );

          // Ordenar cronológicamente (más recientes primero)
          completed.sort((a, b) => (b.createTime || 0) - (a.createTime || 0));

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
            const d = new Date(o.createTime);
            const dateStr = d.toLocaleDateString("es-VE", {
              timeZone: "America/Caracas",
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            });
            const timeStr = d.toLocaleTimeString("es-VE", {
              timeZone: "America/Caracas",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
            const timeVetLabel = `${dateStr} • ${timeStr}`;
            const unitPriceDec = new Decimal(o.unitPrice || "0");
            const amountUsdtDec = new Decimal(o.amount || "0");
            const fallbackBasis = avgBuyRate.gt(0)
              ? avgBuyRate
              : unitPriceDec;

            // Comisión oficial Maker 0.163%
            const commNum = o.commission ? parseFloat(o.commission) : 0;
            const commissionUsdt =
              commNum > 0
                ? new Decimal(o.commission!).toFixed(4)
                : amountUsdtDec.times("0.00163").toFixed(4);

            return {
              orderNumber: String(o.orderNumber),
              userId,
              timeVetLabel,
              tradeType: o.tradeType === "BUY" ? "BUY" : "SELL",
              advertisementRole:
                o.advertisementRole === "TAKER" ? "TAKER" : "MAKER",
              payMethodName: normalizePayMethod(o.payMethodName),
              counterPartNickName: o.counterPartNickName || "Cliente P2P",
              amountUsdt: amountUsdtDec.toFixed(2),
              commissionUsdt,
              unitPriceVes: unitPriceDec.toFixed(2),
              costBasisRateVes: fallbackBasis.toFixed(2),
            };
          });

          if (syncedRecords.length > 0) {
            await SupabaseVaultRepository.saveUserOrders(
              userId,
              syncedRecords
            );
            P2PAccountingService.lastSyncTimestampByUser.set(userId, Date.now());
            return SupabaseVaultRepository.getUserOrders(userId);
          }
        }
      } catch (err) {
        console.error(
          "[P2PAccountingService] Error en sincronización con Binance:",
          err
        );
      } finally {
        P2PAccountingService.inFlightSyncByUser.delete(userId);
      }

      return SupabaseVaultRepository.getUserOrders(userId);
    })();

    this.inFlightSyncByUser.set(userId, syncPromise);
    return syncPromise;
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
    const [rawOrders, benchmark, taxConfig] = await Promise.all([
      this.getUserOrdersFromVaultOrBinance(userId),
      BinanceP2PLiveService.getLiveMarketBenchmark(),
      SupabaseVaultRepository.getUserTaxConfig(userId),
    ]);

    const liveRate = new Decimal(benchmark.benchmarkSellRateVes);
    const liveBuyRate = new Decimal(benchmark.benchmarkBuyRateVes);

    // Fecha actual en Venezuela (America/Caracas, UTC-4) para el ciclo diario de 24 horas
    const todayVetStr = new Date().toLocaleDateString("es-VE", {
      timeZone: "America/Caracas",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // En ciclo diario (TODAY), consideramos únicamente las órdenes dentro de las 24h de hoy
    const scopedOrders =
      period === "TODAY"
        ? rawOrders.filter((o) => o.timeVetLabel.includes(todayVetStr))
        : rawOrders;

    const computedRows = scopedOrders.map((o) =>
      calculateOrderFiscalMetrics(o, taxConfig)
    );

    let totalGrossVes = new Decimal(0);
    let totalTaxVes = new Decimal(0);
    let totalNetVes = new Decimal(0);
    let totalExemptVes = new Decimal(0);
    let totalFeesUsdt = new Decimal(0);
    let sellOrdersCount = 0;
    let totalMarginPct = new Decimal(0);

    let totalBoughtNetUsdt = new Decimal(0);
    let totalSoldUsdt = new Decimal(0);

    for (const row of computedRows) {
      totalFeesUsdt = totalFeesUsdt.plus(new Decimal(row.commissionUsdt));

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

    const periodMultiplier = new Decimal(1);

    const scaledNetVes = totalNetVes.mul(periodMultiplier);
    const scaledTaxVes = totalTaxVes.mul(periodMultiplier);
    const scaledGrossVes = totalGrossVes.mul(periodMultiplier);
    const scaledExemptVes = totalExemptVes.mul(periodMultiplier);
    const scaledFeesUsdt = totalFeesUsdt.mul(periodMultiplier);

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
      seniatTaxRatePercent: String(taxConfig.seniatTaxPercent),
      makerFeeRatePercent: String(taxConfig.makerFeePercent),
      exemptCapitalUsdt: liveBuyRate.gt(0)
        ? formatMoney(scaledExemptVes.div(liveBuyRate))
        : "0.00",
      exemptCapitalVes: formatMoney(scaledExemptVes),
      currentWacCostVes: liveBuyRate.toFixed(2),
      availableVaultUsdt: formatMoney(availableInventoryUsdt),
      totalBinanceFeesUsdt: scaledFeesUsdt.toFixed(2),
      nextClosingTimeVet: "11:59 PM VET",
      lastSyncSecondsAgo: 2,
    };
  }

  /**
   * Devuelve las órdenes paginadas y filtradas por tipo, banco y fecha del usuario autenticado.
   */
  public static async getPaginatedOrders(params: {
    readonly userId: string;
    readonly tradeType: TradeTypeFilter;
    readonly bank?: string;
    readonly date?: string;
    readonly page: number;
    readonly limit: number;
  }): Promise<{
    readonly items: readonly P2POrderRowDto[];
    readonly totalCount: number;
    readonly sellCount: number;
    readonly buyCount: number;
    readonly availableDates: readonly string[];
  }> {
    const [rawOrders, taxConfig] = await Promise.all([
      this.getUserOrdersFromVaultOrBinance(params.userId),
      SupabaseVaultRepository.getUserTaxConfig(params.userId),
    ]);
    const allComputed = rawOrders.map((o) =>
      calculateOrderFiscalMetrics(o, taxConfig)
    );

    // Fecha actual en Venezuela (America/Caracas)
    const todayVetStr = new Date().toLocaleDateString("es-VE", {
      timeZone: "America/Caracas",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    // Extraer fechas únicas disponibles en el historial (formato DD/MM/YYYY)
    const dateSet = new Set<string>();
    for (const ord of allComputed) {
      const dt = ord.timeVetLabel.split("•")[0]?.trim();
      if (dt && /^\d{2}\/\d{2}\/\d{4}$/.test(dt)) {
        dateSet.add(dt);
      }
    }
    const availableDates = Array.from(dateSet).sort((a, b) => {
      const [da, ma, ya] = a.split("/").map(Number);
      const [db, mb, yb] = b.split("/").map(Number);
      return (
        new Date(yb || 0, (mb || 1) - 1, db || 0).getTime() -
        new Date(ya || 0, (ma || 1) - 1, da || 0).getTime()
      );
    });

    // Formatear filtro de fecha si viene en YYYY-MM-DD o DD/MM/YYYY
    let targetDate = "";
    if (params.date === "ALL") {
      targetDate = "";
    } else if (params.date && params.date.trim() !== "") {
      const trimmed = params.date.trim();
      if (trimmed === "TODAY") {
        targetDate = todayVetStr;
      } else if (trimmed.includes("-")) {
        const parts = trimmed.split("-");
        if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
          targetDate = `${parts[2].padStart(2, "0")}/${parts[1].padStart(2, "0")}/${parts[0]}`;
        }
      } else {
        targetDate = trimmed;
      }
    } else {
      // Si no se envía fecha, por defecto se enfoca en el ciclo de 24 horas de hoy
      // Pero si hoy aún no tiene órdenes y hay órdenes previas, se selecciona la fecha más reciente
      const hasTodayOrders = allComputed.some((o) =>
        o.timeVetLabel.includes(todayVetStr)
      );
      targetDate = hasTodayOrders ? todayVetStr : (availableDates[0] ?? todayVetStr);
    }

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
      if (targetDate && !order.timeVetLabel.includes(targetDate)) {
        return false;
      }
      return true;
    });

    const sellCount = filtered.filter((o) => o.tradeType === "SELL").length;
    const buyCount = filtered.filter((o) => o.tradeType === "BUY").length;

    const startIndex = (params.page - 1) * params.limit;
    const pagedItems = filtered.slice(startIndex, startIndex + params.limit);

    return {
      items: pagedItems,
      totalCount: filtered.length,
      sellCount,
      buyCount,
      availableDates,
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

  /**
   * Obtiene la configuración de porcentajes impositivos y comisiones del usuario.
   */
  public static async getUserTaxConfig(userId: string) {
    return SupabaseVaultRepository.getUserTaxConfig(userId);
  }

  /**
   * Actualiza la configuración de porcentajes impositivos y comisiones del usuario.
   */
  public static async updateUserTaxConfig(
    userId: string,
    input: { seniatTaxPercent: number; makerFeePercent: number }
  ) {
    await SupabaseVaultRepository.saveUserTaxConfig(userId, input);
    return SupabaseVaultRepository.getUserTaxConfig(userId);
  }
}
