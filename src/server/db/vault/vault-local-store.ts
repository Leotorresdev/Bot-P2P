import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Decimal from "decimal.js";
import type {
  MerchantBadgeType,
  OrderStatusCategory,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import type {
  LocalVaultDatabase,
  StoredP2POrderRecord,
  SyncedDayCoverageRecord,
} from "./vault.types";

const SEED_DATA_DIR = path.join(process.cwd(), "data");
const TMP_DATA_DIR = path.join(os.tmpdir(), "bot-p2p-data");
const DATA_DIR = process.env.VERCEL ? TMP_DATA_DIR : SEED_DATA_DIR;
const DB_FILE_PATH = path.join(DATA_DIR, "vault-db.json");
const SEED_DB_FILE_PATH = path.join(SEED_DATA_DIR, "vault-db.json");

let memoryVaultDb: LocalVaultDatabase | null = null;

export const vaultSchemaFlags: {
  p2pOrdersHasV2Columns: boolean | null;
  p2pOrdersHasCompositePk: boolean | null;
  syncStateTableAvailable: boolean | null;
  dayCoverageTableAvailable: boolean | null;
} = {
  p2pOrdersHasV2Columns: null,
  p2pOrdersHasCompositePk: null,
  syncStateTableAvailable: null,
  dayCoverageTableAvailable: null,
};

export const dayCoverageMemoryCache = new Map<string, SyncedDayCoverageRecord>();

export function resolveBadgeType(raw: unknown): MerchantBadgeType {
  if (raw === "SILVER" || raw === "GOLD" || raw === "BRONZE") {
    return raw;
  }
  return "BRONZE";
}

export function packOrderV2Metadata(o: StoredP2POrderRecord): string {
  const cleanCostBasis =
    String(o.costBasisRateVes ?? "0").split("|")[0] || "0";
  return [
    "v2",
    String(o.createTimeMs || 0),
    String(o.orderStatus || "COMPLETED"),
    String(o.statusCategory || "COMPLETED"),
    String(o.totalPriceVes || "0"),
    String(o.advNo || ""),
    String(o.asset || "USDT"),
    String(o.fiat || "VES"),
    cleanCostBasis,
  ].join("|");
}

export function unpackOrderV2Metadata(rawCostBasis: unknown): {
  readonly isV2Packed: boolean;
  readonly createTimeMs: number;
  readonly orderStatus?: string;
  readonly statusCategory?: OrderStatusCategory;
  readonly totalPriceVes?: string;
  readonly advNo?: string;
  readonly asset?: string;
  readonly fiat?: string;
  readonly costBasisRateVes: string;
} {
  const str = String(rawCostBasis ?? "0");
  if (!str.startsWith("v2|")) {
    return {
      isV2Packed: false,
      createTimeMs: 0,
      costBasisRateVes: str,
    };
  }
  const parts = str.split("|");
  const createTimeMs = Number(parts[1] ?? 0);
  const orderStatus = parts[2] || undefined;
  const statusCategory = (parts[3] || undefined) as
    | OrderStatusCategory
    | undefined;
  const totalPriceVes = parts[4] || undefined;
  const advNo = parts[5] ?? "";
  const asset = parts[6] || "USDT";
  const fiat = parts[7] || "VES";
  const costBasisRateVes = parts[8] || "0";

  return {
    isV2Packed: true,
    createTimeMs: Number.isFinite(createTimeMs) ? createTimeMs : 0,
    orderStatus,
    statusCategory,
    totalPriceVes,
    advNo,
    asset,
    fiat,
    costBasisRateVes,
  };
}

/**
 * Resuelve el monto total real en bolívares de una orden priorizando el primer candidato > 0
 * (evita que un DEFAULT '0' de Postgres oculte el valor real empaquetado en metadatos v2)
 * y solo usa `amount * unitPrice` si ninguno trae un total positivo.
 */
export function resolvePositiveTotalPriceVes(params: {
  readonly candidates: ReadonlyArray<unknown>;
  readonly amountUsdt: string;
  readonly unitPriceVes: string;
}): string {
  for (const candidate of params.candidates) {
    if (candidate === null || candidate === undefined) continue;
    const cleaned = String(candidate).trim().replace(/,/g, "");
    if (!cleaned) continue;
    try {
      const dec = new Decimal(cleaned);
      if (dec.gt(0)) {
        return dec.toFixed();
      }
    } catch {
      // Continuar con el siguiente candidato
    }
  }

  try {
    const calcTotal = new Decimal(
      params.amountUsdt.trim().replace(/,/g, "") || "0"
    ).mul(new Decimal(params.unitPriceVes.trim().replace(/,/g, "") || "0"));
    if (calcTotal.gt(0)) {
      return calcTotal.toFixed();
    }
  } catch {
    // ignore
  }
  return "0";
}

export function packBadgeTaxMeta(
  baseValue: string,
  badge: MerchantBadgeType,
  seniatTaxPercent: number
): string {
  const cleanBase =
    String(baseValue ?? "").split("|")[0] || "enc:aes256:server-only";
  return `${cleanBase}|badge:${badge}|tax:${seniatTaxPercent}`;
}

export function unpackBadgeTaxMeta(raw: unknown): {
  readonly badge?: MerchantBadgeType;
  readonly seniatTaxPercent?: number;
} {
  const str = String(raw ?? "");
  if (!str.includes("|badge:")) {
    return {};
  }
  const badgeMatch = /\|badge:(BRONZE|SILVER|GOLD)/.exec(str);
  const taxMatch = /\|tax:([0-9.]+)/.exec(str);
  const badge = badgeMatch?.[1] as MerchantBadgeType | undefined;
  const parsedTax = taxMatch?.[1] ? Number(taxMatch[1]) : undefined;
  return {
    badge,
    seniatTaxPercent:
      parsedTax !== undefined && Number.isFinite(parsedTax)
        ? parsedTax
        : undefined,
  };
}

export function readLocalDb(): LocalVaultDatabase {
  if (memoryVaultDb) {
    return memoryVaultDb;
  }

  try {
    const fileToRead = fs.existsSync(DB_FILE_PATH)
      ? DB_FILE_PATH
      : !process.env.VERCEL && fs.existsSync(SEED_DB_FILE_PATH)
        ? SEED_DB_FILE_PATH
        : null;

    if (!fileToRead) {
      const emptyDb: LocalVaultDatabase = {
        users: [],
        credentials: [],
        orders: [],
        closings: [],
        taxConfigs: [],
        activeShifts: [],
        shiftClosures: [],
        dailyTotalClosures: [],
      };
      memoryVaultDb = emptyDb;
      return emptyDb;
    }
    const raw = fs.readFileSync(fileToRead, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalVaultDatabase>;
    const loaded: LocalVaultDatabase = {
      users: parsed.users ?? [],
      credentials: parsed.credentials ?? [],
      orders: parsed.orders ?? [],
      closings: parsed.closings ?? [],
      taxConfigs: parsed.taxConfigs ?? [],
      activeShifts: parsed.activeShifts ?? [],
      shiftClosures: parsed.shiftClosures ?? [],
      dailyTotalClosures: parsed.dailyTotalClosures ?? [],
    };
    memoryVaultDb = loaded;
    return loaded;
  } catch {
    const emptyDb: LocalVaultDatabase = {
      users: [],
      credentials: [],
      orders: [],
      closings: [],
      taxConfigs: [],
      activeShifts: [],
      shiftClosures: [],
      dailyTotalClosures: [],
    };
    memoryVaultDb = emptyDb;
    return emptyDb;
  }
}

export function writeLocalDb(db: LocalVaultDatabase): void {
  memoryVaultDb = db;
  if (process.env.VERCEL) {
    // En Vercel serverless el almacenamiento primario es Supabase; evitar I/O síncrono de disco
    return;
  }
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(db), "utf8");
  } catch {
    // Ignorar fallo local si el filesystem es de solo lectura
  }
}
