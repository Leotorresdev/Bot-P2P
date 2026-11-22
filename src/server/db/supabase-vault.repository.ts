import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Decimal from "decimal.js";
import { supabase } from "@/lib/supabase";
import { UTC_MINUS_4_OFFSET_MS } from "@/lib/timezone-utc4";
import {
  MERCHANT_BADGE_META,
  type ActiveShiftDto,
  type DailyClosingActaDto,
  type DailyTotalClosureDto,
  type MerchantBadgeConfigDto,
  type MerchantBadgeType,
  type OrderStatusCategory,
  type P2POrderRowDto,
  type PnlSummaryDto,
  type ShiftClosureDto,
  type ShiftDigestMetaDto,
} from "@/features/p2p-ledger/schemas/p2p.schemas";

export interface StoredUserRecord {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly passwordHash: string;
  readonly passwordSalt: string;
  readonly totpSecret: string;
  readonly role: "OPERATOR";
  readonly createdAt: string;
}

export interface StoredVaultCredentialRecord {
  readonly userId: string;
  readonly label: string;
  readonly apiKeyMasked: string;
  readonly apiKeyEncrypted: string;
  readonly apiSecretEncrypted: string;
  readonly iv: string;
  readonly authTag: string;
  readonly isReadOnlyVerified: boolean;
  readonly updatedAt: string;
}

export interface StoredP2POrderRecord {
  readonly orderNumber: string;
  readonly advNo: string;
  readonly userId: string;
  readonly createTimeMs: number;
  readonly timeVetLabel: string;
  readonly tradeType: "BUY" | "SELL";
  readonly orderStatus: string;
  readonly statusCategory: OrderStatusCategory;
  readonly advertisementRole: "MAKER" | "TAKER";
  readonly asset: string;
  readonly fiat: string;
  readonly payMethodName: string;
  readonly counterPartNickName: string;
  readonly amountUsdt: string;
  readonly commissionUsdt: string;
  readonly unitPriceVes: string;
  readonly totalPriceVes: string;
  readonly costBasisRateVes: string;
}

export interface StoredUserTaxConfigRecord {
  readonly userId: string;
  readonly seniatTaxPercent: number;
  readonly makerFeePercent: number;
  readonly merchantBadge?: MerchantBadgeType;
  readonly badgeFeePercent?: number;
  readonly updatedAt: string;
}

export interface SyncedDayCoverageRecord {
  readonly userId: string;
  readonly dateIsoVet: string;
  readonly isComplete: boolean;
  readonly buyCount: number;
  readonly sellCount: number;
  readonly openOrdersCount: number;
  readonly syncedAt: string;
}

interface LocalVaultDatabase {
  users: StoredUserRecord[];
  credentials: StoredVaultCredentialRecord[];
  orders: StoredP2POrderRecord[];
  closings: Array<DailyClosingActaDto & { readonly userId: string }>;
  taxConfigs?: StoredUserTaxConfigRecord[];
  activeShifts?: ActiveShiftDto[];
  shiftClosures?: ShiftClosureDto[];
  dailyTotalClosures?: DailyTotalClosureDto[];
}

const SEED_DATA_DIR = path.join(process.cwd(), "data");
const TMP_DATA_DIR = path.join(os.tmpdir(), "bot-p2p-data");
const DATA_DIR = process.env.VERCEL ? TMP_DATA_DIR : SEED_DATA_DIR;
const DB_FILE_PATH = path.join(DATA_DIR, "vault-db.json");
const SEED_DB_FILE_PATH = path.join(SEED_DATA_DIR, "vault-db.json");

let memoryVaultDb: LocalVaultDatabase | null = null;
let p2pOrdersHasV2Columns: boolean | null = null;
let p2pOrdersHasCompositePk: boolean | null = null;
let syncStateTableAvailable: boolean | null = null;
let dayCoverageTableAvailable: boolean | null = null;
const dayCoverageMemoryCache = new Map<string, SyncedDayCoverageRecord>();

function packOrderV2Metadata(o: StoredP2POrderRecord): string {
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

function unpackOrderV2Metadata(rawCostBasis: unknown): {
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

function packBadgeTaxMeta(
  baseValue: string,
  badge: MerchantBadgeType,
  seniatTaxPercent: number
): string {
  const cleanBase = String(baseValue ?? "").split("|")[0] || "enc:aes256:server-only";
  return `${cleanBase}|badge:${badge}|tax:${seniatTaxPercent}`;
}

function unpackBadgeTaxMeta(raw: unknown): {
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

function readLocalDb(): LocalVaultDatabase {
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

function writeLocalDb(db: LocalVaultDatabase): void {
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

export class SupabaseVaultRepository {
  /**
   * Busca un usuario por correo electrónico en Supabase y en el espejo persistente.
   */
  public static async findUserByEmail(
    email: string
  ): Promise<StoredUserRecord | null> {
    const cleanEmail = email.trim().toLowerCase();

    try {
      const { data, error } = await supabase
        .from("p2p_users")
        .select("*")
        .eq("email", cleanEmail)
        .maybeSingle();

      if (!error && data) {
        return {
          id: String(data.id),
          email: String(data.email),
          fullName: String(data.full_name),
          passwordHash: String(data.password_hash),
          passwordSalt: String(data.password_salt),
          totpSecret: String(data.totp_secret ?? "").split("|")[0] || "",
          role: "OPERATOR",
          createdAt: String(data.created_at),
        };
      }
    } catch {
      // Si la tabla aún no ha sido creada en el SQL Editor de Supabase, usamos la bóveda local
    }

    const db = readLocalDb();
    return (
      db.users.find((u) => u.email.toLowerCase() === cleanEmail) ?? null
    );
  }

  /**
   * Busca un usuario por su ID único.
   */
  public static async findUserById(
    userId: string
  ): Promise<StoredUserRecord | null> {
    try {
      const { data, error } = await supabase
        .from("p2p_users")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (!error && data) {
        return {
          id: String(data.id),
          email: String(data.email),
          fullName: String(data.full_name),
          passwordHash: String(data.password_hash),
          passwordSalt: String(data.password_salt),
          totpSecret: String(data.totp_secret ?? "").split("|")[0] || "",
          role: "OPERATOR",
          createdAt: String(data.created_at),
        };
      }
    } catch {
      // Fallback a bóveda local
    }

    const db = readLocalDb();
    return db.users.find((u) => u.id === userId) ?? null;
  }

  /**
   * Registra un nuevo usuario en Supabase y lo respalda en la bóveda local.
   */
  public static async createUser(
    record: StoredUserRecord
  ): Promise<StoredUserRecord> {
    const normalized: StoredUserRecord = {
      ...record,
      email: record.email.trim().toLowerCase(),
    };

    try {
      await supabase.from("p2p_users").upsert({
        id: normalized.id,
        email: normalized.email,
        full_name: normalized.fullName,
        password_hash: normalized.passwordHash,
        password_salt: normalized.passwordSalt,
        totp_secret: normalized.totpSecret,
        role: normalized.role,
        created_at: normalized.createdAt,
      });
    } catch {
      // Continúa guardando en espejo local
    }

    const db = readLocalDb();
    const filtered = db.users.filter(
      (u) => u.email.toLowerCase() !== normalized.email
    );
    filtered.push(normalized);
    db.users = filtered;
    writeLocalDb(db);

    return normalized;
  }

  /**
   * Obtiene las credenciales cifradas de Binance del usuario.
   */
  public static async getBinanceCredential(
    userId: string
  ): Promise<StoredVaultCredentialRecord | null> {
    try {
      const { data, error } = await supabase
        .from("api_credentials")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (!error && data) {
        return {
          userId: String(data.user_id),
          label: String(data.label),
          apiKeyMasked: String(data.api_key_masked),
          apiKeyEncrypted: String(data.api_key_encrypted),
          apiSecretEncrypted: String(data.api_secret_encrypted),
          iv: String(data.iv),
          authTag: String(data.auth_tag),
          isReadOnlyVerified: Boolean(data.is_read_only_verified),
          updatedAt: String(data.updated_at),
        };
      }
    } catch {
      // Fallback
    }

    const db = readLocalDb();
    return db.credentials.find((c) => c.userId === userId) ?? null;
  }

  /**
   * Guarda o actualiza las credenciales cifradas (AES-256-GCM) de Binance del usuario.
   */
  public static async saveBinanceCredential(
    cred: StoredVaultCredentialRecord
  ): Promise<void> {
    let secretMetaToSave = cred.apiSecretEncrypted;
    try {
      const existingTax = await this.getUserTaxConfig(cred.userId);
      secretMetaToSave = packBadgeTaxMeta(
        cred.apiSecretEncrypted,
        existingTax.merchantBadge,
        existingTax.seniatTaxPercent
      );
    } catch {
      // ignore
    }

    try {
      await supabase.from("api_credentials").upsert({
        user_id: cred.userId,
        label: cred.label,
        api_key_masked: cred.apiKeyMasked,
        api_key_encrypted: cred.apiKeyEncrypted,
        api_secret_encrypted: secretMetaToSave,
        iv: cred.iv,
        auth_tag: cred.authTag,
        is_read_only_verified: cred.isReadOnlyVerified,
        updated_at: cred.updatedAt,
      });
    } catch {
      // Fallback
    }

    const db = readLocalDb();
    const others = db.credentials.filter((c) => c.userId !== cred.userId);
    others.push({
      ...cred,
      apiSecretEncrypted: secretMetaToSave,
    });
    db.credentials = others;
    writeLocalDb(db);
  }

  /**
   * Desvincula la cuenta de Binance del usuario eliminando sus credenciales cifradas
   * y el espejo temporal de órdenes sincronizadas (conserva insignia, cierres de jornada y actas).
   */
  public static async deleteBinanceCredentialAndOrders(
    userId: string
  ): Promise<void> {
    try {
      const currentTax = await this.getUserTaxConfig(userId);
      await this.writeFallbackBadgeTaxToSupabase(
        userId,
        currentTax.merchantBadge,
        currentTax.seniatTaxPercent
      );
    } catch {
      // ignore
    }

    try {
      await Promise.all([
        supabase.from("api_credentials").delete().eq("user_id", userId),
        supabase.from("p2p_orders").delete().eq("user_id", userId),
        syncStateTableAvailable !== false
          ? supabase.from("p2p_sync_state").delete().eq("user_id", userId)
          : Promise.resolve(),
        dayCoverageTableAvailable !== false
          ? supabase.from("p2p_sync_day_coverage").delete().eq("user_id", userId)
          : Promise.resolve(),
      ]);
    } catch {
      // Fallback a bóveda local
    }

    const prefix = `${userId}:`;
    for (const key of Array.from(dayCoverageMemoryCache.keys())) {
      if (key.startsWith(prefix)) {
        dayCoverageMemoryCache.delete(key);
      }
    }

    const db = readLocalDb();
    db.credentials = db.credentials.filter((c) => c.userId !== userId);
    db.orders = db.orders.filter((o) => o.userId !== userId);
    writeLocalDb(db);
  }

  /**
   * Obtiene las órdenes P2P reales guardadas del usuario en orden cronológico exacto (createTimeMs DESC).
   */
  public static async getUserOrders(
    userId: string
  ): Promise<readonly StoredP2POrderRecord[]> {
    return this.getUserOrdersInRange(userId);
  }

  /**
   * Obtiene órdenes P2P del usuario acotadas a un rango `[startMs, endMs]` usando el índice
   * `(user_id, create_time_ms DESC)` en PostgreSQL para evitar descargas masivas en cuentas de alto volumen.
   */
  public static async getUserOrdersInRange(
    userId: string,
    range?: {
      readonly startMs?: number | null;
      readonly endMs?: number | null;
      readonly maxPages?: number;
    }
  ): Promise<readonly StoredP2POrderRecord[]> {
    const startMs =
      typeof range?.startMs === "number" && Number.isFinite(range.startMs)
        ? range.startMs
        : null;
    const endMs =
      typeof range?.endMs === "number" && Number.isFinite(range.endMs)
        ? range.endMs
        : null;
    const maxPages = Math.max(1, Math.min(range?.maxPages ?? 50, 100));

    const matchesRange = (ts: number): boolean => {
      if (startMs !== null && ts < startMs) return false;
      if (endMs !== null && ts > endMs) return false;
      return true;
    };

    const parseCreateTimeFallback = (
      label: string,
      createdAtIso?: string
    ): number => {
      // Soporta "DD/MM/YYYY HH:mm:ss" o "DD/MM/YYYY • HH:mm:ss a. m./p. m."
      const m =
        /(\d{2})\/(\d{2})\/(\d{4})[^\d]+(\d{1,2}):(\d{2}):(\d{2})/.exec(
          label
        );
      if (m) {
        const day = Number(m[1]);
        const month = Number(m[2]);
        const year = Number(m[3]);
        let hh = Number(m[4]);
        const mm = Number(m[5]);
        const ss = Number(m[6]);
        const isPm = /p\.?\s*m\.?/i.test(label);
        const isAm = /a\.?\s*m\.?/i.test(label);
        if (isPm && hh < 12) hh += 12;
        if (isAm && hh === 12) hh = 0;
        return (
          Date.UTC(year, month - 1, day, hh, mm, ss) - UTC_MINUS_4_OFFSET_MS
        );
      }
      if (createdAtIso) {
        const parsedIso = Date.parse(createdAtIso);
        if (Number.isFinite(parsedIso) && parsedIso > 0) {
          return parsedIso;
        }
      }
      return 0;
    };

    const normalizeStatusCat = (rawStatus: string): OrderStatusCategory => {
      const upper = rawStatus.trim().toUpperCase();
      if (upper === "COMPLETED" || upper === "4") return "COMPLETED";
      if (
        upper.includes("CANCEL") ||
        upper.includes("EXPIRE") ||
        upper === "6" ||
        upper === "7" ||
        upper === "8"
      ) {
        return "CANCELLED";
      }
      if (upper === "IN_APPEAL" || upper.includes("APPEAL") || upper === "5") {
        return "IN_APPEAL";
      }
      return "IN_PROGRESS";
    };

    const sortChronologicalDesc = (
      list: StoredP2POrderRecord[]
    ): StoredP2POrderRecord[] =>
      [...list].sort((a, b) => {
        if (b.createTimeMs !== a.createTimeMs) {
          return b.createTimeMs - a.createTimeMs;
        }
        return b.orderNumber.localeCompare(a.orderNumber);
      });

    const db = readLocalDb();
    const localUserOrders = db.orders
      .filter((o) => o.userId === userId)
      .map((o) => {
        const legacy = o as Partial<StoredP2POrderRecord>;
        const unpacked = unpackOrderV2Metadata(o.costBasisRateVes);
        const createTimeMs =
          legacy.createTimeMs && legacy.createTimeMs > 0
            ? legacy.createTimeMs
            : unpacked.createTimeMs > 0
            ? unpacked.createTimeMs
            : parseCreateTimeFallback(o.timeVetLabel);
        const orderStatus =
          legacy.orderStatus ?? unpacked.orderStatus ?? "COMPLETED";
        return {
          ...o,
          advNo: legacy.advNo ?? unpacked.advNo ?? "",
          createTimeMs,
          orderStatus,
          statusCategory:
            legacy.statusCategory ??
            unpacked.statusCategory ??
            normalizeStatusCat(orderStatus),
          asset: legacy.asset ?? unpacked.asset ?? "USDT",
          fiat: legacy.fiat ?? unpacked.fiat ?? "VES",
          totalPriceVes:
            legacy.totalPriceVes ?? unpacked.totalPriceVes ?? "0",
          costBasisRateVes: unpacked.costBasisRateVes,
        } satisfies StoredP2POrderRecord;
      })
      .filter((o) => matchesRange(o.createTimeMs));
    const localMap = new Map(localUserOrders.map((o) => [o.orderNumber, o]));

    try {
      const SUPABASE_PAGE_SIZE = 1000;
      const allRows: Array<Record<string, unknown>> = [];

      for (let pageIdx = 0; pageIdx < maxPages; pageIdx++) {
        const from = pageIdx * SUPABASE_PAGE_SIZE;
        const to = from + SUPABASE_PAGE_SIZE - 1;

        let queryRes: {
          data: unknown[] | null;
          error: unknown;
        } | null = null;

        if (p2pOrdersHasV2Columns !== false) {
          let builder = supabase
            .from("p2p_orders")
            .select("*")
            .eq("user_id", userId);
          if (startMs !== null) {
            builder = builder.gte("create_time_ms", startMs);
          }
          if (endMs !== null) {
            builder = builder.lte("create_time_ms", endMs);
          }
          queryRes = await builder
            .order("create_time_ms", { ascending: false })
            .order("order_number", { ascending: false })
            .range(from, to);
        }

        if (!queryRes || queryRes.error) {
          if (queryRes?.error) {
            p2pOrdersHasV2Columns = false;
          }
          let legacyBuilder = supabase
            .from("p2p_orders")
            .select("*")
            .eq("user_id", userId);
          if (startMs !== null) {
            legacyBuilder = legacyBuilder.gte(
              "created_at",
              new Date(startMs).toISOString()
            );
          }
          if (endMs !== null) {
            legacyBuilder = legacyBuilder.lte(
              "created_at",
              new Date(endMs).toISOString()
            );
          }
          queryRes = await legacyBuilder
            .order("created_at", { ascending: false })
            .order("order_number", { ascending: false })
            .range(from, to);
        } else if (p2pOrdersHasV2Columns === null) {
          p2pOrdersHasV2Columns = true;
        }

        if (queryRes.error || !queryRes.data || queryRes.data.length === 0) {
          break;
        }

        allRows.push(...(queryRes.data as Array<Record<string, unknown>>));
        if (queryRes.data.length < SUPABASE_PAGE_SIZE) {
          break;
        }
      }

      if (allRows.length > 0) {
        const remoteRecords: StoredP2POrderRecord[] = allRows.map((row) => {
          const ordNum = String(row.order_number);
          const localMatch = localMap.get(ordNum);
          const unpacked = unpackOrderV2Metadata(row.cost_basis_rate_ves);
          const label = String(row.time_vet_label);
          const rowTimeMs = Number(row.create_time_ms ?? 0);
          const createTimeMs =
            rowTimeMs > 0
              ? rowTimeMs
              : unpacked.createTimeMs > 0
              ? unpacked.createTimeMs
              : localMatch?.createTimeMs ||
                parseCreateTimeFallback(
                  label,
                  row.created_at ? String(row.created_at) : undefined
                );
          const rawRemoteStatus =
            typeof row.order_status === "string" &&
            row.order_status.trim() !== ""
              ? row.order_status.trim()
              : undefined;
          // Si existen metadatos v2 empaquetados (escritos en cada upsert de Binance),
          // evitar que el DEFAULT 'COMPLETED' de Postgres oculte un estado CANCELLED/IN_APPEAL/IN_PROGRESS.
          const orderStatus = String(
            (unpacked.isV2Packed && unpacked.orderStatus
              ? rawRemoteStatus && rawRemoteStatus.toUpperCase() !== "COMPLETED"
                ? rawRemoteStatus
                : unpacked.orderStatus
              : rawRemoteStatus ?? unpacked.orderStatus) ??
              localMatch?.orderStatus ??
              "COMPLETED"
          );
          const statusCategory = normalizeStatusCat(orderStatus);

          const amountStr = String(row.amount_usdt ?? "0");
          const unitPriceStr = String(row.unit_price_ves ?? "0");

          return {
            orderNumber: ordNum,
            advNo: String(
              row.adv_no ?? unpacked.advNo ?? localMatch?.advNo ?? ""
            ),
            userId: String(row.user_id),
            createTimeMs,
            timeVetLabel: label,
            tradeType: row.trade_type === "BUY" ? "BUY" : "SELL",
            orderStatus,
            statusCategory,
            advertisementRole:
              row.advertisement_role === "TAKER" ? "TAKER" : "MAKER",
            asset: String(
              row.asset || unpacked.asset || localMatch?.asset || "USDT"
            ),
            fiat: String(
              row.fiat || unpacked.fiat || localMatch?.fiat || "VES"
            ),
            payMethodName: String(row.pay_method_name || "Banesco"),
            counterPartNickName: String(row.counter_part_nick_name),
            amountUsdt: amountStr,
            commissionUsdt: String(row.commission_usdt ?? "0"),
            unitPriceVes: unitPriceStr,
            totalPriceVes: (() => {
              const candidateTotal =
                row.total_price_ves ??
                unpacked.totalPriceVes ??
                localMatch?.totalPriceVes ??
                "0";
              try {
                const remoteTotal = new Decimal(
                  String(candidateTotal).trim().replace(/,/g, "") || "0"
                );
                if (remoteTotal.gt(0)) return remoteTotal.toFixed();
              } catch {
                // fallback a cálculo exacto amount * unitPrice
              }
              try {
                const calcTotal = new Decimal(
                  amountStr.trim().replace(/,/g, "") || "0"
                ).mul(
                  new Decimal(unitPriceStr.trim().replace(/,/g, "") || "0")
                );
                if (calcTotal.gt(0)) {
                  return calcTotal.toFixed(2, Decimal.ROUND_HALF_UP);
                }
              } catch {
                // ignore
              }
              return "0";
            })(),
            costBasisRateVes: unpacked.costBasisRateVes,
          };
        });

        // Unimos cualquier orden local reciente aún no persistida en remoto sin alterar orden
        const mergedMap = new Map(remoteRecords.map((r) => [r.orderNumber, r]));
        for (const loc of localUserOrders) {
          if (!mergedMap.has(loc.orderNumber)) {
            mergedMap.set(loc.orderNumber, loc);
          }
        }
        return sortChronologicalDesc(Array.from(mergedMap.values()));
      }
    } catch {
      // Fallback a bóveda local
    }

    return sortChronologicalDesc(localUserOrders);
  }

  /**
   * Consulta ultrarrápida (1 fila) del timestamp más reciente de órdenes guardadas para cursor incremental.
   */
  public static async getLatestOrderTimestampMs(
    userId: string
  ): Promise<number> {
    try {
      if (p2pOrdersHasV2Columns !== false) {
        const { data, error } = await supabase
          .from("p2p_orders")
          .select("create_time_ms")
          .eq("user_id", userId)
          .order("create_time_ms", { ascending: false })
          .limit(1);

        if (!error && data && data.length > 0) {
          p2pOrdersHasV2Columns = true;
          const ts = Number(
            (data[0] as Record<string, unknown>)?.create_time_ms ?? 0
          );
          if (Number.isFinite(ts) && ts > 0) return ts;
        } else if (error) {
          p2pOrdersHasV2Columns = false;
        }
      }

      if (p2pOrdersHasV2Columns === false) {
        const { data, error } = await supabase
          .from("p2p_orders")
          .select("created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1);
        if (!error && data && data.length > 0) {
          const parsed = Date.parse(
            String((data[0] as Record<string, unknown>)?.created_at ?? "")
          );
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
      }
    } catch {
      // Fallback a memoria local
    }

    const db = readLocalDb();
    let maxTs = 0;
    for (const o of db.orders) {
      if (o.userId === userId && (o.createTimeMs ?? 0) > maxTs) {
        maxTs = o.createTimeMs ?? 0;
      }
    }
    return maxTs;
  }

  /**
   * Consulta ultrarrápida (1 fila) de la orden más antigua en estado no final (`IN_PROGRESS` / `IN_APPEAL`)
   * dentro de las últimas `lookbackMs` (por defecto 48h) para asegurar que actualice a `COMPLETED`/`CANCELLED`.
   */
  public static async getOldestOpenOrderTimestampMs(
    userId: string,
    lookbackMs: number = 48 * 3_600_000
  ): Promise<number | null> {
    const cutoff = Date.now() - lookbackMs;
    try {
      if (p2pOrdersHasV2Columns !== false) {
        const { data, error } = await supabase
          .from("p2p_orders")
          .select("create_time_ms")
          .eq("user_id", userId)
          .in("status_category", ["IN_PROGRESS", "IN_APPEAL"])
          .gte("create_time_ms", cutoff)
          .order("create_time_ms", { ascending: true })
          .limit(1);

        if (!error && data && data.length > 0) {
          const ts = Number(
            (data[0] as Record<string, unknown>)?.create_time_ms ?? 0
          );
          if (Number.isFinite(ts) && ts > 0) return ts;
          return null;
        }
        if (!error) return null;
      }
    } catch {
      // Fallback a memoria local
    }

    const db = readLocalDb();
    let oldest: number | null = null;
    for (const o of db.orders) {
      if (
        o.userId === userId &&
        (o.statusCategory === "IN_PROGRESS" ||
          o.statusCategory === "IN_APPEAL") &&
        (o.createTimeMs ?? 0) >= cutoff
      ) {
        if (oldest === null || o.createTimeMs < oldest) {
          oldest = o.createTimeMs;
        }
      }
    }
    return oldest;
  }

  /**
   * Candado y cooldown distribuido en `p2p_sync_state` (degrada graciosamente si la tabla aún no existe).
   */
  public static async tryAcquireDistributedSyncLock(
    userId: string,
    cooldownMs: number,
    lockTtlMs: number = 35_000
  ): Promise<{
    readonly acquired: boolean;
    readonly lastOrderCreateMs: number;
    readonly recentlySynced: boolean;
  }> {
    if (syncStateTableAvailable === false) {
      return { acquired: true, lastOrderCreateMs: 0, recentlySynced: false };
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const lockUntilIso = new Date(nowMs + lockTtlMs).toISOString();

    try {
      const { data, error } = await supabase
        .from("p2p_sync_state")
        .select("last_order_create_ms, lock_until, last_sync_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        syncStateTableAvailable = false;
        return { acquired: true, lastOrderCreateMs: 0, recentlySynced: false };
      }

      syncStateTableAvailable = true;

      if (data) {
        const lastOrderCreateMs = Number(data.last_order_create_ms ?? 0) || 0;
        const lockUntilMs = data.lock_until
          ? Date.parse(String(data.lock_until))
          : 0;
        const lastSyncMs = data.last_sync_at
          ? Date.parse(String(data.last_sync_at))
          : 0;

        if (lockUntilMs > nowMs) {
          return {
            acquired: false,
            lastOrderCreateMs,
            recentlySynced: true,
          };
        }
        if (lastSyncMs > 0 && nowMs - lastSyncMs < cooldownMs) {
          return {
            acquired: false,
            lastOrderCreateMs,
            recentlySynced: true,
          };
        }

        await supabase
          .from("p2p_sync_state")
          .update({ lock_until: lockUntilIso })
          .eq("user_id", userId);

        return {
          acquired: true,
          lastOrderCreateMs,
          recentlySynced: false,
        };
      }

      await supabase.from("p2p_sync_state").upsert({
        user_id: userId,
        last_order_create_ms: 0,
        lock_until: lockUntilIso,
        last_sync_at: null,
        last_error: null,
      });

      return { acquired: true, lastOrderCreateMs: 0, recentlySynced: false };
    } catch {
      syncStateTableAvailable = false;
      return { acquired: true, lastOrderCreateMs: 0, recentlySynced: false };
    }
  }

  public static async releaseDistributedSyncLock(
    userId: string,
    lastOrderCreateMs?: number,
    errorMessage?: string | null
  ): Promise<void> {
    if (syncStateTableAvailable !== true) return;
    try {
      const updatePayload: Record<string, unknown> = {
        lock_until: null,
        last_sync_at: new Date().toISOString(),
        last_error: errorMessage ?? null,
      };
      if (
        typeof lastOrderCreateMs === "number" &&
        Number.isFinite(lastOrderCreateMs) &&
        lastOrderCreateMs > 0
      ) {
        updatePayload.last_order_create_ms = lastOrderCreateMs;
      }
      await supabase
        .from("p2p_sync_state")
        .update(updatePayload)
        .eq("user_id", userId);
    } catch {
      // Ignorar fallo de liberación; el TTL de lock expirará solo
    }
  }

  /**
   * Consulta qué días calendario VET ya fueron sincronizados completamente desde Binance.
   * Combina `p2p_sync_day_coverage` (si existe en Supabase) con caché en memoria por instancia.
   */
  public static async getSyncedDayCoverage(
    userId: string,
    startDateIso: string,
    endDateIso: string
  ): Promise<ReadonlyMap<string, SyncedDayCoverageRecord>> {
    const result = new Map<string, SyncedDayCoverageRecord>();

    const prefix = `${userId}:`;
    for (const [key, rec] of dayCoverageMemoryCache.entries()) {
      if (
        key.startsWith(prefix) &&
        rec.dateIsoVet >= startDateIso &&
        rec.dateIsoVet <= endDateIso
      ) {
        result.set(rec.dateIsoVet, rec);
      }
    }

    if (dayCoverageTableAvailable === false) {
      return result;
    }

    try {
      const { data, error } = await supabase
        .from("p2p_sync_day_coverage")
        .select("*")
        .eq("user_id", userId)
        .gte("date_iso_vet", startDateIso)
        .lte("date_iso_vet", endDateIso);

      if (error) {
        dayCoverageTableAvailable = false;
        return result;
      }

      dayCoverageTableAvailable = true;
      for (const row of data ?? []) {
        const dateIso = String(row.date_iso_vet ?? "");
        if (!dateIso) continue;
        const rec: SyncedDayCoverageRecord = {
          userId: String(row.user_id ?? userId),
          dateIsoVet: dateIso,
          isComplete: Boolean(row.is_complete),
          buyCount: Number(row.buy_count ?? 0) || 0,
          sellCount: Number(row.sell_count ?? 0) || 0,
          openOrdersCount: Number(row.open_orders_count ?? 0) || 0,
          syncedAt: String(row.synced_at ?? new Date().toISOString()),
        };
        result.set(dateIso, rec);
        dayCoverageMemoryCache.set(`${userId}:${dateIso}`, rec);
      }
    } catch {
      dayCoverageTableAvailable = false;
    }

    return result;
  }

  /**
   * Registra la cobertura de sincronización de un día calendario VET.
   */
  public static async upsertDayCoverage(
    record: SyncedDayCoverageRecord
  ): Promise<void> {
    dayCoverageMemoryCache.set(`${record.userId}:${record.dateIsoVet}`, record);

    if (dayCoverageTableAvailable === false) {
      return;
    }

    try {
      const { error } = await supabase.from("p2p_sync_day_coverage").upsert(
        {
          user_id: record.userId,
          date_iso_vet: record.dateIsoVet,
          is_complete: record.isComplete,
          buy_count: record.buyCount,
          sell_count: record.sellCount,
          open_orders_count: record.openOrdersCount,
          synced_at: record.syncedAt,
        },
        { onConflict: "user_id,date_iso_vet" }
      );
      if (error) {
        dayCoverageTableAvailable = false;
      } else {
        dayCoverageTableAvailable = true;
      }
    } catch {
      dayCoverageTableAvailable = false;
    }
  }

  /**
   * Hace upsert de órdenes P2P sincronizadas de Binance sin destruir días anteriores
   * ni alterar el orden cronológico original.
   */
  public static async saveUserOrders(
    userId: string,
    orders: readonly StoredP2POrderRecord[]
  ): Promise<void> {
    if (orders.length === 0) return;

    let remoteSavedOk = false;

    try {
      const fullPayload = orders.map((o) => ({
        order_number: o.orderNumber,
        adv_no: o.advNo,
        user_id: userId,
        time_vet_label: o.timeVetLabel,
        trade_type: o.tradeType,
        order_status: o.orderStatus,
        status_category: o.statusCategory,
        advertisement_role: o.advertisementRole,
        asset: o.asset,
        fiat: o.fiat,
        pay_method_name: o.payMethodName,
        counter_part_nick_name: o.counterPartNickName,
        amount_usdt: o.amountUsdt,
        commission_usdt: o.commissionUsdt,
        unit_price_ves: o.unitPriceVes,
        total_price_ves: o.totalPriceVes,
        cost_basis_rate_ves: packOrderV2Metadata(o),
        create_time_ms: o.createTimeMs,
        created_at:
          o.createTimeMs > 0
            ? new Date(o.createTimeMs).toISOString()
            : new Date().toISOString(),
      }));

      const UPSERT_CHUNK_SIZE = 200;
      let anyRemoteSuccess = false;

      const upsertWithPkFallback = async <T extends Record<string, unknown>>(
        rows: readonly T[]
      ): Promise<{ readonly error: { readonly message?: string; readonly code?: string } | null }> => {
        if (p2pOrdersHasCompositePk !== false) {
          const res = await supabase
            .from("p2p_orders")
            .upsert(rows, { onConflict: "user_id,order_number" });
          if (!res.error) {
            p2pOrdersHasCompositePk = true;
            return { error: null };
          }
          const msg = String(res.error.message ?? "");
          const code = String(res.error.code ?? "");
          if (
            code === "42P10" ||
            msg.toLowerCase().includes("no unique or exclusion constraint")
          ) {
            p2pOrdersHasCompositePk = false;
            const retry = await supabase.from("p2p_orders").upsert(rows);
            return { error: retry.error };
          }
          return { error: res.error };
        }
        const res = await supabase.from("p2p_orders").upsert(rows);
        return { error: res.error };
      };

      for (let i = 0; i < fullPayload.length; i += UPSERT_CHUNK_SIZE) {
        const chunk = fullPayload.slice(i, i + UPSERT_CHUNK_SIZE);
        let needLegacyFallback = p2pOrdersHasV2Columns === false;

        if (!needLegacyFallback) {
          const { error } = await upsertWithPkFallback(chunk);
          if (error) {
            p2pOrdersHasV2Columns = false;
            needLegacyFallback = true;
          } else {
            p2pOrdersHasV2Columns = true;
            anyRemoteSuccess = true;
          }
        }

        if (needLegacyFallback) {
          // Empaqueta el 100% de los metadatos v2 en cost_basis_rate_ves y created_at
          const legacyChunk = chunk.map((c) => ({
            order_number: c.order_number,
            user_id: c.user_id,
            time_vet_label: c.time_vet_label,
            trade_type: c.trade_type,
            advertisement_role: c.advertisement_role,
            pay_method_name: c.pay_method_name,
            counter_part_nick_name: c.counter_part_nick_name,
            amount_usdt: c.amount_usdt,
            commission_usdt: c.commission_usdt,
            unit_price_ves: c.unit_price_ves,
            cost_basis_rate_ves: c.cost_basis_rate_ves,
            created_at: c.created_at,
          }));
          const { error: legacyErr } = await upsertWithPkFallback(legacyChunk);
          if (!legacyErr) {
            anyRemoteSuccess = true;
          }
        }
      }
      remoteSavedOk = anyRemoteSuccess;
    } catch {
      // Fallback a archivo local
    }

    // En Vercel serverless, si Supabase persistió correctamente, no duplicar miles de órdenes en memoria/disco
    if (process.env.VERCEL && remoteSavedOk) {
      return;
    }

    const db = readLocalDb();
    const otherUsersOrders = db.orders.filter((o) => o.userId !== userId);
    const mergedUserOrdersMap = new Map<string, StoredP2POrderRecord>();

    for (const existing of db.orders) {
      if (existing.userId === userId) {
        mergedUserOrdersMap.set(existing.orderNumber, existing);
      }
    }
    for (const fresh of orders) {
      mergedUserOrdersMap.set(fresh.orderNumber, fresh);
    }

    const sortedUserOrders = Array.from(mergedUserOrdersMap.values()).sort(
      (a, b) => {
        if ((b.createTimeMs ?? 0) !== (a.createTimeMs ?? 0)) {
          return (b.createTimeMs ?? 0) - (a.createTimeMs ?? 0);
        }
        return b.orderNumber.localeCompare(a.orderNumber);
      }
    );

    db.orders = [...otherUsersOrders, ...sortedUserOrders];
    writeLocalDb(db);
  }

  /**
   * Obtiene las actas de cierre diario (11:59 PM VET) del usuario.
   */
  public static async getUserClosings(
    userId: string
  ): Promise<readonly DailyClosingActaDto[]> {
    try {
      const { data, error } = await supabase
        .from("daily_closings")
        .select("*")
        .eq("user_id", userId)
        .order("closing_iso_date", { ascending: false });

      if (!error && data && data.length > 0) {
        const validRows = data.filter((row) =>
          /^\d{4}-\d{2}-\d{2}$/.test(String(row.closing_iso_date ?? ""))
        );
        if (validRows.length > 0) {
          return validRows.map((row) => ({
            id: String(row.id),
            closingDateLabel: String(row.closing_date_label),
            closingIsoDate: String(row.closing_iso_date),
            executedAtVet: String(row.executed_at_vet),
            reconciledOrders: Number(row.reconciled_orders),
            totalVolumeUsdt: String(row.total_volume_usdt),
            grossProfitUsdt: String(row.gross_profit_usdt),
            grossProfitVes: String(row.gross_profit_ves),
            seniatTax16Usdt: String(row.seniat_tax_16_usdt),
            seniatTax16Ves: String(row.seniat_tax_16_ves),
            netFreeProfitUsdt: String(row.net_free_profit_usdt),
            netFreeProfitVes: String(row.net_free_profit_ves),
            integrityHashSha256: String(row.integrity_hash_sha256),
          }));
        }
      }
    } catch {
      // Fallback
    }

    const db = readLocalDb();
    return db.closings.filter(
      (c) => c.userId === userId && /^\d{4}-\d{2}-\d{2}$/.test(c.closingIsoDate)
    );
  }

  private static resolveBadgeType(raw: unknown): MerchantBadgeType {
    if (raw === "SILVER" || raw === "GOLD" || raw === "BRONZE") {
      return raw;
    }
    return "BRONZE";
  }

  private static async readFallbackBadgeTaxFromSupabase(
    userId: string
  ): Promise<{
    readonly badge?: MerchantBadgeType;
    readonly seniatTaxPercent?: number;
  }> {
    try {
      const [credRes, userRes] = await Promise.all([
        supabase
          .from("api_credentials")
          .select("api_secret_encrypted")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("p2p_users")
          .select("totp_secret")
          .eq("id", userId)
          .maybeSingle(),
      ]);

      if (!credRes.error && credRes.data?.api_secret_encrypted) {
        const fromCred = unpackBadgeTaxMeta(credRes.data.api_secret_encrypted);
        if (fromCred.badge) return fromCred;
      }

      if (!userRes.error && userRes.data?.totp_secret) {
        const fromUser = unpackBadgeTaxMeta(userRes.data.totp_secret);
        if (fromUser.badge) return fromUser;
      }
    } catch {
      // ignore
    }
    return {};
  }

  private static async writeFallbackBadgeTaxToSupabase(
    userId: string,
    badge: MerchantBadgeType,
    seniatTaxPercent: number
  ): Promise<void> {
    try {
      const [credRes, userRes] = await Promise.all([
        supabase
          .from("api_credentials")
          .select("api_secret_encrypted")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("p2p_users")
          .select("totp_secret")
          .eq("id", userId)
          .maybeSingle(),
      ]);

      const updates: Array<PromiseLike<unknown>> = [];

      if (!credRes.error && credRes.data) {
        const packedCred = packBadgeTaxMeta(
          String(credRes.data.api_secret_encrypted ?? "enc:aes256:server-only"),
          badge,
          seniatTaxPercent
        );
        updates.push(
          supabase
            .from("api_credentials")
            .update({ api_secret_encrypted: packedCred })
            .eq("user_id", userId)
        );
      }

      if (!userRes.error && userRes.data) {
        const packedTotp = packBadgeTaxMeta(
          String(userRes.data.totp_secret ?? "JBSWY3DPEHPK3PXP"),
          badge,
          seniatTaxPercent
        );
        updates.push(
          supabase
            .from("p2p_users")
            .update({ totp_secret: packedTotp })
            .eq("id", userId)
        );
      }

      if (updates.length > 0) {
        await Promise.all(updates);
      }
    } catch {
      // ignore
    }
  }

  /**
   * Obtiene la insignia de comerciante verificado persistente (Bronce/Plata/Oro) del usuario.
   */
  public static async getMerchantBadgeConfig(
    userId: string
  ): Promise<MerchantBadgeConfigDto> {
    const db = readLocalDb();
    const localFound = db.taxConfigs?.find((t) => t.userId === userId);

    try {
      const { data, error } = await supabase
        .from("p2p_tax_config")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (!error && data) {
        const badge = this.resolveBadgeType(
          data.merchant_badge ?? localFound?.merchantBadge
        );
        const meta = MERCHANT_BADGE_META[badge];
        return {
          badge: meta.id,
          label: meta.label,
          emoji: meta.emoji,
          feePercent: meta.feePercent,
          feeFactor: meta.feeFactor,
          feeLabel: meta.feeLabel,
          updatedAt: data.updated_at ? String(data.updated_at) : undefined,
        };
      }
    } catch {
      // Fallback
    }

    const remoteFallback = await this.readFallbackBadgeTaxFromSupabase(userId);
    const badge = this.resolveBadgeType(
      remoteFallback.badge ?? localFound?.merchantBadge
    );
    const meta = MERCHANT_BADGE_META[badge];
    return {
      badge: meta.id,
      label: meta.label,
      emoji: meta.emoji,
      feePercent: meta.feePercent,
      feeFactor: meta.feeFactor,
      feeLabel: meta.feeLabel,
      updatedAt: localFound?.updatedAt,
    };
  }

  /**
   * Guarda de forma persistente el nivel de Insignia de Comerciante Verificado.
   */
  public static async saveMerchantBadgeConfig(
    userId: string,
    badge: MerchantBadgeType
  ): Promise<MerchantBadgeConfigDto> {
    const meta = MERCHANT_BADGE_META[badge];
    const updatedAt = new Date().toISOString();
    const existing = await this.getUserTaxConfig(userId);

    try {
      const { error } = await supabase.from("p2p_tax_config").upsert({
        user_id: userId,
        seniat_tax_percent: existing.seniatTaxPercent,
        maker_fee_percent: meta.feePercent,
        merchant_badge: meta.id,
        badge_fee_percent: meta.feePercent,
        updated_at: updatedAt,
      });

      if (error) {
        await supabase.from("p2p_tax_config").upsert({
          user_id: userId,
          seniat_tax_percent: existing.seniatTaxPercent,
          maker_fee_percent: meta.feePercent,
          updated_at: updatedAt,
        });
      }
    } catch {
      // Fallback
    }

    await this.writeFallbackBadgeTaxToSupabase(
      userId,
      meta.id,
      existing.seniatTaxPercent
    );

    const db = readLocalDb();
    if (!db.taxConfigs) {
      db.taxConfigs = [];
    }
    const prev = db.taxConfigs.find((t) => t.userId === userId);
    db.taxConfigs = db.taxConfigs.filter((t) => t.userId !== userId);
    db.taxConfigs.push({
      userId,
      seniatTaxPercent: prev?.seniatTaxPercent ?? existing.seniatTaxPercent,
      makerFeePercent: meta.feePercent,
      merchantBadge: meta.id,
      badgeFeePercent: meta.feePercent,
      updatedAt,
    });
    writeLocalDb(db);

    return {
      badge: meta.id,
      label: meta.label,
      emoji: meta.emoji,
      feePercent: meta.feePercent,
      feeFactor: meta.feeFactor,
      feeLabel: meta.feeLabel,
      updatedAt,
    };
  }

  /**
   * Obtiene la configuración de porcentajes de impuesto SENIAT y comisión del usuario.
   */
  public static async getUserTaxConfig(
    userId: string
  ): Promise<{
    seniatTaxPercent: number;
    makerFeePercent: number;
    merchantBadge: MerchantBadgeType;
    badgeFeePercent: number;
  }> {
    const db = readLocalDb();
    const localFound = db.taxConfigs?.find((t) => t.userId === userId);

    try {
      const { data, error } = await supabase
        .from("p2p_tax_config")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (!error && data) {
        const badge = this.resolveBadgeType(
          data.merchant_badge ?? localFound?.merchantBadge
        );
        const badgeMeta = MERCHANT_BADGE_META[badge];
        return {
          seniatTaxPercent: Number(data.seniat_tax_percent ?? 16),
          makerFeePercent: Number(
            data.badge_fee_percent ??
              data.maker_fee_percent ??
              badgeMeta.feePercent
          ),
          merchantBadge: badge,
          badgeFeePercent: badgeMeta.feePercent,
        };
      }
    } catch {
      // Fallback
    }

    const remoteFallback = await this.readFallbackBadgeTaxFromSupabase(userId);
    if (remoteFallback.badge || localFound) {
      const badge = this.resolveBadgeType(
        remoteFallback.badge ?? localFound?.merchantBadge
      );
      const badgeMeta = MERCHANT_BADGE_META[badge];
      const taxPercent =
        remoteFallback.seniatTaxPercent ?? localFound?.seniatTaxPercent ?? 16;
      return {
        seniatTaxPercent: taxPercent,
        makerFeePercent: badgeMeta.feePercent,
        merchantBadge: badge,
        badgeFeePercent: badgeMeta.feePercent,
      };
    }

    return {
      seniatTaxPercent: 16,
      makerFeePercent: 0.2,
      merchantBadge: "BRONZE",
      badgeFeePercent: 0.2,
    };
  }

  /**
   * Guarda o actualiza la configuración personalizada de impuestos y comisiones del usuario.
   */
  public static async saveUserTaxConfig(
    userId: string,
    config: { seniatTaxPercent: number; makerFeePercent: number }
  ): Promise<void> {
    const updatedAt = new Date().toISOString();
    const existing = await this.getUserTaxConfig(userId);
    const badge = this.resolveBadgeType(existing.merchantBadge);
    const badgeMeta = MERCHANT_BADGE_META[badge];

    try {
      const { error } = await supabase.from("p2p_tax_config").upsert({
        user_id: userId,
        seniat_tax_percent: config.seniatTaxPercent,
        maker_fee_percent: config.makerFeePercent,
        merchant_badge: badge,
        badge_fee_percent: badgeMeta.feePercent,
        updated_at: updatedAt,
      });
      if (error) {
        await supabase.from("p2p_tax_config").upsert({
          user_id: userId,
          seniat_tax_percent: config.seniatTaxPercent,
          maker_fee_percent: config.makerFeePercent,
          updated_at: updatedAt,
        });
      }
    } catch {
      // Fallback
    }

    await this.writeFallbackBadgeTaxToSupabase(
      userId,
      badge,
      config.seniatTaxPercent
    );

    const db = readLocalDb();
    if (!db.taxConfigs) {
      db.taxConfigs = [];
    }
    db.taxConfigs = db.taxConfigs.filter((t) => t.userId !== userId);
    db.taxConfigs.push({
      userId,
      seniatTaxPercent: config.seniatTaxPercent,
      makerFeePercent: config.makerFeePercent,
      merchantBadge: badge,
      badgeFeePercent: badgeMeta.feePercent,
      updatedAt,
    });
    writeLocalDb(db);
  }

  // =======================================================================
  // CONTROL DE JORNADAS (TURNOS) Y CONSOLIDACIÓN DIARIA (11:59:59 PM VET)
  // =======================================================================

  /**
   * Obtiene todos los IDs de usuarios registrados (para auto-cierres de 23:59:59 VET).
   */
  public static async getAllUserIds(): Promise<readonly string[]> {
    const ids = new Set<string>();
    const db = readLocalDb();
    for (const u of db.users) {
      ids.add(u.id);
    }
    for (const s of db.activeShifts ?? []) {
      ids.add(s.userId);
    }

    try {
      const { data } = await supabase.from("p2p_users").select("id");
      if (data) {
        for (const row of data) {
          if (row.id) ids.add(String(row.id));
        }
      }
    } catch {
      // ignore
    }

    return Array.from(ids);
  }

  /**
   * Obtiene la jornada activa del operador (o null si está cerrada / en espera).
   */
  public static async getActiveShift(
    userId: string
  ): Promise<ActiveShiftDto | null> {
    const db = readLocalDb();
    const localShift =
      (db.activeShifts ?? []).find((s) => s.userId === userId) ?? null;

    try {
      const { data, error } = await supabase
        .from("p2p_active_shifts")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (!error && data) {
        const startMs = Number(data.shift_start_time_ms ?? 0);
        if (startMs <= 0) return null;
        const iso = String(data.date_iso_vet);
        const parts = iso.split("-");
        const label =
          parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
        return {
          shiftId: String(data.shift_id),
          userId: String(data.user_id),
          dateIsoVet: iso,
          dateLabelVet: label,
          shiftNumber: Number(data.shift_number ?? 1),
          shiftStartTimeMs: startMs,
          startTimeVetLabel: String(data.start_time_vet_label),
          merchantBadge: this.resolveBadgeType(data.merchant_badge),
        };
      }

      if (!error && !data) {
        return localShift;
      }
    } catch {
      // Tabla p2p_active_shifts podría no estar creada aún; usar respaldo en daily_closings
    }

    try {
      const { data, error } = await supabase
        .from("daily_closings")
        .select("closing_date_label")
        .eq("user_id", userId)
        .eq("closing_iso_date", "__ACTIVE_SHIFT__")
        .maybeSingle();

      if (!error && data?.closing_date_label) {
        const rawLabel = String(data.closing_date_label);
        if (rawLabel === "CLOSED") {
          return null;
        }
        const parsed = JSON.parse(rawLabel) as ActiveShiftDto;
        if (parsed && parsed.shiftStartTimeMs > 0) {
          return parsed;
        }
      }
    } catch {
      // Fallback a memoria/archivo local
    }

    return localShift;
  }

  /**
   * Guarda el estado de una jornada recién iniciada.
   */
  public static async saveActiveShift(shift: ActiveShiftDto): Promise<void> {
    const db = readLocalDb();
    const others = (db.activeShifts ?? []).filter(
      (s) => s.userId !== shift.userId
    );
    others.push(shift);
    db.activeShifts = others;
    writeLocalDb(db);

    try {
      const { error } = await supabase.from("p2p_active_shifts").upsert({
        user_id: shift.userId,
        shift_id: shift.shiftId,
        date_iso_vet: shift.dateIsoVet,
        shift_number: shift.shiftNumber,
        shift_start_time_ms: shift.shiftStartTimeMs,
        start_time_vet_label: shift.startTimeVetLabel,
        merchant_badge: shift.merchantBadge,
        created_at: new Date().toISOString(),
      });

      if (!error) {
        return;
      }
    } catch {
      // Fallback en daily_closings
    }

    try {
      await supabase.from("daily_closings").upsert(
        {
          id: `act_${shift.userId}`,
          user_id: shift.userId,
          closing_date_label: JSON.stringify(shift),
          closing_iso_date: "__ACTIVE_SHIFT__",
          executed_at_vet: shift.startTimeVetLabel,
          reconciled_orders: 0,
          total_volume_usdt: "0.00",
          gross_profit_usdt: "0.00",
          gross_profit_ves: "0.00",
          seniat_tax_16_usdt: "0.00",
          seniat_tax_16_ves: "0.00",
          net_free_profit_usdt: "0.00",
          net_free_profit_ves: "0.00",
          integrity_hash_sha256: shift.shiftId,
        },
        { onConflict: "user_id,closing_iso_date" }
      );
    } catch {
      // Respaldo local ya escrito
    }
  }

  /**
   * Limpia la jornada activa tras cerrarla para que el panel vuelva a 0.00.
   */
  public static async clearActiveShift(userId: string): Promise<void> {
    const db = readLocalDb();
    db.activeShifts = (db.activeShifts ?? []).filter(
      (s) => s.userId !== userId
    );
    writeLocalDb(db);

    try {
      await supabase.from("p2p_active_shifts").delete().eq("user_id", userId);
    } catch {
      // ignore
    }

    try {
      await supabase
        .from("daily_closings")
        .upsert(
          {
            id: `act_${userId}`,
            user_id: userId,
            closing_date_label: "CLOSED",
            closing_iso_date: "__ACTIVE_SHIFT__",
            executed_at_vet: "CLOSED",
            reconciled_orders: 0,
            total_volume_usdt: "0.00",
            gross_profit_usdt: "0.00",
            gross_profit_ves: "0.00",
            seniat_tax_16_usdt: "0.00",
            seniat_tax_16_ves: "0.00",
            net_free_profit_usdt: "0.00",
            net_free_profit_ves: "0.00",
            integrity_hash_sha256: "CLOSED",
          },
          { onConflict: "user_id,closing_iso_date" }
        );
      await supabase
        .from("daily_closings")
        .delete()
        .eq("user_id", userId)
        .eq("closing_iso_date", "__ACTIVE_SHIFT__");
    } catch {
      // ignore
    }
  }

  /**
   * Guarda un Cierre Parcial de Jornada (`ShiftClosure`) en base de datos.
   */
  public static async saveShiftClosure(
    closure: ShiftClosureDto
  ): Promise<void> {
    const db = readLocalDb();
    const existing = (db.shiftClosures ?? []).filter(
      (s) => s.id !== closure.id
    );
    existing.push(closure);
    db.shiftClosures = existing;
    writeLocalDb(db);

    try {
      const { error } = await supabase.from("p2p_shift_closures").upsert({
        id: closure.id,
        user_id: closure.userId,
        date_iso_vet: closure.dateIsoVet,
        date_label_vet: closure.dateLabelVet,
        shift_number: closure.shiftNumber,
        shift_start_time_ms: closure.shiftStartTimeMs,
        shift_end_time_ms: closure.shiftEndTimeMs,
        start_time_vet_label: closure.startTimeVetLabel,
        end_time_vet_label: closure.endTimeVetLabel,
        closed_by: closure.closedBy,
        merchant_badge: closure.merchantBadge,
        badge_fee_percent: closure.badgeFeePercent,
        summary_json: closure.summary,
        orders_json: closure.orders,
        created_at: closure.createdAtIso,
      });

      if (!error) {
        return;
      }
    } catch {
      // Fallback en daily_closings
    }

    try {
      const isoKey = `__SHIFT__:${closure.dateIsoVet}:${String(closure.shiftNumber).padStart(3, "0")}`;
      await supabase.from("daily_closings").upsert(
        {
          id: closure.id,
          user_id: closure.userId,
          closing_date_label: JSON.stringify(closure),
          closing_iso_date: isoKey,
          executed_at_vet: `${closure.startTimeVetLabel}-${closure.endTimeVetLabel}`,
          reconciled_orders: closure.summary.reconciledOrdersCount,
          total_volume_usdt: closure.summary.totalVolumeUsdt,
          gross_profit_usdt: closure.summary.grossProfitUsdt,
          gross_profit_ves: closure.summary.grossProfitVes,
          seniat_tax_16_usdt: closure.summary.volumeCommissionUsdt,
          seniat_tax_16_ves: closure.summary.volumeCommissionVes,
          net_free_profit_usdt: closure.summary.netProfitUsdt,
          net_free_profit_ves: closure.summary.netProfitVes,
          integrity_hash_sha256: closure.id,
        },
        { onConflict: "user_id,closing_iso_date" }
      );
    } catch {
      // Respaldo local ya escrito
    }
  }

  private static mapRowToShiftClosure(
    row: Record<string, unknown>
  ): ShiftClosureDto | null {
    try {
      const badge = this.resolveBadgeType(row.merchant_badge);
      const badgeMeta = MERCHANT_BADGE_META[badge];
      const rawSummary =
        typeof row.summary_json === "string"
          ? (JSON.parse(row.summary_json) as PnlSummaryDto)
          : (row.summary_json as PnlSummaryDto);
      const rawOrders =
        typeof row.orders_json === "string"
          ? (JSON.parse(row.orders_json) as P2POrderRowDto[])
          : (row.orders_json as P2POrderRowDto[]);

      if (!rawSummary) return null;

      return {
        id: String(row.id),
        userId: String(row.user_id),
        dateIsoVet: String(row.date_iso_vet),
        dateLabelVet: String(row.date_label_vet),
        shiftNumber: Number(row.shift_number ?? 1),
        shiftStartTimeMs: Number(row.shift_start_time_ms ?? 0),
        shiftEndTimeMs: Number(row.shift_end_time_ms ?? 0),
        startTimeVetLabel: String(row.start_time_vet_label),
        endTimeVetLabel: String(row.end_time_vet_label),
        closedBy: row.closed_by === "AUTO_2359" ? "AUTO_2359" : "MANUAL",
        merchantBadge: badge,
        merchantBadgeLabel: badgeMeta.label,
        badgeFeePercent: String(
          row.badge_fee_percent ?? badgeMeta.feePercent
        ),
        summary: rawSummary,
        orders: Array.isArray(rawOrders) ? rawOrders : [],
        createdAtIso: String(row.created_at ?? new Date().toISOString()),
      };
    } catch {
      return null;
    }
  }

  /**
   * Obtiene todos los cierres parciales (`ShiftClosure`) de un usuario (ordenados por fecha y turno).
   */
  public static async getAllUserShiftClosures(
    userId: string
  ): Promise<readonly ShiftClosureDto[]> {
    const mergedMap = new Map<string, ShiftClosureDto>();
    const db = readLocalDb();
    for (const loc of db.shiftClosures ?? []) {
      if (loc.userId === userId) {
        mergedMap.set(loc.id, loc);
      }
    }

    try {
      const { data, error } = await supabase
        .from("p2p_shift_closures")
        .select("*")
        .eq("user_id", userId)
        .order("date_iso_vet", { ascending: false })
        .order("shift_number", { ascending: true });

      if (!error && data && data.length > 0) {
        for (const row of data) {
          const mapped = this.mapRowToShiftClosure(
            row as Record<string, unknown>
          );
          if (mapped) {
            mergedMap.set(mapped.id, mapped);
          }
        }
      }
    } catch {
      // Fallback
    }

    try {
      const { data, error } = await supabase
        .from("daily_closings")
        .select("closing_date_label, closing_iso_date")
        .eq("user_id", userId)
        .like("closing_iso_date", "__SHIFT__:%");

      if (!error && data) {
        for (const row of data) {
          try {
            const parsed = JSON.parse(
              String(row.closing_date_label)
            ) as ShiftClosureDto;
            if (parsed && parsed.id) {
              mergedMap.set(parsed.id, parsed);
            }
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }

    return Array.from(mergedMap.values()).sort((a, b) => {
      if (a.dateIsoVet !== b.dateIsoVet) {
        return b.dateIsoVet.localeCompare(a.dateIsoVet);
      }
      return a.shiftNumber - b.shiftNumber;
    });
  }

  /**
   * Obtiene los cierres parciales (`ShiftClosure`) de una fecha específica (`YYYY-MM-DD`).
   */
  public static async getShiftClosuresByDate(
    userId: string,
    dateIsoVet: string
  ): Promise<readonly ShiftClosureDto[]> {
    const all = await this.getAllUserShiftClosures(userId);
    return all
      .filter((s) => s.dateIsoVet === dateIsoVet)
      .sort((a, b) => a.shiftNumber - b.shiftNumber);
  }

  /**
   * Obtiene un cierre parcial (`ShiftClosure`) por su ID único mediante consulta puntual
   * (sin descargar el historial completo de `orders_json` de todas las jornadas del usuario).
   */
  public static async getShiftClosureById(
    userId: string,
    shiftId: string
  ): Promise<ShiftClosureDto | null> {
    try {
      const { data, error } = await supabase
        .from("p2p_shift_closures")
        .select("*")
        .eq("user_id", userId)
        .eq("id", shiftId)
        .maybeSingle();

      if (!error && data) {
        const mapped = this.mapRowToShiftClosure(
          data as Record<string, unknown>
        );
        if (mapped) return mapped;
      }
    } catch {
      // Fallback
    }

    try {
      const { data, error } = await supabase
        .from("daily_closings")
        .select("closing_date_label")
        .eq("user_id", userId)
        .eq("id", shiftId)
        .maybeSingle();

      if (!error && data?.closing_date_label) {
        const parsed = JSON.parse(
          String(data.closing_date_label)
        ) as ShiftClosureDto;
        if (parsed && parsed.id === shiftId) {
          return parsed;
        }
      }
    } catch {
      // Fallback a bóveda local
    }

    const db = readLocalDb();
    return (
      (db.shiftClosures ?? []).find(
        (s) => s.userId === userId && s.id === shiftId
      ) ?? null
    );
  }

  /**
   * Guarda o actualiza el Cierre Total del Día Consolidado (`DailyTotalClosure`)
   * y sincroniza el acta diaria en `daily_closings`.
   */
  public static async saveDailyTotalClosure(
    closure: DailyTotalClosureDto,
    integrityHashSha256: string
  ): Promise<void> {
    const db = readLocalDb();
    const otherTotals = (db.dailyTotalClosures ?? []).filter(
      (c) =>
        !(c.userId === closure.userId && c.dateIsoVet === closure.dateIsoVet)
    );
    otherTotals.push(closure);
    db.dailyTotalClosures = otherTotals;

    const actaRecord: DailyClosingActaDto & { readonly userId: string } = {
      id: closure.id,
      userId: closure.userId,
      closingDateLabel: `${closure.dateLabelVet} (${closure.shiftsCount} ${closure.shiftsCount === 1 ? "jornada" : "jornadas"})`,
      closingIsoDate: closure.dateIsoVet,
      executedAtVet: closure.executedAtVet,
      reconciledOrders: closure.summary.reconciledOrdersCount,
      totalVolumeUsdt: closure.summary.totalVolumeUsdt,
      grossProfitUsdt: closure.summary.grossProfitUsdt,
      grossProfitVes: closure.summary.grossProfitVes,
      seniatTax16Usdt: closure.summary.seniatTax16Usdt,
      seniatTax16Ves: closure.summary.seniatTax16Ves,
      netFreeProfitUsdt: closure.summary.netProfitUsdt,
      netFreeProfitVes: closure.summary.netProfitVes,
      integrityHashSha256,
    };

    const otherClosings = db.closings.filter(
      (c) =>
        !(
          c.userId === closure.userId &&
          c.closingIsoDate === closure.dateIsoVet
        )
    );
    otherClosings.push(actaRecord);
    db.closings = otherClosings;
    writeLocalDb(db);

    try {
      await supabase.from("p2p_daily_total_closures").upsert(
        {
          id: closure.id,
          user_id: closure.userId,
          date_iso_vet: closure.dateIsoVet,
          month_iso_vet: closure.monthIsoVet,
          date_label_vet: closure.dateLabelVet,
          executed_at_vet: closure.executedAtVet,
          shifts_count: closure.shiftsCount,
          merchant_badge: closure.merchantBadge,
          summary_json: closure.summary,
          shifts_meta_json: closure.shiftsMeta,
          orders_json: closure.orders,
          updated_at: closure.updatedAtIso,
        },
        { onConflict: "user_id,date_iso_vet" }
      );
    } catch {
      // Fallback
    }

    try {
      await supabase.from("daily_closings").upsert(
        {
          id: `dtot_${closure.userId}_${closure.dateIsoVet}`,
          user_id: closure.userId,
          closing_date_label: JSON.stringify(closure),
          closing_iso_date: `__DAILY_TOTAL__:${closure.dateIsoVet}`,
          executed_at_vet: closure.executedAtVet,
          reconciled_orders: closure.summary.reconciledOrdersCount,
          total_volume_usdt: closure.summary.totalVolumeUsdt,
          gross_profit_usdt: closure.summary.grossProfitUsdt,
          gross_profit_ves: closure.summary.grossProfitVes,
          seniat_tax_16_usdt: closure.summary.volumeCommissionUsdt,
          seniat_tax_16_ves: closure.summary.volumeCommissionVes,
          net_free_profit_usdt: closure.summary.netProfitUsdt,
          net_free_profit_ves: closure.summary.netProfitVes,
          integrity_hash_sha256: integrityHashSha256,
        },
        { onConflict: "user_id,closing_iso_date" }
      );

      await supabase.from("daily_closings").upsert(
        {
          id: actaRecord.id,
          user_id: actaRecord.userId,
          closing_date_label: actaRecord.closingDateLabel,
          closing_iso_date: actaRecord.closingIsoDate,
          executed_at_vet: actaRecord.executedAtVet,
          reconciled_orders: actaRecord.reconciledOrders,
          total_volume_usdt: actaRecord.totalVolumeUsdt,
          gross_profit_usdt: actaRecord.grossProfitUsdt,
          gross_profit_ves: actaRecord.grossProfitVes,
          seniat_tax_16_usdt: actaRecord.seniatTax16Usdt,
          seniat_tax_16_ves: actaRecord.seniatTax16Ves,
          net_free_profit_usdt: actaRecord.netFreeProfitUsdt,
          net_free_profit_ves: actaRecord.netFreeProfitVes,
          integrity_hash_sha256: actaRecord.integrityHashSha256,
        },
        { onConflict: "user_id,closing_iso_date" }
      );
    } catch {
      // Respaldo local ya escrito
    }
  }

  private static mapRowToDailyTotalClosure(
    row: Record<string, unknown>
  ): DailyTotalClosureDto | null {
    try {
      const badge = this.resolveBadgeType(row.merchant_badge);
      const badgeMeta = MERCHANT_BADGE_META[badge];
      const rawSummary =
        typeof row.summary_json === "string"
          ? (JSON.parse(row.summary_json) as PnlSummaryDto)
          : (row.summary_json as PnlSummaryDto);
      const rawShiftsMeta =
        typeof row.shifts_meta_json === "string"
          ? (JSON.parse(row.shifts_meta_json) as ShiftDigestMetaDto[])
          : (row.shifts_meta_json as ShiftDigestMetaDto[]);
      const rawOrders =
        typeof row.orders_json === "string"
          ? (JSON.parse(row.orders_json) as P2POrderRowDto[])
          : (row.orders_json as P2POrderRowDto[]);

      if (!rawSummary) return null;

      return {
        id: String(row.id),
        userId: String(row.user_id),
        dateIsoVet: String(row.date_iso_vet),
        monthIsoVet: String(row.month_iso_vet),
        dateLabelVet: String(row.date_label_vet),
        executedAtVet: String(row.executed_at_vet ?? "23:59:59 VET"),
        shiftsCount: Number(row.shifts_count ?? 1),
        merchantBadge: badge,
        merchantBadgeLabel: badgeMeta.label,
        summary: rawSummary,
        shiftsMeta: Array.isArray(rawShiftsMeta) ? rawShiftsMeta : [],
        orders: Array.isArray(rawOrders) ? rawOrders : [],
        updatedAtIso: String(row.updated_at ?? new Date().toISOString()),
      };
    } catch {
      return null;
    }
  }

  /**
   * Obtiene todos los `DailyTotalClosure` del usuario.
   */
  public static async getAllUserDailyTotalClosures(
    userId: string
  ): Promise<readonly DailyTotalClosureDto[]> {
    const mergedMap = new Map<string, DailyTotalClosureDto>();
    const db = readLocalDb();
    for (const loc of db.dailyTotalClosures ?? []) {
      if (loc.userId === userId) {
        mergedMap.set(loc.dateIsoVet, loc);
      }
    }

    try {
      const { data, error } = await supabase
        .from("p2p_daily_total_closures")
        .select("*")
        .eq("user_id", userId)
        .order("date_iso_vet", { ascending: true });

      if (!error && data && data.length > 0) {
        for (const row of data) {
          const mapped = this.mapRowToDailyTotalClosure(
            row as Record<string, unknown>
          );
          if (mapped) {
            mergedMap.set(mapped.dateIsoVet, mapped);
          }
        }
      }
    } catch {
      // Fallback
    }

    try {
      const { data, error } = await supabase
        .from("daily_closings")
        .select("closing_date_label, closing_iso_date")
        .eq("user_id", userId)
        .like("closing_iso_date", "__DAILY_TOTAL__:%");

      if (!error && data) {
        for (const row of data) {
          try {
            const parsed = JSON.parse(
              String(row.closing_date_label)
            ) as DailyTotalClosureDto;
            if (parsed && parsed.dateIsoVet) {
              mergedMap.set(parsed.dateIsoVet, parsed);
            }
          } catch {
            // ignore
          }
        }
      }
    } catch {
      // ignore
    }

    return Array.from(mergedMap.values()).sort((a, b) =>
      a.dateIsoVet.localeCompare(b.dateIsoVet)
    );
  }

  /**
   * Obtiene el `DailyTotalClosure` de una fecha específica (`YYYY-MM-DD`).
   */
  public static async getDailyTotalClosureByDate(
    userId: string,
    dateIsoVet: string
  ): Promise<DailyTotalClosureDto | null> {
    const all = await this.getAllUserDailyTotalClosures(userId);
    return all.find((c) => c.dateIsoVet === dateIsoVet) ?? null;
  }

  /**
   * Obtiene todos los `DailyTotalClosure` de un mes específico (`YYYY-MM`) ordenados día por día.
   */
  public static async getDailyTotalClosuresByMonth(
    userId: string,
    monthIsoVet: string
  ): Promise<readonly DailyTotalClosureDto[]> {
    const all = await this.getAllUserDailyTotalClosures(userId);
    return all
      .filter((c) => c.monthIsoVet === monthIsoVet)
      .sort((a, b) => a.dateIsoVet.localeCompare(b.dateIsoVet));
  }
}
