import "server-only";
import fs from "node:fs";
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

const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE_PATH = path.join(DATA_DIR, "vault-db.json");

function readLocalDb(): LocalVaultDatabase {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE_PATH)) {
      const emptyDb: LocalVaultDatabase = {
        users: [],
        credentials: [],
        orders: [],
        closings: [],
        taxConfigs: [],
      };
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(emptyDb, null, 2), "utf8");
      return emptyDb;
    }
    const raw = fs.readFileSync(DB_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalVaultDatabase>;
    return {
      users: parsed.users ?? [],
      credentials: parsed.credentials ?? [],
      orders: parsed.orders ?? [],
      closings: parsed.closings ?? [],
      taxConfigs: parsed.taxConfigs ?? [],
    };
  } catch {
    return { users: [], credentials: [], orders: [], closings: [], taxConfigs: [] };
  }
}

function writeLocalDb(db: LocalVaultDatabase): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(db, null, 2), "utf8");
  } catch (err) {
    console.error("[VaultRepository] Error escribiendo persistencia:", err);
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
          totpSecret: String(data.totp_secret),
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
          totpSecret: String(data.totp_secret),
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
    try {
      await supabase.from("api_credentials").upsert({
        user_id: cred.userId,
        label: cred.label,
        api_key_masked: cred.apiKeyMasked,
        api_key_encrypted: cred.apiKeyEncrypted,
        api_secret_encrypted: cred.apiSecretEncrypted,
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
    others.push(cred);
    db.credentials = others;
    writeLocalDb(db);
  }

  /**
   * Obtiene las órdenes P2P reales guardadas del usuario en orden cronológico exacto (createTimeMs DESC).
   */
  public static async getUserOrders(
    userId: string
  ): Promise<readonly StoredP2POrderRecord[]> {
    const parseCreateTimeFallback = (label: string): number => {
      // Soporta "DD/MM/YYYY HH:mm:ss" o "DD/MM/YYYY • HH:mm:ss ..."
      const m =
        /(\d{2})\/(\d{2})\/(\d{4})[^\d]+(\d{1,2}):(\d{2}):(\d{2})/.exec(
          label
        );
      if (!m) return 0;
      const day = Number(m[1]);
      const month = Number(m[2]);
      const year = Number(m[3]);
      const hh = Number(m[4]);
      const mm = Number(m[5]);
      const ss = Number(m[6]);
      return Date.UTC(year, month - 1, day, hh, mm, ss) - UTC_MINUS_4_OFFSET_MS;
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
        const createTimeMs =
          legacy.createTimeMs && legacy.createTimeMs > 0
            ? legacy.createTimeMs
            : parseCreateTimeFallback(o.timeVetLabel);
        const orderStatus = legacy.orderStatus ?? "COMPLETED";
        return {
          ...o,
          advNo: legacy.advNo ?? "",
          createTimeMs,
          orderStatus,
          statusCategory:
            legacy.statusCategory ?? normalizeStatusCat(orderStatus),
          asset: legacy.asset ?? "USDT",
          fiat: legacy.fiat ?? "VES",
          totalPriceVes: legacy.totalPriceVes ?? "0",
        } satisfies StoredP2POrderRecord;
      });
    const localMap = new Map(localUserOrders.map((o) => [o.orderNumber, o]));

    try {
      let queryRes = await supabase
        .from("p2p_orders")
        .select("*")
        .eq("user_id", userId)
        .order("create_time_ms", { ascending: false })
        .limit(5000);

      if (queryRes.error) {
        // Fallback si la columna create_time_ms aún no ha sido migrada en Supabase
        queryRes = await supabase
          .from("p2p_orders")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(5000);
      }

      if (!queryRes.error && queryRes.data && queryRes.data.length > 0) {
        const remoteRecords: StoredP2POrderRecord[] = queryRes.data.map((row) => {
          const ordNum = String(row.order_number);
          const localMatch = localMap.get(ordNum);
          const label = String(row.time_vet_label);
          const rowTimeMs = Number(row.create_time_ms ?? 0);
          const createTimeMs =
            rowTimeMs > 0
              ? rowTimeMs
              : localMatch?.createTimeMs || parseCreateTimeFallback(label);
          const orderStatus = String(
            row.order_status ?? localMatch?.orderStatus ?? "COMPLETED"
          );
          const statusCategory = row.order_status
            ? normalizeStatusCat(orderStatus)
            : ((row.status_category ??
                localMatch?.statusCategory ??
                normalizeStatusCat(orderStatus)) as OrderStatusCategory);

          return {
            orderNumber: ordNum,
            advNo: String(row.adv_no ?? localMatch?.advNo ?? ""),
            userId: String(row.user_id),
            createTimeMs,
            timeVetLabel: label,
            tradeType: row.trade_type === "BUY" ? "BUY" : "SELL",
            orderStatus,
            statusCategory,
            advertisementRole:
              row.advertisement_role === "TAKER" ? "TAKER" : "MAKER",
            asset: String(row.asset || localMatch?.asset || "USDT"),
            fiat: String(row.fiat || localMatch?.fiat || "VES"),
            payMethodName: String(row.pay_method_name || "Banesco"),
            counterPartNickName: String(row.counter_part_nick_name),
            amountUsdt: String(row.amount_usdt),
            commissionUsdt: String(row.commission_usdt ?? "0"),
            unitPriceVes: String(row.unit_price_ves),
            totalPriceVes: (() => {
              try {
                const remoteTotal = new Decimal(
                  String(row.total_price_ves ?? "0").trim().replace(/,/g, "") || "0"
                );
                if (remoteTotal.gt(0)) return remoteTotal.toFixed();
              } catch {
                // Fallback a localMatch si existe
              }
              return localMatch?.totalPriceVes || "0";
            })(),
            costBasisRateVes: String(row.cost_basis_rate_ves ?? "0"),
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
        cost_basis_rate_ves: o.costBasisRateVes,
        create_time_ms: o.createTimeMs,
      }));

      for (let i = 0; i < fullPayload.length; i += 50) {
        const chunk = fullPayload.slice(i, i + 50);
        const { error } = await supabase.from("p2p_orders").upsert(chunk);
        if (error) {
          // Fallback compatible si la migración SQL de columnas nuevas aún no se ejecuta
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
      // Fallback a bóveda local
    }

    const badge = this.resolveBadgeType(localFound?.merchantBadge);
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
      // Fallback a bóveda local
    }

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

    if (localFound) {
      const badge = this.resolveBadgeType(localFound.merchantBadge);
      const badgeMeta = MERCHANT_BADGE_META[badge];
      return {
        seniatTaxPercent: localFound.seniatTaxPercent,
        makerFeePercent: localFound.makerFeePercent,
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
    const db = readLocalDb();
    const prev = db.taxConfigs?.find((t) => t.userId === userId);
    const badge = this.resolveBadgeType(prev?.merchantBadge);
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
