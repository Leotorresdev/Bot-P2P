import "server-only";
import type { P2POrderRowDto } from "@/features/p2p-ledger/schemas/p2p.schemas";
import { formatVetOrderTimestamp } from "@/lib/timezone-utc4";
import {
  decryptBinanceCredentials,
  signBinanceQuery,
} from "@/server/security/crypto-vault";
import {
  SupabaseVaultRepository,
  type StoredP2POrderRecord,
} from "@/server/db/supabase-vault.repository";
import {
  formatExactDecimalString,
  parseSafeDecimal,
} from "./decimal-utils";
import { mapBinanceOrderStatus } from "./order-eligibility";

export const BINANCE_HOSTS = [
  "https://api-gcp.binance.com",
  "https://api4.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api.binance.com",
] as const;

export const BINANCE_C2C_PAGE_SIZE = 50;

// Binance SAPI limita el intervalo startTimestamp..endTimestamp a 30 días (usamos 28d por seguridad)
export const MAX_BINANCE_WINDOW_MS = 28 * 86_400_000;
// Binance conserva historial de órdenes C2C hasta 6 meses (~180 días)
export const MAX_BINANCE_LOOKBACK_MS = 180 * 86_400_000;

export interface BinanceC2COrderItem {
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

export function toMirrorOrderDto(rec: StoredP2POrderRecord): P2POrderRowDto {
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

export function resolveSyncWindows(
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
export async function fetchBinanceOrdersInRange(
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

/**
 * Convierte órdenes crudas de Binance C2C a `StoredP2POrderRecord` deduplicando por `orderNumber`
 * (evita duplicados cuando llegan órdenes nuevas durante la paginación de Binance) y ordenando
 * estrictamente por `createTime DESC, orderNumber DESC`.
 */
export function mapRawItemsToStoredRecords(
  userId: string,
  items: readonly BinanceC2COrderItem[]
): StoredP2POrderRecord[] {
  const deduped = new Map<string, BinanceC2COrderItem>();
  for (const item of items) {
    const key = String(item.orderNumber ?? "").trim();
    if (!key) continue;
    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  const sorted = Array.from(deduped.values()).sort((a, b) => {
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

export async function verifyBinanceApiCredentials(userId: string): Promise<{
  readonly success: boolean;
  readonly message: string;
  readonly errorDetails?: string;
}> {
  const credential = await SupabaseVaultRepository.getBinanceCredential(userId);
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

    return {
      success: true,
      message: "Conexión verificada con Binance.",
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
