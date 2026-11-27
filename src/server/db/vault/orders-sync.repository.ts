import "server-only";
import { supabase } from "@/lib/supabase";
import { UTC_MINUS_4_OFFSET_MS } from "@/lib/timezone-utc4";
import type { OrderStatusCategory } from "@/features/p2p-ledger/schemas/p2p.schemas";
import {
  dayCoverageMemoryCache,
  packOrderV2Metadata,
  readLocalDb,
  resolvePositiveTotalPriceVes,
  unpackOrderV2Metadata,
  vaultSchemaFlags,
  writeLocalDb,
} from "./vault-local-store";
import type {
  StoredP2POrderRecord,
  SyncedDayCoverageRecord,
} from "./vault.types";

function parseCreateTimeFallback(label: string, createdAtIso?: string): number {
  const m = /(\d{2})\/(\d{2})\/(\d{4})[^\d]+(\d{1,2}):(\d{2}):(\d{2})/.exec(
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
    return Date.UTC(year, month - 1, day, hh, mm, ss) - UTC_MINUS_4_OFFSET_MS;
  }
  if (createdAtIso) {
    const parsedIso = Date.parse(createdAtIso);
    if (Number.isFinite(parsedIso) && parsedIso > 0) {
      return parsedIso;
    }
  }
  return 0;
}

function normalizeStatusCat(rawStatus: string): OrderStatusCategory {
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
}

function sortChronologicalDesc(
  list: StoredP2POrderRecord[]
): StoredP2POrderRecord[] {
  return [...list].sort((a, b) => {
    if (b.createTimeMs !== a.createTimeMs) {
      return b.createTimeMs - a.createTimeMs;
    }
    return b.orderNumber.localeCompare(a.orderNumber);
  });
}

export async function getUserOrders(
  userId: string
): Promise<readonly StoredP2POrderRecord[]> {
  return getUserOrdersInRange(userId);
}

export async function getUserOrdersInRange(
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
      const totalPriceVes = resolvePositiveTotalPriceVes({
        candidates: [legacy.totalPriceVes, unpacked.totalPriceVes],
        amountUsdt: String(o.amountUsdt ?? "0"),
        unitPriceVes: String(o.unitPriceVes ?? "0"),
      });

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
        totalPriceVes,
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

      if (vaultSchemaFlags.p2pOrdersHasV2Columns !== false) {
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
          vaultSchemaFlags.p2pOrdersHasV2Columns = false;
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
      } else if (vaultSchemaFlags.p2pOrdersHasV2Columns === null) {
        vaultSchemaFlags.p2pOrdersHasV2Columns = true;
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
        const totalPriceVes = resolvePositiveTotalPriceVes({
          candidates: [
            row.total_price_ves,
            unpacked.totalPriceVes,
            localMatch?.totalPriceVes,
          ],
          amountUsdt: amountStr,
          unitPriceVes: unitPriceStr,
        });

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
          fiat: String(row.fiat || unpacked.fiat || localMatch?.fiat || "VES"),
          payMethodName: String(row.pay_method_name || "Banesco"),
          counterPartNickName: String(row.counter_part_nick_name),
          amountUsdt: amountStr,
          commissionUsdt: String(row.commission_usdt ?? "0"),
          unitPriceVes: unitPriceStr,
          totalPriceVes,
          costBasisRateVes: unpacked.costBasisRateVes,
        };
      });

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

export async function getLatestOrderTimestampMs(
  userId: string
): Promise<number> {
  try {
    if (vaultSchemaFlags.p2pOrdersHasV2Columns !== false) {
      const { data, error } = await supabase
        .from("p2p_orders")
        .select("create_time_ms")
        .eq("user_id", userId)
        .order("create_time_ms", { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        vaultSchemaFlags.p2pOrdersHasV2Columns = true;
        const ts = Number(
          (data[0] as Record<string, unknown>)?.create_time_ms ?? 0
        );
        if (Number.isFinite(ts) && ts > 0) return ts;
      } else if (error) {
        vaultSchemaFlags.p2pOrdersHasV2Columns = false;
      }
    }

    if (vaultSchemaFlags.p2pOrdersHasV2Columns === false) {
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

export async function getOldestOpenOrderTimestampMs(
  userId: string,
  lookbackMs: number = 48 * 3_600_000
): Promise<number | null> {
  const cutoff = Date.now() - lookbackMs;
  try {
    if (vaultSchemaFlags.p2pOrdersHasV2Columns !== false) {
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

export async function tryAcquireDistributedSyncLock(
  userId: string,
  cooldownMs: number,
  lockTtlMs: number = 35_000
): Promise<{
  readonly acquired: boolean;
  readonly lastOrderCreateMs: number;
  readonly recentlySynced: boolean;
}> {
  if (vaultSchemaFlags.syncStateTableAvailable === false) {
    return { acquired: true, lastOrderCreateMs: 0, recentlySynced: false };
  }

  const nowMs = Date.now();
  const lockUntilIso = new Date(nowMs + lockTtlMs).toISOString();

  try {
    const { data, error } = await supabase
      .from("p2p_sync_state")
      .select("last_order_create_ms, lock_until, last_sync_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      vaultSchemaFlags.syncStateTableAvailable = false;
      return { acquired: true, lastOrderCreateMs: 0, recentlySynced: false };
    }

    vaultSchemaFlags.syncStateTableAvailable = true;

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
    vaultSchemaFlags.syncStateTableAvailable = false;
    return { acquired: true, lastOrderCreateMs: 0, recentlySynced: false };
  }
}

export async function releaseDistributedSyncLock(
  userId: string,
  lastOrderCreateMs?: number,
  errorMessage?: string | null
): Promise<void> {
  if (vaultSchemaFlags.syncStateTableAvailable !== true) return;
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

export async function getSyncedDayCoverage(
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

  if (vaultSchemaFlags.dayCoverageTableAvailable === false) {
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
      vaultSchemaFlags.dayCoverageTableAvailable = false;
      return result;
    }

    vaultSchemaFlags.dayCoverageTableAvailable = true;
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
    vaultSchemaFlags.dayCoverageTableAvailable = false;
  }

  return result;
}

export async function upsertDayCoverage(
  record: SyncedDayCoverageRecord
): Promise<void> {
  dayCoverageMemoryCache.set(`${record.userId}:${record.dateIsoVet}`, record);

  if (vaultSchemaFlags.dayCoverageTableAvailable === false) {
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
      vaultSchemaFlags.dayCoverageTableAvailable = false;
    } else {
      vaultSchemaFlags.dayCoverageTableAvailable = true;
    }
  } catch {
    vaultSchemaFlags.dayCoverageTableAvailable = false;
  }
}

export async function saveUserOrders(
  userId: string,
  orders: readonly StoredP2POrderRecord[]
): Promise<void> {
  if (orders.length === 0) return;

  // Deduplicar por orderNumber antes de hacer upsert (evita error Postgres 21000 en lotes con solapamiento de paginación)
  const dedupedMap = new Map<string, StoredP2POrderRecord>();
  for (const order of orders) {
    if (order.orderNumber) {
      dedupedMap.set(order.orderNumber, order);
    }
  }
  const uniqueOrders = Array.from(dedupedMap.values());
  if (uniqueOrders.length === 0) return;

  let remoteSavedOk = false;

  try {
    const fullPayload = uniqueOrders.map((o) => ({
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
    ): Promise<{
      readonly error: {
        readonly message?: string;
        readonly code?: string;
      } | null;
    }> => {
      if (vaultSchemaFlags.p2pOrdersHasCompositePk !== false) {
        const res = await supabase
          .from("p2p_orders")
          .upsert(rows, { onConflict: "user_id,order_number" });
        if (!res.error) {
          vaultSchemaFlags.p2pOrdersHasCompositePk = true;
          return { error: null };
        }
        const msg = String(res.error.message ?? "");
        const code = String(res.error.code ?? "");
        if (
          code === "42P10" ||
          msg.toLowerCase().includes("no unique or exclusion constraint")
        ) {
          vaultSchemaFlags.p2pOrdersHasCompositePk = false;
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
      let needLegacyFallback =
        vaultSchemaFlags.p2pOrdersHasV2Columns === false;

      if (!needLegacyFallback) {
        const { error } = await upsertWithPkFallback(chunk);
        if (error) {
          vaultSchemaFlags.p2pOrdersHasV2Columns = false;
          needLegacyFallback = true;
        } else {
          vaultSchemaFlags.p2pOrdersHasV2Columns = true;
          anyRemoteSuccess = true;
        }
      }

      if (needLegacyFallback) {
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
  for (const fresh of uniqueOrders) {
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
