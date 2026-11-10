import "server-only";
import fs from "node:fs";
import path from "node:path";
import { supabase } from "@/lib/supabase";
import type {
  DailyClosingActaDto,
  VenezuelanBank,
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
  readonly userId: string;
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

interface LocalVaultDatabase {
  users: StoredUserRecord[];
  credentials: StoredVaultCredentialRecord[];
  orders: StoredP2POrderRecord[];
  closings: Array<DailyClosingActaDto & { readonly userId: string }>;
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
    };
  } catch {
    return { users: [], credentials: [], orders: [], closings: [] };
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
   * Obtiene las órdenes P2P reales guardadas del usuario.
   */
  public static async getUserOrders(
    userId: string
  ): Promise<readonly StoredP2POrderRecord[]> {
    try {
      const { data, error } = await supabase
        .from("p2p_orders")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (!error && data && data.length > 0) {
        return data.map((row) => ({
          orderNumber: String(row.order_number),
          userId: String(row.user_id),
          timeVetLabel: String(row.time_vet_label),
          tradeType: row.trade_type === "BUY" ? "BUY" : "SELL",
          advertisementRole:
            row.advertisement_role === "TAKER" ? "TAKER" : "MAKER",
          payMethodName: (row.pay_method_name as VenezuelanBank) || "Banesco",
          counterPartNickName: String(row.counter_part_nick_name),
          amountUsdt: String(row.amount_usdt),
          commissionUsdt: String(row.commission_usdt),
          unitPriceVes: String(row.unit_price_ves),
          costBasisRateVes: String(row.cost_basis_rate_ves),
        }));
      }
    } catch {
      // Fallback
    }

    const db = readLocalDb();
    return db.orders.filter((o) => o.userId === userId);
  }

  /**
   * Guarda órdenes P2P sincronizadas de Binance para el usuario.
   */
  public static async saveUserOrders(
    userId: string,
    orders: readonly StoredP2POrderRecord[]
  ): Promise<void> {
    if (orders.length === 0) return;

    try {
      const payload = orders.map((o) => ({
        order_number: o.orderNumber,
        user_id: userId,
        time_vet_label: o.timeVetLabel,
        trade_type: o.tradeType,
        advertisement_role: o.advertisementRole,
        pay_method_name: o.payMethodName,
        counter_part_nick_name: o.counterPartNickName,
        amount_usdt: o.amountUsdt,
        commission_usdt: o.commissionUsdt,
        unit_price_ves: o.unitPriceVes,
        cost_basis_rate_ves: o.costBasisRateVes,
      }));

      for (let i = 0; i < payload.length; i += 50) {
        const chunk = payload.slice(i, i + 50);
        await supabase.from("p2p_orders").upsert(chunk);
      }
    } catch {
      // Fallback
    }

    const db = readLocalDb();
    const otherUsersOrders = db.orders.filter((o) => o.userId !== userId);
    db.orders = [...otherUsersOrders, ...orders];
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
}
