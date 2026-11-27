import "server-only";
import { supabase } from "@/lib/supabase";
import {
  MERCHANT_BADGE_META,
  type MerchantBadgeConfigDto,
  type MerchantBadgeType,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import {
  packBadgeTaxMeta,
  readLocalDb,
  resolveBadgeType,
  unpackBadgeTaxMeta,
  writeLocalDb,
} from "./vault-local-store";

export async function readFallbackBadgeTaxFromSupabase(
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

export async function writeFallbackBadgeTaxToSupabase(
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

export async function getMerchantBadgeConfig(
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
      const badge = resolveBadgeType(
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

  const remoteFallback = await readFallbackBadgeTaxFromSupabase(userId);
  const badge = resolveBadgeType(
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

export async function getUserTaxConfig(userId: string): Promise<{
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
      const badge = resolveBadgeType(
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

  const remoteFallback = await readFallbackBadgeTaxFromSupabase(userId);
  if (remoteFallback.badge || localFound) {
    const badge = resolveBadgeType(
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

export async function saveMerchantBadgeConfig(
  userId: string,
  badge: MerchantBadgeType
): Promise<MerchantBadgeConfigDto> {
  const meta = MERCHANT_BADGE_META[badge];
  const updatedAt = new Date().toISOString();
  const existing = await getUserTaxConfig(userId);

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

  await writeFallbackBadgeTaxToSupabase(
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

export async function saveUserTaxConfig(
  userId: string,
  config: { seniatTaxPercent: number; makerFeePercent: number }
): Promise<void> {
  const updatedAt = new Date().toISOString();
  const existing = await getUserTaxConfig(userId);
  const badge = resolveBadgeType(existing.merchantBadge);
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

  await writeFallbackBadgeTaxToSupabase(userId, badge, config.seniatTaxPercent);

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
