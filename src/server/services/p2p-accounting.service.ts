import "server-only";
import type {
  BankLiveMonitorDto,
  DailyClosingActaDto,
  DailyTotalClosureDto,
  LotMethod,
  MerchantBadgeConfigDto,
  MerchantBadgeType,
  OrderStatusFilter,
  P2POrderRowDto,
  PeriodFilter,
  PnlSummaryDto,
  ShiftClosureDto,
  ShiftDashboardStateDto,
  TradeTypeFilter,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import {
  formatDecimalMoney,
  formatExactDecimalString,
  parseSafeDecimal,
} from "./p2p-accounting/decimal-utils";
import {
  countExcludedCompletedOrders,
  deduplicateOrdersByNumber,
  evaluateOrderCalculationEligibility,
  mapBinanceOrderStatus,
  mergeChronologicalOrders,
  type OrderEligibilityResult,
} from "./p2p-accounting/order-eligibility";
import {
  buildAggregatedSummaryFromClosures,
  buildDailyBreakdownAndMonthlySummary,
  calculateVueltaSummary,
  calculateWeightedOrderTotals,
  enumerateVetDateIsosInRange,
  type WeightedOrderTotals,
} from "./p2p-accounting/vuelta-calculator";
import { P2PSyncOrchestrator } from "./p2p-accounting/sync-orchestrator.service";
import {
  P2PShiftAndReportsService,
  type ClosingReportData,
} from "./p2p-accounting/shift-and-reports.service";

export {
  buildAggregatedSummaryFromClosures,
  buildDailyBreakdownAndMonthlySummary,
  calculateVueltaSummary,
  calculateWeightedOrderTotals,
  countExcludedCompletedOrders,
  deduplicateOrdersByNumber,
  enumerateVetDateIsosInRange,
  evaluateOrderCalculationEligibility,
  formatDecimalMoney,
  formatExactDecimalString,
  mapBinanceOrderStatus,
  mergeChronologicalOrders,
  parseSafeDecimal,
};

export type {
  ClosingReportData,
  OrderEligibilityResult,
  WeightedOrderTotals,
};

/**
 * Fachada pública unificada sobre los módulos en `src/server/services/p2p-accounting/*`.
 * Conserva 100% de compatibilidad con rutas Hono, exportadores Excel/PDF/CSV y consumidores actuales.
 */
export class P2PAccountingService {
  // --- Sincronización y Conexión Binance ---
  public static testBinanceConnection(userId: string) {
    return P2PSyncOrchestrator.testBinanceConnection(userId);
  }

  public static syncBinanceRange(
    userId: string,
    startMs: number,
    endMs: number,
    readRange?: {
      readonly startMs?: number | null;
      readonly endMs?: number | null;
    }
  ): Promise<readonly P2POrderRowDto[]> {
    return P2PSyncOrchestrator.syncBinanceRange(
      userId,
      startMs,
      endMs,
      readRange
    );
  }

  public static getUserOrdersFromVaultOrBinance(
    userId: string,
    forceFresh: boolean = false,
    targetBounds?: {
      readonly startMs: number | null;
      readonly endMs: number | null;
    }
  ): Promise<readonly P2POrderRowDto[]> {
    return P2PSyncOrchestrator.getUserOrdersFromVaultOrBinance(
      userId,
      forceFresh,
      targetBounds
    );
  }

  public static ensureRangeCompletelySynced(
    userId: string,
    startMs: number,
    endMs: number,
    options?: {
      readonly totalBudgetMs?: number;
      readonly maxPagesPerDay?: number;
      readonly concurrency?: number;
      readonly forceRefreshToday?: boolean;
    }
  ) {
    return P2PSyncOrchestrator.ensureRangeCompletelySynced(
      userId,
      startMs,
      endMs,
      options
    );
  }

  // --- KPIs, Órdenes, Jornadas y Reportes ---
  public static getSummary(params: {
    readonly userId: string;
    readonly period: PeriodFilter;
    readonly method: LotMethod;
    readonly date?: string;
    readonly month?: string;
  }): Promise<PnlSummaryDto> {
    return P2PShiftAndReportsService.getSummary(params);
  }

  public static getPaginatedOrders(params: {
    readonly userId: string;
    readonly period?: PeriodFilter;
    readonly tradeType: TradeTypeFilter;
    readonly status?: OrderStatusFilter;
    readonly bank?: string;
    readonly date?: string;
    readonly month?: string;
    readonly page: number;
    readonly limit: number;
  }) {
    return P2PShiftAndReportsService.getPaginatedOrders(params);
  }

  public static consolidateDayClosures(
    userId: string,
    dateIsoVet: string
  ): Promise<DailyTotalClosureDto | null> {
    return P2PShiftAndReportsService.consolidateDayClosures(userId, dateIsoVet);
  }

  public static ensurePendingDailyClosuresConsolidated(
    userId: string,
    forceCloseIf2359Today: boolean = false
  ): Promise<void> {
    return P2PShiftAndReportsService.ensurePendingDailyClosuresConsolidated(
      userId,
      forceCloseIf2359Today
    );
  }

  public static getShiftDashboardState(
    userId: string,
    dateIso?: string
  ): Promise<ShiftDashboardStateDto> {
    return P2PShiftAndReportsService.getShiftDashboardState(userId, dateIso);
  }

  public static startShift(userId: string): Promise<ShiftDashboardStateDto> {
    return P2PShiftAndReportsService.startShift(userId);
  }

  public static closeShift(userId: string): Promise<{
    readonly closure: ShiftClosureDto | null;
    readonly state: ShiftDashboardStateDto;
  }> {
    return P2PShiftAndReportsService.closeShift(userId);
  }

  public static runCronDailyCloseAllUsers() {
    return P2PShiftAndReportsService.runCronDailyCloseAllUsers();
  }

  public static buildClosingReport(params: {
    readonly userId: string;
    readonly scope: "DAY" | "MONTH" | "SHIFT";
    readonly date?: string;
    readonly month?: string;
    readonly shiftId?: string;
  }): Promise<ClosingReportData> {
    return P2PShiftAndReportsService.buildClosingReport(params);
  }

  public static getDailyClosings(userId: string): Promise<{
    readonly monthGrossUsdt: string;
    readonly monthGrossVes: string;
    readonly monthSeniatTax16Usdt: string;
    readonly monthSeniatTax16Ves: string;
    readonly monthNetFreeUsdt: string;
    readonly monthNetFreeVes: string;
    readonly closings: readonly DailyClosingActaDto[];
    readonly vaultStatus: {
      readonly isConfigured: boolean;
      readonly label: string;
      readonly apiKeyMasked: string;
      readonly isReadOnlyVerified: boolean;
      readonly withdrawalsBlocked: boolean;
      readonly spotTradingBlocked: boolean;
    };
  }> {
    return P2PShiftAndReportsService.getDailyClosings(userId);
  }

  public static saveBinanceVaultCredentials(params: {
    readonly userId: string;
    readonly label: string;
    readonly apiKey: string;
    readonly apiSecret: string;
  }) {
    return P2PShiftAndReportsService.saveBinanceVaultCredentials(params);
  }

  public static unlinkBinanceVaultCredentials(userId: string) {
    return P2PShiftAndReportsService.unlinkBinanceVaultCredentials(userId);
  }

  public static getVenezuelanBanksMonitor(
    amount: number = 5000
  ): Promise<readonly BankLiveMonitorDto[]> {
    return P2PShiftAndReportsService.getVenezuelanBanksMonitor(amount);
  }

  public static getMerchantBadgeConfig(
    userId: string
  ): Promise<MerchantBadgeConfigDto> {
    return P2PShiftAndReportsService.getMerchantBadgeConfig(userId);
  }

  public static updateMerchantBadgeConfig(
    userId: string,
    badge: MerchantBadgeType
  ): Promise<MerchantBadgeConfigDto> {
    return P2PShiftAndReportsService.updateMerchantBadgeConfig(userId, badge);
  }

  public static getUserTaxConfig(userId: string) {
    return P2PShiftAndReportsService.getUserTaxConfig(userId);
  }

  public static updateUserTaxConfig(
    userId: string,
    input: { seniatTaxPercent: number; makerFeePercent: number }
  ) {
    return P2PShiftAndReportsService.updateUserTaxConfig(userId, input);
  }
}
