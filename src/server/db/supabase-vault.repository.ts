import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Decimal from "decimal.js";
import { supabase } from "@/lib/supabase";
import { UTC_MINUS_4_OFFSET_MS } from "@/lib/timezone-utc4";
import {
  MERCHANT_BADGE_META,
  type DailyClosingActaDto,
  type MerchantBadgeConfigDto,
  type MerchantBadgeType,
  type OrderStatusCategory,
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

interface LocalVaultDatabase {
  users: StoredUserRecord[];
  credentials: StoredVaultCredentialRecord[];
  orders: StoredP2POrderRecord[];
  closings: Array<DailyClosingActaDto & { readonly userId: string }>;
  taxConfigs?: StoredUserTaxConfigRecord[];
}

const SEED_DATA_DIR = path.join(process.cwd(), "data");
const TMP_DATA_DIR = path.join(os.tmpdir(), "bot-p2p-data");
const DATA_DIR = process.env.VERCEL ? TMP_DATA_DIR : SEED_DATA_DIR;
const DB_FILE_PATH = path.join(DATA_DIR, "vault-db.json");
const SEED_DB_FILE_PATH = path.join(SEED_DATA_DIR, "vault-db.json");

let memoryVaultDb: LocalVaultDatabase | null = null;
let p2pOrdersHasV2Columns: boolean | null = null;

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
  try {
    const fileToRead = fs.existsSync(DB_FILE_PATH)
      ? DB_FILE_PATH
      : !process.env.VERCEL && fs.existsSync(SEED_DB_FILE_PATH)
      ? SEED_DB_FILE_PATH
      : null;

    if (!fileToRead) {
      if (memoryVaultDb) {
        return memoryVaultDb;
      }
      const emptyDb: LocalVaultDatabase = {
        users: [],
        credentials: [],
        orders: [],
        closings: [],
        taxConfigs: [],
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
    };
    memoryVaultDb = loaded;
    return loaded;
  } catch {
    if (memoryVaultDb) {
      return memoryVaultDb;
    }
    return { users: [], credentials: [], orders: [], closings: [], taxConfigs: [] };
  }
}

function writeLocalDb(db: LocalVaultDatabase): void {
  memoryVaultDb = db;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(db, null, 2), "utf8");
  } catch {
    // En Vercel serverless, el respaldo primario es Supabase y memoryVaultDb/tmpdir
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
   * Obtiene las órdenes P2P reales guardadas del usuario en orden cronológico exacto (createTimeMs DESC).
   */
  public static async getUserOrders(
    userId: string
  ): Promise<readonly StoredP2POrderRecord[]> {
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
      const upper = rawStatus.toUpperCase();
      if (upper === "COMPLETED" || upper === "4") return "COMPLETED";
      if (upper.includes("CANCEL") || upper === "6" || upper === "7") {
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
      });
    const localMap = new Map(localUserOrders.map((o) => [o.orderNumber, o]));

    try {
      const SUPABASE_PAGE_SIZE = 1000;
      const MAX_SUPABASE_PAGES = 10;
      const allRows: Array<Record<string, unknown>> = [];

      for (let pageIdx = 0; pageIdx < MAX_SUPABASE_PAGES; pageIdx++) {
        const from = pageIdx * SUPABASE_PAGE_SIZE;
        const to = from + SUPABASE_PAGE_SIZE - 1;

        let queryRes =
          p2pOrdersHasV2Columns !== false
            ? await supabase
                .from("p2p_orders")
                .select("*")
                .eq("user_id", userId)
                .order("create_time_ms", { ascending: false })
                .range(from, to)
            : null;

        if (!queryRes || queryRes.error) {
          if (queryRes?.error) {
            p2pOrdersHasV2Columns = false;
          }
          queryRes = await supabase
            .from("p2p_orders")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
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
          const orderStatus = String(
            row.order_status ??
              unpacked.orderStatus ??
              localMatch?.orderStatus ??
              "COMPLETED"
          );
          const statusCategory = row.order_status
            ? normalizeStatusCat(orderStatus)
            : ((row.status_category ??
                unpacked.statusCategory ??
                localMatch?.statusCategory ??
                normalizeStatusCat(orderStatus)) as OrderStatusCategory);

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
   * Hace upsert de órdenes P2P sincronizadas de Binance sin destruir días anteriores
   * ni alterar el orden cronológico original.
   */
  public static async saveUserOrders(
    userId: string,
    orders: readonly StoredP2POrderRecord[]
  ): Promise<void> {
    if (orders.length === 0) return;

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

      for (let i = 0; i < fullPayload.length; i += 50) {
        const chunk = fullPayload.slice(i, i + 50);
        let needLegacyFallback = p2pOrdersHasV2Columns === false;

        if (!needLegacyFallback) {
          const { error } = await supabase.from("p2p_orders").upsert(chunk);
          if (error) {
            p2pOrdersHasV2Columns = false;
            needLegacyFallback = true;
          } else {
            p2pOrdersHasV2Columns = true;
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
          await supabase.from("p2p_orders").upsert(legacyChunk);
        }
      }
    } catch {
      // Fallback a archivo local
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
        return data.map((row) => ({
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
    } catch {
      // Fallback
    }

    const db = readLocalDb();
    return db.closings.filter((c) => c.userId === userId);
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
}
