import "server-only";
import type {
  ActiveShiftDto,
  DailyClosingActaDto,
  DailyTotalClosureDto,
  MerchantBadgeConfigDto,
  MerchantBadgeType,
  ShiftClosureDto,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import * as usersCredentialsRepo from "./vault/users-credentials.repository";
import * as ordersSyncRepo from "./vault/orders-sync.repository";
import * as taxBadgeRepo from "./vault/tax-badge.repository";
import * as shiftsClosingsRepo from "./vault/shifts-closings.repository";
import type {
  StoredP2POrderRecord,
  StoredUserRecord,
  StoredUserTaxConfigRecord,
  StoredVaultCredentialRecord,
  SyncedDayCoverageRecord,
} from "./vault/vault.types";

export type {
  StoredP2POrderRecord,
  StoredUserRecord,
  StoredUserTaxConfigRecord,
  StoredVaultCredentialRecord,
  SyncedDayCoverageRecord,
};

/**
 * Fachada unificada de compatibilidad sobre los repositorios modulares en `src/server/db/vault/*`.
 * Mantiene intactas las firmas públicas de `SupabaseVaultRepository` para toda la aplicación.
 */
export class SupabaseVaultRepository {
  // --- Usuarios y Credenciales ---
  public static findUserByEmail(
    email: string
  ): Promise<StoredUserRecord | null> {
    return usersCredentialsRepo.findUserByEmail(email);
  }

  public static findUserById(userId: string): Promise<StoredUserRecord | null> {
    return usersCredentialsRepo.findUserById(userId);
  }

  public static createUser(
    record: StoredUserRecord
  ): Promise<StoredUserRecord> {
    return usersCredentialsRepo.createUser(record);
  }

  public static getAllUserIds(): Promise<readonly string[]> {
    return usersCredentialsRepo.getAllUserIds();
  }

  public static getBinanceCredential(
    userId: string
  ): Promise<StoredVaultCredentialRecord | null> {
    return usersCredentialsRepo.getBinanceCredential(userId);
  }

  public static saveBinanceCredential(
    cred: StoredVaultCredentialRecord
  ): Promise<void> {
    return usersCredentialsRepo.saveBinanceCredential(cred);
  }

  public static deleteBinanceCredentialAndOrders(
    userId: string
  ): Promise<void> {
    return usersCredentialsRepo.deleteBinanceCredentialAndOrders(userId);
  }

  // --- Órdenes y Sincronización ---
  public static getUserOrders(
    userId: string
  ): Promise<readonly StoredP2POrderRecord[]> {
    return ordersSyncRepo.getUserOrders(userId);
  }

  public static getUserOrdersInRange(
    userId: string,
    range?: {
      readonly startMs?: number | null;
      readonly endMs?: number | null;
      readonly maxPages?: number;
    }
  ): Promise<readonly StoredP2POrderRecord[]> {
    return ordersSyncRepo.getUserOrdersInRange(userId, range);
  }

  public static getLatestOrderTimestampMs(userId: string): Promise<number> {
    return ordersSyncRepo.getLatestOrderTimestampMs(userId);
  }

  public static getOldestOpenOrderTimestampMs(
    userId: string,
    lookbackMs?: number
  ): Promise<number | null> {
    return ordersSyncRepo.getOldestOpenOrderTimestampMs(userId, lookbackMs);
  }

  public static tryAcquireDistributedSyncLock(
    userId: string,
    cooldownMs: number,
    lockTtlMs?: number
  ): Promise<{
    readonly acquired: boolean;
    readonly lastOrderCreateMs: number;
    readonly recentlySynced: boolean;
  }> {
    return ordersSyncRepo.tryAcquireDistributedSyncLock(
      userId,
      cooldownMs,
      lockTtlMs
    );
  }

  public static releaseDistributedSyncLock(
    userId: string,
    lastOrderCreateMs?: number,
    errorMessage?: string | null
  ): Promise<void> {
    return ordersSyncRepo.releaseDistributedSyncLock(
      userId,
      lastOrderCreateMs,
      errorMessage
    );
  }

  public static getSyncedDayCoverage(
    userId: string,
    startDateIso: string,
    endDateIso: string
  ): Promise<ReadonlyMap<string, SyncedDayCoverageRecord>> {
    return ordersSyncRepo.getSyncedDayCoverage(
      userId,
      startDateIso,
      endDateIso
    );
  }

  public static upsertDayCoverage(
    record: SyncedDayCoverageRecord
  ): Promise<void> {
    return ordersSyncRepo.upsertDayCoverage(record);
  }

  public static saveUserOrders(
    userId: string,
    orders: readonly StoredP2POrderRecord[]
  ): Promise<void> {
    return ordersSyncRepo.saveUserOrders(userId, orders);
  }

  // --- Insignia y Configuración Fiscal ---
  public static getMerchantBadgeConfig(
    userId: string
  ): Promise<MerchantBadgeConfigDto> {
    return taxBadgeRepo.getMerchantBadgeConfig(userId);
  }

  public static saveMerchantBadgeConfig(
    userId: string,
    badge: MerchantBadgeType
  ): Promise<MerchantBadgeConfigDto> {
    return taxBadgeRepo.saveMerchantBadgeConfig(userId, badge);
  }

  public static getUserTaxConfig(userId: string): Promise<{
    seniatTaxPercent: number;
    makerFeePercent: number;
    merchantBadge: MerchantBadgeType;
    badgeFeePercent: number;
  }> {
    return taxBadgeRepo.getUserTaxConfig(userId);
  }

  public static saveUserTaxConfig(
    userId: string,
    config: { seniatTaxPercent: number; makerFeePercent: number }
  ): Promise<void> {
    return taxBadgeRepo.saveUserTaxConfig(userId, config);
  }

  // --- Jornadas y Cierres ---
  public static getUserClosings(
    userId: string
  ): Promise<readonly DailyClosingActaDto[]> {
    return shiftsClosingsRepo.getUserClosings(userId);
  }

  public static getActiveShift(userId: string): Promise<ActiveShiftDto | null> {
    return shiftsClosingsRepo.getActiveShift(userId);
  }

  public static saveActiveShift(shift: ActiveShiftDto): Promise<void> {
    return shiftsClosingsRepo.saveActiveShift(shift);
  }

  public static clearActiveShift(userId: string): Promise<void> {
    return shiftsClosingsRepo.clearActiveShift(userId);
  }

  public static saveShiftClosure(closure: ShiftClosureDto): Promise<void> {
    return shiftsClosingsRepo.saveShiftClosure(closure);
  }

  public static getAllUserShiftClosures(
    userId: string
  ): Promise<readonly ShiftClosureDto[]> {
    return shiftsClosingsRepo.getAllUserShiftClosures(userId);
  }

  public static getShiftClosuresByDate(
    userId: string,
    dateIsoVet: string
  ): Promise<readonly ShiftClosureDto[]> {
    return shiftsClosingsRepo.getShiftClosuresByDate(userId, dateIsoVet);
  }

  public static getShiftClosureById(
    userId: string,
    shiftId: string
  ): Promise<ShiftClosureDto | null> {
    return shiftsClosingsRepo.getShiftClosureById(userId, shiftId);
  }

  public static saveDailyTotalClosure(
    closure: DailyTotalClosureDto,
    integrityHashSha256: string
  ): Promise<void> {
    return shiftsClosingsRepo.saveDailyTotalClosure(
      closure,
      integrityHashSha256
    );
  }

  public static getAllUserDailyTotalClosures(
    userId: string
  ): Promise<readonly DailyTotalClosureDto[]> {
    return shiftsClosingsRepo.getAllUserDailyTotalClosures(userId);
  }

  public static getDailyTotalClosureByDate(
    userId: string,
    dateIsoVet: string
  ): Promise<DailyTotalClosureDto | null> {
    return shiftsClosingsRepo.getDailyTotalClosureByDate(userId, dateIsoVet);
  }

  public static getDailyTotalClosuresByMonth(
    userId: string,
    monthIsoVet: string
  ): Promise<readonly DailyTotalClosureDto[]> {
    return shiftsClosingsRepo.getDailyTotalClosuresByMonth(userId, monthIsoVet);
  }
}
