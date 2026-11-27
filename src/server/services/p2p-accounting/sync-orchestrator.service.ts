import "server-only";
import type { P2POrderRowDto } from "@/features/p2p-ledger/schemas/p2p.schemas";
import {
  formatDateIsoVe,
  getCurrentVetDateIso,
  getVetDayRangeMs,
} from "@/lib/timezone-utc4";
import { decryptBinanceCredentials } from "@/server/security/crypto-vault";
import {
  SupabaseVaultRepository,
  type StoredP2POrderRecord,
} from "@/server/db/supabase-vault.repository";
import {
  fetchBinanceOrdersInRange,
  mapRawItemsToStoredRecords,
  toMirrorOrderDto,
  verifyBinanceApiCredentials,
} from "./binance-c2c-client";
import { enumerateVetDateIsosInRange } from "./vuelta-calculator";

export class P2PSyncOrchestrator {
  private static readonly SYNC_COOLDOWN_MS = 25_000;
  private static readonly INCREMENTAL_OVERLAP_MS = 30 * 60_000;
  private static readonly INITIAL_SYNC_WINDOW_MS = 7 * 86_400_000;
  private static readonly MAX_OPEN_ORDER_LOOKBACK_MS = 48 * 3_600_000;

  private static readonly lastSyncTimestampByUser = new Map<string, number>();
  private static readonly inFlightSyncByUser = new Map<string, Promise<void>>();

  public static clearUserSyncState(userId: string): void {
    this.lastSyncTimestampByUser.delete(userId);
    this.inFlightSyncByUser.delete(userId);
  }

  public static async testBinanceConnection(userId: string): Promise<{
    readonly success: boolean;
    readonly message: string;
    readonly orderCount?: number;
    readonly errorDetails?: string;
  }> {
    const verification = await verifyBinanceApiCredentials(userId);
    if (!verification.success) {
      return verification;
    }

    this.lastSyncTimestampByUser.delete(userId);
    const synced = await this.getUserOrdersFromVaultOrBinance(userId, true);

    return {
      success: true,
      message: `¡Conexión verificada exitosamente con Binance! Se sincronizaron ${synced.length} órdenes del espejo P2P.`,
      orderCount: synced.length,
    };
  }

  public static async syncBinanceRange(
    userId: string,
    startMs: number,
    endMs: number,
    readRange?: {
      readonly startMs?: number | null;
      readonly endMs?: number | null;
    }
  ): Promise<readonly P2POrderRowDto[]> {
    const effectiveReadRange = readRange ?? { startMs, endMs };
    const credential =
      await SupabaseVaultRepository.getBinanceCredential(userId);
    if (!credential) {
      const stored = await SupabaseVaultRepository.getUserOrdersInRange(
        userId,
        effectiveReadRange
      );
      return stored.map(toMirrorOrderDto);
    }

    let freshRecords: StoredP2POrderRecord[] = [];

    try {
      const { apiKey, apiSecret } = decryptBinanceCredentials(
        credential.apiKeyEncrypted,
        credential.iv,
        credential.authTag
      );

      const [buyRes, sellRes] = await Promise.all([
        fetchBinanceOrdersInRange(apiKey, apiSecret, "BUY", startMs, endMs),
        fetchBinanceOrdersInRange(apiKey, apiSecret, "SELL", startMs, endMs),
      ]);

      const combined = [...buyRes.data, ...sellRes.data];
      if (combined.length > 0) {
        freshRecords = mapRawItemsToStoredRecords(userId, combined);
        await SupabaseVaultRepository.saveUserOrders(userId, freshRecords);
      }
      this.lastSyncTimestampByUser.set(userId, Date.now());
    } catch (err) {
      console.error(
        "[P2PSyncOrchestrator] Error sincronizando rango desde Binance:",
        err
      );
    }

    const storedAfter = await SupabaseVaultRepository.getUserOrdersInRange(
      userId,
      effectiveReadRange
    );
    if (freshRecords.length === 0) {
      return storedAfter.map(toMirrorOrderDto);
    }

    const rStart = effectiveReadRange.startMs ?? null;
    const rEnd = effectiveReadRange.endMs ?? null;
    const mergedMap = new Map<string, StoredP2POrderRecord>();
    for (const oldRec of storedAfter) {
      mergedMap.set(oldRec.orderNumber, oldRec);
    }
    for (const fresh of freshRecords) {
      if (rStart !== null && fresh.createTimeMs < rStart) continue;
      if (rEnd !== null && fresh.createTimeMs > rEnd) continue;
      mergedMap.set(fresh.orderNumber, fresh);
    }

    const mergedSorted = Array.from(mergedMap.values()).sort((a, b) => {
      if (b.createTimeMs !== a.createTimeMs) {
        return b.createTimeMs - a.createTimeMs;
      }
      return b.orderNumber.localeCompare(a.orderNumber);
    });

    return mergedSorted.map(toMirrorOrderDto);
  }

  public static async getUserOrdersFromVaultOrBinance(
    userId: string,
    forceFresh: boolean = false,
    targetBounds?: {
      readonly startMs: number | null;
      readonly endMs: number | null;
    }
  ): Promise<readonly P2POrderRowDto[]> {
    const readRange = {
      startMs: targetBounds?.startMs ?? null,
      endMs: targetBounds?.endMs ?? null,
    };

    const credential =
      await SupabaseVaultRepository.getBinanceCredential(userId);

    if (!credential) {
      const stored = await SupabaseVaultRepository.getUserOrdersInRange(
        userId,
        readRange
      );
      return stored.map(toMirrorOrderDto);
    }

    const now = Date.now();
    const defaultEndMs = now + 60_000;

    const isHistoricalRange =
      !forceFresh &&
      readRange.startMs !== null &&
      readRange.endMs !== null &&
      readRange.endMs < now - 60 * 60_000;

    if (
      isHistoricalRange &&
      readRange.startMs !== null &&
      readRange.endMs !== null
    ) {
      const cachedHistorical =
        await SupabaseVaultRepository.getUserOrdersInRange(userId, readRange);
      if (cachedHistorical.length > 0) {
        return cachedHistorical.map(toMirrorOrderDto);
      }
      return this.syncBinanceRange(
        userId,
        readRange.startMs,
        readRange.endMs,
        readRange
      );
    }

    const lastSync = this.lastSyncTimestampByUser.get(userId) ?? 0;
    if (!forceFresh && now - lastSync < this.SYNC_COOLDOWN_MS) {
      const cached = await SupabaseVaultRepository.getUserOrdersInRange(
        userId,
        readRange
      );
      return cached.map(toMirrorOrderDto);
    }

    const activeSync = this.inFlightSyncByUser.get(userId);
    if (activeSync && !forceFresh) {
      await activeSync;
      const cached = await SupabaseVaultRepository.getUserOrdersInRange(
        userId,
        readRange
      );
      return cached.map(toMirrorOrderDto);
    }

    const syncJob = (async (): Promise<void> => {
      let lockAcquired = false;
      let latestSyncedCreateMs = 0;
      let syncErrorMsg: string | null = null;

      try {
        if (!forceFresh) {
          const lockState =
            await SupabaseVaultRepository.tryAcquireDistributedSyncLock(
              userId,
              this.SYNC_COOLDOWN_MS
            );
          if (!lockState.acquired) {
            this.lastSyncTimestampByUser.set(userId, Date.now());
            return;
          }
          lockAcquired = true;
        }

        const [latestStoredMs, oldestOpenMs] = await Promise.all([
          SupabaseVaultRepository.getLatestOrderTimestampMs(userId),
          SupabaseVaultRepository.getOldestOpenOrderTimestampMs(
            userId,
            this.MAX_OPEN_ORDER_LOOKBACK_MS
          ),
        ]);

        let syncStartMs: number;
        if (forceFresh) {
          syncStartMs =
            readRange.startMs ?? now - this.INITIAL_SYNC_WINDOW_MS;
        } else if (latestStoredMs > 0) {
          const cursorWithOverlap = Math.max(
            0,
            latestStoredMs - this.INCREMENTAL_OVERLAP_MS
          );
          const openOrderStart =
            oldestOpenMs !== null
              ? Math.max(0, oldestOpenMs - 5 * 60_000)
              : cursorWithOverlap;
          syncStartMs = Math.max(
            now - this.MAX_OPEN_ORDER_LOOKBACK_MS,
            Math.min(cursorWithOverlap, openOrderStart)
          );
        } else {
          syncStartMs =
            readRange.startMs !== null
              ? Math.max(readRange.startMs, now - this.INITIAL_SYNC_WINDOW_MS)
              : now - this.INITIAL_SYNC_WINDOW_MS;
        }

        const { apiKey, apiSecret } = decryptBinanceCredentials(
          credential.apiKeyEncrypted,
          credential.iv,
          credential.authTag
        );

        const [buyRes, sellRes] = await Promise.all([
          fetchBinanceOrdersInRange(
            apiKey,
            apiSecret,
            "BUY",
            syncStartMs,
            defaultEndMs
          ),
          fetchBinanceOrdersInRange(
            apiKey,
            apiSecret,
            "SELL",
            syncStartMs,
            defaultEndMs
          ),
        ]);

        const combined = [...buyRes.data, ...sellRes.data];
        if (combined.length > 0) {
          const freshRecords = mapRawItemsToStoredRecords(userId, combined);
          for (const rec of freshRecords) {
            if (rec.createTimeMs > latestSyncedCreateMs) {
              latestSyncedCreateMs = rec.createTimeMs;
            }
          }
          await SupabaseVaultRepository.saveUserOrders(userId, freshRecords);
        } else {
          latestSyncedCreateMs = latestStoredMs;
        }

        if (!buyRes.success && buyRes.error) {
          syncErrorMsg = buyRes.error;
        } else if (!sellRes.success && sellRes.error) {
          syncErrorMsg = sellRes.error;
        }

        this.lastSyncTimestampByUser.set(userId, Date.now());
      } catch (err) {
        syncErrorMsg = err instanceof Error ? err.message : String(err);
        console.error(
          "[P2PSyncOrchestrator] Error en sincronización incremental:",
          syncErrorMsg
        );
      } finally {
        if (lockAcquired) {
          await SupabaseVaultRepository.releaseDistributedSyncLock(
            userId,
            latestSyncedCreateMs,
            syncErrorMsg
          );
        }
        P2PSyncOrchestrator.inFlightSyncByUser.delete(userId);
      }
    })();

    this.inFlightSyncByUser.set(userId, syncJob);
    await syncJob;

    const resultOrders = await SupabaseVaultRepository.getUserOrdersInRange(
      userId,
      readRange
    );

    if (
      readRange.startMs !== null &&
      readRange.startMs < now - this.INITIAL_SYNC_WINDOW_MS &&
      resultOrders.length === 0
    ) {
      return this.syncBinanceRange(
        userId,
        readRange.startMs,
        readRange.endMs ?? defaultEndMs,
        readRange
      );
    }

    return resultOrders.map(toMirrorOrderDto);
  }

  public static async ensureRangeCompletelySynced(
    userId: string,
    startMs: number,
    endMs: number,
    options?: {
      readonly totalBudgetMs?: number;
      readonly maxPagesPerDay?: number;
      readonly concurrency?: number;
      readonly forceRefreshToday?: boolean;
    }
  ): Promise<{
    readonly orders: readonly P2POrderRowDto[];
    readonly isComplete: boolean;
    readonly incompleteDays: readonly string[];
    readonly warningMessage?: string;
  }> {
    const totalBudgetMs = options?.totalBudgetMs ?? 45_000;
    const maxPagesPerDay = options?.maxPagesPerDay ?? 40;
    const concurrency = Math.max(1, Math.min(options?.concurrency ?? 3, 4));
    const forceRefreshToday = options?.forceRefreshToday ?? true;

    const credential =
      await SupabaseVaultRepository.getBinanceCredential(userId);
    if (!credential) {
      const stored = await SupabaseVaultRepository.getUserOrdersInRange(
        userId,
        { startMs, endMs }
      );
      return {
        orders: stored.map(toMirrorOrderDto),
        isComplete: true,
        incompleteDays: [],
      };
    }

    const nowMs = Date.now();
    const dateIsos = enumerateVetDateIsosInRange(startMs, endMs, nowMs);
    if (dateIsos.length === 0) {
      const stored = await SupabaseVaultRepository.getUserOrdersInRange(
        userId,
        { startMs, endMs }
      );
      return {
        orders: stored.map(toMirrorOrderDto),
        isComplete: true,
        incompleteDays: [],
      };
    }

    const firstIso = dateIsos[0]!;
    const lastIso = dateIsos[dateIsos.length - 1]!;
    const todayIso = getCurrentVetDateIso(nowMs);
    const coverageMap = await SupabaseVaultRepository.getSyncedDayCoverage(
      userId,
      firstIso,
      lastIso
    );

    const daysToSync: string[] = [];
    for (const dayIso of dateIsos) {
      const dayRange = getVetDayRangeMs(dayIso);
      const isClosedPastDay = dayRange.endMs < nowMs - 60 * 60_000;
      const cov = coverageMap.get(dayIso);

      if (
        isClosedPastDay &&
        cov &&
        cov.isComplete &&
        cov.openOrdersCount === 0
      ) {
        continue;
      }

      if (dayIso === todayIso && !forceRefreshToday) {
        const lastSync = this.lastSyncTimestampByUser.get(userId) ?? 0;
        if (nowMs - lastSync < this.SYNC_COOLDOWN_MS) {
          continue;
        }
      }

      daysToSync.push(dayIso);
    }

    const incompleteDays: string[] = [];
    const freshRecordsMap = new Map<string, StoredP2POrderRecord>();

    if (daysToSync.length > 0) {
      const startedAtMs = Date.now();
      let rateLimitedHit = false;

      const { apiKey, apiSecret } = decryptBinanceCredentials(
        credential.apiKeyEncrypted,
        credential.iv,
        credential.authTag
      );

      for (let i = 0; i < daysToSync.length; i += concurrency) {
        const batch = daysToSync.slice(i, i + concurrency);
        const elapsed = Date.now() - startedAtMs;
        if (rateLimitedHit || elapsed >= totalBudgetMs) {
          incompleteDays.push(...daysToSync.slice(i));
          break;
        }

        const remainingBudget = Math.max(4_000, totalBudgetMs - elapsed);
        const perDayBudget = Math.min(18_000, remainingBudget);

        const batchResults = await Promise.all(
          batch.map(async (dayIso) => {
            const dayRange = getVetDayRangeMs(dayIso);
            const effectiveEndMs = Math.min(dayRange.endMs, Date.now() + 60_000);
            try {
              const [buyRes, sellRes] = await Promise.all([
                fetchBinanceOrdersInRange(
                  apiKey,
                  apiSecret,
                  "BUY",
                  dayRange.startMs,
                  effectiveEndMs,
                  maxPagesPerDay,
                  perDayBudget
                ),
                fetchBinanceOrdersInRange(
                  apiKey,
                  apiSecret,
                  "SELL",
                  dayRange.startMs,
                  effectiveEndMs,
                  maxPagesPerDay,
                  perDayBudget
                ),
              ]);

              const combined = [...buyRes.data, ...sellRes.data];
              const mapped =
                combined.length > 0
                  ? mapRawItemsToStoredRecords(userId, combined)
                  : [];

              if (mapped.length > 0) {
                await SupabaseVaultRepository.saveUserOrders(userId, mapped);
              }

              const openOrdersCount = mapped.filter(
                (r) =>
                  r.statusCategory === "IN_PROGRESS" ||
                  r.statusCategory === "IN_APPEAL"
              ).length;

              const hitRateLimit =
                String(buyRes.error ?? "").includes("429") ||
                String(buyRes.error ?? "").includes("418") ||
                String(sellRes.error ?? "").includes("429") ||
                String(sellRes.error ?? "").includes("418");

              const dayFullySynced =
                buyRes.success &&
                sellRes.success &&
                !buyRes.truncatedByBudget &&
                !sellRes.truncatedByBudget;

              const isClosedPastDay =
                dayRange.endMs < Date.now() - 60 * 60_000;

              if (dayFullySynced && isClosedPastDay) {
                await SupabaseVaultRepository.upsertDayCoverage({
                  userId,
                  dateIsoVet: dayIso,
                  isComplete: true,
                  buyCount: buyRes.data.length,
                  sellCount: sellRes.data.length,
                  openOrdersCount,
                  syncedAt: new Date().toISOString(),
                });
              }

              return {
                dayIso,
                mapped,
                dayFullySynced,
                hitRateLimit,
              };
            } catch {
              return {
                dayIso,
                mapped: [] as StoredP2POrderRecord[],
                dayFullySynced: false,
                hitRateLimit: false,
              };
            }
          })
        );

        for (const res of batchResults) {
          for (const rec of res.mapped) {
            freshRecordsMap.set(rec.orderNumber, rec);
          }
          if (!res.dayFullySynced) {
            incompleteDays.push(res.dayIso);
          }
          if (res.hitRateLimit) {
            rateLimitedHit = true;
          }
        }
      }

      if (incompleteDays.length === 0) {
        this.lastSyncTimestampByUser.set(userId, Date.now());
      }
    }

    const storedAfter = await SupabaseVaultRepository.getUserOrdersInRange(
      userId,
      { startMs, endMs }
    );

    const mergedMap = new Map<string, StoredP2POrderRecord>();
    for (const oldRec of storedAfter) {
      mergedMap.set(oldRec.orderNumber, oldRec);
    }
    for (const fresh of freshRecordsMap.values()) {
      if (fresh.createTimeMs < startMs || fresh.createTimeMs > endMs) continue;
      mergedMap.set(fresh.orderNumber, fresh);
    }

    const mergedSorted = Array.from(mergedMap.values()).sort((a, b) => {
      if (b.createTimeMs !== a.createTimeMs) {
        return b.createTimeMs - a.createTimeMs;
      }
      return b.orderNumber.localeCompare(a.orderNumber);
    });

    const uniqueIncomplete = Array.from(new Set(incompleteDays)).sort((a, b) =>
      a.localeCompare(b)
    );
    const isComplete = uniqueIncomplete.length === 0;
    const warningMessage = !isComplete
      ? `Sincronización parcial por volumen/límite de Binance: faltan ${uniqueIncomplete.length} día(s) (${uniqueIncomplete.slice(0, 5).map(formatDateIsoVe).join(", ")}${uniqueIncomplete.length > 5 ? "..." : ""}). Vuelve a pulsar descargar para completar los días restantes (los ya sincronizados quedaron guardados).`
      : undefined;

    return {
      orders: mergedSorted.map(toMirrorOrderDto),
      isComplete,
      incompleteDays: uniqueIncomplete,
      warningMessage,
    };
  }
}
