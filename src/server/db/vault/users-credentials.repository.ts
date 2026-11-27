import "server-only";
import { supabase } from "@/lib/supabase";
import {
  dayCoverageMemoryCache,
  packBadgeTaxMeta,
  readLocalDb,
  vaultSchemaFlags,
  writeLocalDb,
} from "./vault-local-store";
import {
  getUserTaxConfig,
  writeFallbackBadgeTaxToSupabase,
} from "./tax-badge.repository";
import type {
  StoredUserRecord,
  StoredVaultCredentialRecord,
} from "./vault.types";

export async function findUserByEmail(
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
    // Si la tabla aún no ha sido creada en Supabase, usar bóveda local
  }

  const db = readLocalDb();
  return db.users.find((u) => u.email.toLowerCase() === cleanEmail) ?? null;
}

export async function findUserById(
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

export async function createUser(
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

export async function getAllUserIds(): Promise<readonly string[]> {
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

export async function getBinanceCredential(
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

export async function saveBinanceCredential(
  cred: StoredVaultCredentialRecord
): Promise<void> {
  let secretMetaToSave = cred.apiSecretEncrypted;
  try {
    const existingTax = await getUserTaxConfig(cred.userId);
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

export async function deleteBinanceCredentialAndOrders(
  userId: string
): Promise<void> {
  try {
    const currentTax = await getUserTaxConfig(userId);
    await writeFallbackBadgeTaxToSupabase(
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
      vaultSchemaFlags.syncStateTableAvailable !== false
        ? supabase.from("p2p_sync_state").delete().eq("user_id", userId)
        : Promise.resolve(),
      vaultSchemaFlags.dayCoverageTableAvailable !== false
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
