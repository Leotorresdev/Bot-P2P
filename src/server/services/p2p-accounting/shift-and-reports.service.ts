import "server-only";
import crypto from "node:crypto";
import {
  MERCHANT_BADGE_META,
  type ActiveShiftDto,
  type BankLiveMonitorDto,
  type DailyClosingActaDto,
  type DailyTotalClosureDto,
  type LotMethod,
  type MerchantBadgeConfigDto,
  type MerchantBadgeType,
  type OrderStatusFilter,
  type P2POrderRowDto,
  type PeriodFilter,
  type PnlSummaryDto,
  type ShiftClosureDto,
  type ShiftDashboardStateDto,
  type ShiftDigestMetaDto,
  type TradeTypeFilter,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import {
  formatDateIsoVe,
  formatVetOrderTimestamp,
  getCurrentVetDateIso,
  getCurrentVetMonthIso,
  getVetDayRangeMs,
  getVetMonthRangeMs,
} from "@/lib/timezone-utc4";
import { encryptBinanceCredentials } from "@/server/security/crypto-vault";
import { BinanceP2PLiveService } from "@/server/services/binance-p2p-live.service";
import { SupabaseVaultRepository } from "@/server/db/supabase-vault.repository";
import {
  Decimal,
  formatDecimalMoney,
  parseSafeDecimal,
} from "./decimal-utils";
import {
  countExcludedCompletedOrders,
  mergeChronologicalOrders,
} from "./order-eligibility";
import { P2PSyncOrchestrator } from "./sync-orchestrator.service";
import {
  buildAggregatedSummaryFromClosures,
  buildDailyBreakdownAndMonthlySummary,
  calculateVueltaSummary,
  resolvePeriodBounds,
} from "./vuelta-calculator";

export interface ClosingReportData {
  readonly scope: "DAY" | "MONTH" | "SHIFT";
  readonly periodKey: string;
  readonly periodLabel: string;
  readonly generatedAtVet: string;
  readonly summary: PnlSummaryDto;
  readonly orders: readonly P2POrderRowDto[];
  readonly dailyClosures?: readonly DailyTotalClosureDto[];
  readonly totalShiftsInPeriod?: number;
  readonly excludedNonUsdtCount?: number;
  readonly excludedNonVesCount?: number;
  readonly syncComplete?: boolean;
  readonly incompleteDays?: readonly string[];
  readonly syncWarning?: string;
}

export class P2PShiftAndReportsService {
  public static async getSummary(params: {
    readonly userId: string;
    readonly period: PeriodFilter;
    readonly method: LotMethod;
    readonly date?: string;
    readonly month?: string;
  }): Promise<PnlSummaryDto> {
    const taxConfig = await SupabaseVaultRepository.getUserTaxConfig(
      params.userId
    );

    if (params.period === "TODAY") {
      const activeShift = await SupabaseVaultRepository.getActiveShift(
        params.userId
      );

      if (!activeShift) {
        return calculateVueltaSummary({
          orders: [],
          period: "TODAY",
          periodLabel: "Jornada cerrada · En espera (0.00)",
          method: params.method,
          badge: taxConfig.merchantBadge,
          seniatTaxPercent: taxConfig.seniatTaxPercent,
        });
      }

      const nowMs = Date.now();
      const allMirrorOrders =
        await P2PSyncOrchestrator.getUserOrdersFromVaultOrBinance(
          params.userId,
          false,
          { startMs: activeShift.shiftStartTimeMs, endMs: nowMs + 60_000 }
        );

      const shiftOrders = allMirrorOrders.filter(
        (o) => o.createTimeMs >= activeShift.shiftStartTimeMs
      );

      return calculateVueltaSummary({
        orders: shiftOrders,
        period: "TODAY",
        periodLabel: `Jornada #${activeShift.shiftNumber} · Desde ${activeShift.dateLabelVet} ${activeShift.startTimeVetLabel} VET`,
        method: params.method,
        badge: taxConfig.merchantBadge,
        seniatTaxPercent: taxConfig.seniatTaxPercent,
      });
    }

    const bounds = resolvePeriodBounds({
      period: params.period,
      date: params.date,
      month: params.month,
    });

    const isMonthQuery =
      params.period === "MONTH" ||
      Boolean(params.month && /^\d{4}-\d{2}$/.test(params.month));
    const isDayQuery =
      params.period === "DAY" ||
      Boolean(params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date));

    if (
      (isMonthQuery || isDayQuery) &&
      bounds.startMs !== null &&
      bounds.endMs !== null
    ) {
      const synced = await P2PSyncOrchestrator.ensureRangeCompletelySynced(
        params.userId,
        bounds.startMs,
        bounds.endMs,
        {
          totalBudgetMs: 18_000,
          forceRefreshToday: false,
        }
      );

      const periodOrders = synced.orders.filter(
        (o) =>
          o.createTimeMs >= bounds.startMs! && o.createTimeMs <= bounds.endMs!
      );

      if (isMonthQuery) {
        const targetMonth =
          params.month && /^\d{4}-\d{2}$/.test(params.month)
            ? params.month
            : getCurrentVetMonthIso();
        const { summary } = buildDailyBreakdownAndMonthlySummary({
          userId: params.userId,
          targetMonth,
          monthOrders: periodOrders,
          periodLabel: bounds.periodLabel,
          badge: taxConfig.merchantBadge,
          seniatTaxPercent: taxConfig.seniatTaxPercent,
        });
        return summary;
      }

      return calculateVueltaSummary({
        orders: periodOrders,
        period: params.period,
        periodLabel: bounds.periodLabel,
        method: params.method,
        badge: taxConfig.merchantBadge,
        seniatTaxPercent: taxConfig.seniatTaxPercent,
      });
    }

    const allMirrorOrders =
      await P2PSyncOrchestrator.getUserOrdersFromVaultOrBinance(
        params.userId,
        false,
        bounds
      );

    const periodOrders =
      bounds.startMs !== null && bounds.endMs !== null
        ? allMirrorOrders.filter(
            (o) =>
              o.createTimeMs >= bounds.startMs! &&
              o.createTimeMs <= bounds.endMs!
          )
        : allMirrorOrders;

    return calculateVueltaSummary({
      orders: periodOrders,
      period: params.period,
      periodLabel: bounds.periodLabel,
      method: params.method,
      badge: taxConfig.merchantBadge,
      seniatTaxPercent: taxConfig.seniatTaxPercent,
    });
  }

  public static async getPaginatedOrders(params: {
    readonly userId: string;
    readonly period?: PeriodFilter;
    readonly tradeType: TradeTypeFilter;
    readonly status?: OrderStatusFilter;
    readonly bank?: string;
    readonly date?: string;
    readonly month?: string;
    readonly page: number;
    readonly limit: number;
  }): Promise<{
    readonly items: readonly P2POrderRowDto[];
    readonly totalCount: number;
    readonly sellCount: number;
    readonly buyCount: number;
    readonly completedCount: number;
    readonly cancelledCount: number;
    readonly appealCount: number;
    readonly inProgressCount: number;
    readonly availableDates: readonly string[];
  }> {
    const effectivePeriod: PeriodFilter =
      params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
        ? "DAY"
        : params.month && /^\d{4}-\d{2}$/.test(params.month)
          ? "MONTH"
          : (params.period ?? "ALL");

    if (effectivePeriod === "TODAY") {
      const activeShift = await SupabaseVaultRepository.getActiveShift(
        params.userId
      );

      if (!activeShift) {
        return {
          items: [],
          totalCount: 0,
          sellCount: 0,
          buyCount: 0,
          completedCount: 0,
          cancelledCount: 0,
          appealCount: 0,
          inProgressCount: 0,
          availableDates: [],
        };
      }

      const nowMs = Date.now();
      const allOrders =
        await P2PSyncOrchestrator.getUserOrdersFromVaultOrBinance(
          params.userId,
          false,
          { startMs: activeShift.shiftStartTimeMs, endMs: nowMs + 60_000 }
        );

      const shiftFiltered = allOrders.filter((order) => {
        if (order.createTimeMs < activeShift.shiftStartTimeMs) {
          return false;
        }
        if (
          params.tradeType !== "ALL" &&
          order.tradeType !== params.tradeType
        ) {
          return false;
        }
        if (
          params.status &&
          params.status !== "ALL" &&
          order.statusCategory !== params.status
        ) {
          return false;
        }
        if (
          params.bank &&
          params.bank.trim() !== "" &&
          !order.payMethodName
            .toLowerCase()
            .includes(params.bank.trim().toLowerCase())
        ) {
          return false;
        }
        return true;
      });

      const sellCount = shiftFiltered.filter(
        (o) => o.tradeType === "SELL"
      ).length;
      const buyCount = shiftFiltered.filter(
        (o) => o.tradeType === "BUY"
      ).length;
      const completedCount = shiftFiltered.filter(
        (o) => o.statusCategory === "COMPLETED"
      ).length;
      const cancelledCount = shiftFiltered.filter(
        (o) => o.statusCategory === "CANCELLED"
      ).length;
      const appealCount = shiftFiltered.filter(
        (o) => o.statusCategory === "IN_APPEAL"
      ).length;
      const inProgressCount = shiftFiltered.filter(
        (o) => o.statusCategory === "IN_PROGRESS"
      ).length;

      const startIndex = (params.page - 1) * params.limit;
      const pagedItems = shiftFiltered.slice(
        startIndex,
        startIndex + params.limit
      );

      return {
        items: pagedItems,
        totalCount: shiftFiltered.length,
        sellCount,
        buyCount,
        completedCount,
        cancelledCount,
        appealCount,
        inProgressCount,
        availableDates: [activeShift.dateLabelVet],
      };
    }

    const bounds =
      effectivePeriod === "ALL" && !params.date && !params.month
        ? { startMs: null, endMs: null }
        : resolvePeriodBounds({
            period: effectivePeriod,
            date: params.date,
            month: params.month,
          });

    const allOrders = await P2PSyncOrchestrator.getUserOrdersFromVaultOrBinance(
      params.userId,
      false,
      bounds
    );

    const dateSet = new Set<string>();
    for (const ord of allOrders) {
      if (ord.dateLabelVet) {
        dateSet.add(ord.dateLabelVet);
      }
    }
    const availableDates = Array.from(dateSet);

    const filtered = allOrders.filter((order) => {
      if (bounds.startMs !== null && bounds.endMs !== null) {
        if (
          order.createTimeMs < bounds.startMs ||
          order.createTimeMs > bounds.endMs
        ) {
          return false;
        }
      }
      if (params.tradeType !== "ALL" && order.tradeType !== params.tradeType) {
        return false;
      }
      if (
        params.status &&
        params.status !== "ALL" &&
        order.statusCategory !== params.status
      ) {
        return false;
      }
      if (
        params.bank &&
        params.bank.trim() !== "" &&
        !order.payMethodName
          .toLowerCase()
          .includes(params.bank.trim().toLowerCase())
      ) {
        return false;
      }
      return true;
    });

    const sellCount = filtered.filter((o) => o.tradeType === "SELL").length;
    const buyCount = filtered.filter((o) => o.tradeType === "BUY").length;
    const completedCount = filtered.filter(
      (o) => o.statusCategory === "COMPLETED"
    ).length;
    const cancelledCount = filtered.filter(
      (o) => o.statusCategory === "CANCELLED"
    ).length;
    const appealCount = filtered.filter(
      (o) => o.statusCategory === "IN_APPEAL"
    ).length;
    const inProgressCount = filtered.filter(
      (o) => o.statusCategory === "IN_PROGRESS"
    ).length;

    const startIndex = (params.page - 1) * params.limit;
    const pagedItems = filtered.slice(startIndex, startIndex + params.limit);

    return {
      items: pagedItems,
      totalCount: filtered.length,
      sellCount,
      buyCount,
      completedCount,
      cancelledCount,
      appealCount,
      inProgressCount,
      availableDates,
    };
  }

  public static async consolidateDayClosures(
    userId: string,
    dateIsoVet: string
  ): Promise<DailyTotalClosureDto | null> {
    const dayShifts = await SupabaseVaultRepository.getShiftClosuresByDate(
      userId,
      dateIsoVet
    );
    if (dayShifts.length === 0) {
      return null;
    }

    const taxConfig = await SupabaseVaultRepository.getUserTaxConfig(userId);
    const lastShift = dayShifts[dayShifts.length - 1];
    const effectiveBadge =
      lastShift?.merchantBadge ?? taxConfig.merchantBadge;
    const badgeMeta = MERCHANT_BADGE_META[effectiveBadge];

    const dateLabelVet = formatDateIsoVe(dateIsoVet);
    const monthIsoVet = dateIsoVet.slice(0, 7);

    const mergedOrders = mergeChronologicalOrders(
      dayShifts.map((s) => s.orders)
    );

    const periodLabel = `Cierre Total del Día: ${dateLabelVet} (${dayShifts.length} ${dayShifts.length === 1 ? "jornada" : "jornadas"})`;

    const summary = buildAggregatedSummaryFromClosures({
      summaries: dayShifts.map((s) => s.summary),
      orders: mergedOrders,
      period: "DAY",
      periodLabel,
      badge: effectiveBadge,
      seniatTaxPercent: taxConfig.seniatTaxPercent,
    });

    const shiftsMeta: ShiftDigestMetaDto[] = dayShifts.map((s) => ({
      id: s.id,
      shiftNumber: s.shiftNumber,
      startTimeVetLabel: s.startTimeVetLabel,
      endTimeVetLabel: s.endTimeVetLabel,
      closedBy: s.closedBy,
      merchantBadge: s.merchantBadge,
      merchantBadgeLabel: s.merchantBadgeLabel,
      totalOrdersCount: s.orders.length,
      completedOrdersCount: s.summary.reconciledOrdersCount,
      totalVolumeUsdt: s.summary.totalVolumeUsdt,
      netProfitUsdt: s.summary.netProfitUsdt,
      netProfitVes: s.summary.netProfitVes,
    }));

    const id = `dtot_${userId}_${dateIsoVet}`;
    const executedAtVet =
      lastShift?.closedBy === "AUTO_2359"
        ? "23:59:59 VET (Auto-Cierre)"
        : `${lastShift?.endTimeVetLabel ?? "23:59:59"} VET`;

    const dailyTotalClosure: DailyTotalClosureDto = {
      id,
      userId,
      dateIsoVet,
      monthIsoVet,
      dateLabelVet,
      executedAtVet,
      shiftsCount: dayShifts.length,
      merchantBadge: effectiveBadge,
      merchantBadgeLabel: badgeMeta.label,
      summary,
      shiftsMeta,
      orders: mergedOrders,
      updatedAtIso: new Date().toISOString(),
    };

    const hashPayload = [
      userId,
      dateIsoVet,
      String(dayShifts.length),
      String(summary.reconciledOrdersCount),
      summary.totalVolumeUsdt,
      summary.grossProfitVes,
      summary.netProfitVes,
    ].join("|");
    const integrityHashSha256 = crypto
      .createHash("sha256")
      .update(hashPayload)
      .digest("hex");

    await SupabaseVaultRepository.saveDailyTotalClosure(
      dailyTotalClosure,
      integrityHashSha256
    );

    return dailyTotalClosure;
  }

  public static async ensurePendingDailyClosuresConsolidated(
    _userId: string,
    _forceCloseIf2359Today: boolean = false
  ): Promise<void> {
    // Intencionalmente vacío: sin auto-cierre nocturno
  }

  private static async closeShiftInternal(
    userId: string,
    activeShift: ActiveShiftDto,
    options?: {
      readonly forcedEndMs?: number;
      readonly closedBy?: "MANUAL" | "AUTO_2359";
    }
  ): Promise<ShiftClosureDto> {
    const shiftEndTimeMs = Math.max(
      activeShift.shiftStartTimeMs,
      options?.forcedEndMs ?? Date.now()
    );

    const endTsInfo = formatVetOrderTimestamp(shiftEndTimeMs);
    const isMultiDay = endTsInfo.dateIso !== activeShift.dateIsoVet;

    const [allSynced, taxConfig, existingEndDayShifts] = await Promise.all([
      P2PSyncOrchestrator.syncBinanceRange(
        userId,
        activeShift.shiftStartTimeMs,
        shiftEndTimeMs,
        { startMs: activeShift.shiftStartTimeMs, endMs: shiftEndTimeMs }
      ),
      SupabaseVaultRepository.getUserTaxConfig(userId),
      SupabaseVaultRepository.getShiftClosuresByDate(userId, endTsInfo.dateIso),
    ]);

    const shiftOrders = allSynced.filter(
      (o) =>
        o.createTimeMs >= activeShift.shiftStartTimeMs &&
        o.createTimeMs <= shiftEndTimeMs
    );

    const startTimeVetLabel = isMultiDay
      ? `${activeShift.dateLabelVet} ${activeShift.startTimeVetLabel}`
      : activeShift.startTimeVetLabel;
    const endTimeVetLabel = isMultiDay
      ? `${endTsInfo.dateLabel} ${endTsInfo.timeLabel}`
      : endTsInfo.timeLabel;

    const effectiveShiftNumber = isMultiDay
      ? existingEndDayShifts.length + 1
      : activeShift.shiftNumber;

    const effectiveBadge = activeShift.merchantBadge || taxConfig.merchantBadge;
    const badgeMeta = MERCHANT_BADGE_META[effectiveBadge];

    const periodLabel = isMultiDay
      ? `Cierre Jornada #${effectiveShiftNumber} (${startTimeVetLabel} → ${endTimeVetLabel} VET)`
      : `Cierre Jornada #${effectiveShiftNumber} (${endTsInfo.dateLabel} · ${startTimeVetLabel} - ${endTimeVetLabel} VET)`;

    const summary = calculateVueltaSummary({
      orders: shiftOrders,
      period: "TODAY",
      periodLabel,
      method: "FIFO",
      badge: effectiveBadge,
      seniatTaxPercent: taxConfig.seniatTaxPercent,
    });

    const closure: ShiftClosureDto = {
      id: `shf_${endTsInfo.dateIso}_j${effectiveShiftNumber}_${activeShift.shiftStartTimeMs}`,
      userId,
      dateIsoVet: endTsInfo.dateIso,
      dateLabelVet: endTsInfo.dateLabel,
      shiftNumber: effectiveShiftNumber,
      shiftStartTimeMs: activeShift.shiftStartTimeMs,
      shiftEndTimeMs,
      startTimeVetLabel,
      endTimeVetLabel,
      closedBy: "MANUAL",
      merchantBadge: effectiveBadge,
      merchantBadgeLabel: badgeMeta.label,
      badgeFeePercent: String(badgeMeta.feePercent),
      summary,
      orders: shiftOrders,
      createdAtIso: new Date().toISOString(),
    };

    await SupabaseVaultRepository.saveShiftClosure(closure);
    await SupabaseVaultRepository.clearActiveShift(userId);

    return closure;
  }

  public static async getShiftDashboardState(
    userId: string,
    dateIso?: string
  ): Promise<ShiftDashboardStateDto> {
    const targetDateIso =
      dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso)
        ? dateIso
        : getCurrentVetDateIso();
    const targetDateLabel = formatDateIsoVe(targetDateIso);

    const [activeShift, todayShifts] = await Promise.all([
      SupabaseVaultRepository.getActiveShift(userId),
      SupabaseVaultRepository.getShiftClosuresByDate(userId, targetDateIso),
    ]);

    return {
      activeShift,
      selectedDateIsoVet: targetDateIso,
      selectedDateLabelVet: targetDateLabel,
      nextShiftNumber: todayShifts.length + 1,
      todayShifts,
      todayTotalClosure: null,
    };
  }

  public static async startShift(
    userId: string
  ): Promise<ShiftDashboardStateDto> {
    const existingActive = await SupabaseVaultRepository.getActiveShift(userId);
    if (existingActive) {
      return this.getShiftDashboardState(userId, getCurrentVetDateIso());
    }

    const nowMs = Date.now();
    const nowVet = formatVetOrderTimestamp(nowMs);
    const [todayShifts, taxConfig] = await Promise.all([
      SupabaseVaultRepository.getShiftClosuresByDate(userId, nowVet.dateIso),
      SupabaseVaultRepository.getUserTaxConfig(userId),
    ]);

    const shiftNumber = todayShifts.length + 1;
    const newShift: ActiveShiftDto = {
      shiftId: `act_${nowVet.dateIso}_j${shiftNumber}_${nowMs}`,
      userId,
      dateIsoVet: nowVet.dateIso,
      dateLabelVet: nowVet.dateLabel,
      shiftNumber,
      shiftStartTimeMs: nowMs,
      startTimeVetLabel: nowVet.timeLabel,
      merchantBadge: taxConfig.merchantBadge,
    };

    await SupabaseVaultRepository.saveActiveShift(newShift);
    return this.getShiftDashboardState(userId, nowVet.dateIso);
  }

  public static async closeShift(userId: string): Promise<{
    readonly closure: ShiftClosureDto | null;
    readonly state: ShiftDashboardStateDto;
  }> {
    const activeShift = await SupabaseVaultRepository.getActiveShift(userId);
    if (!activeShift) {
      const state = await this.getShiftDashboardState(userId);
      return { closure: null, state };
    }

    const closure = await this.closeShiftInternal(userId, activeShift, {
      forcedEndMs: Date.now(),
      closedBy: "MANUAL",
    });

    const state = await this.getShiftDashboardState(
      userId,
      closure.dateIsoVet
    );
    return { closure, state };
  }

  public static async runCronDailyCloseAllUsers(): Promise<{
    readonly processedUsers: number;
    readonly executedAtVet: string;
  }> {
    const nowVet = formatVetOrderTimestamp(Date.now());
    return {
      processedUsers: 0,
      executedAtVet: `${nowVet.dateTimeLabel} (-4:00 UTC)`,
    };
  }

  public static async buildClosingReport(params: {
    readonly userId: string;
    readonly scope: "DAY" | "MONTH" | "SHIFT";
    readonly date?: string;
    readonly month?: string;
    readonly shiftId?: string;
  }): Promise<ClosingReportData> {
    const taxConfig = await SupabaseVaultRepository.getUserTaxConfig(
      params.userId
    );
    const nowVet = formatVetOrderTimestamp(Date.now());
    const generatedAtVet = `${nowVet.dateTimeLabel} (-4:00 UTC)`;

    if (params.scope === "SHIFT" && params.shiftId) {
      const shiftClosure = await SupabaseVaultRepository.getShiftClosureById(
        params.userId,
        params.shiftId
      );
      if (shiftClosure) {
        let effectiveOrders = shiftClosure.orders;
        const hasPendingOrders = effectiveOrders.some(
          (o) =>
            o.statusCategory === "IN_PROGRESS" ||
            o.statusCategory === "IN_APPEAL"
        );

        if (
          hasPendingOrders &&
          shiftClosure.shiftEndTimeMs >= shiftClosure.shiftStartTimeMs
        ) {
          try {
            const refreshed = await P2PSyncOrchestrator.syncBinanceRange(
              params.userId,
              shiftClosure.shiftStartTimeMs,
              shiftClosure.shiftEndTimeMs,
              {
                startMs: shiftClosure.shiftStartTimeMs,
                endMs: shiftClosure.shiftEndTimeMs,
              }
            );
            const filteredRefreshed = refreshed.filter(
              (o) =>
                o.createTimeMs >= shiftClosure.shiftStartTimeMs &&
                o.createTimeMs <= shiftClosure.shiftEndTimeMs
            );
            if (filteredRefreshed.length >= effectiveOrders.length) {
              effectiveOrders = filteredRefreshed;
            }
          } catch {
            // Mantener las órdenes guardadas si Binance no respondió
          }
        }

        const periodLabel = `Cierre Jornada #${shiftClosure.shiftNumber} — ${shiftClosure.dateLabelVet} (${shiftClosure.startTimeVetLabel} a ${shiftClosure.endTimeVetLabel} VET)`;
        const recomputedSummary = calculateVueltaSummary({
          orders: effectiveOrders,
          period: "TODAY",
          periodLabel,
          method: "FIFO",
          badge: shiftClosure.merchantBadge,
          seniatTaxPercent: taxConfig.seniatTaxPercent,
        });

        if (hasPendingOrders) {
          await SupabaseVaultRepository.saveShiftClosure({
            ...shiftClosure,
            orders: effectiveOrders,
            summary: recomputedSummary,
          }).catch(() => {});
        }

        const { excludedNonUsdtCount, excludedNonVesCount } =
          countExcludedCompletedOrders(effectiveOrders);

        return {
          scope: "SHIFT",
          periodKey: `${shiftClosure.dateIsoVet}_Jornada_${shiftClosure.shiftNumber}`,
          periodLabel,
          generatedAtVet,
          summary: recomputedSummary,
          orders: effectiveOrders,
          totalShiftsInPeriod: 1,
          excludedNonUsdtCount,
          excludedNonVesCount,
          syncComplete: true,
          incompleteDays: [],
        };
      }
    }

    if (params.scope === "MONTH") {
      const targetMonth =
        params.month && /^\d{4}-\d{2}$/.test(params.month)
          ? params.month
          : getCurrentVetMonthIso();
      const monthRange = getVetMonthRangeMs(targetMonth);

      const syncedMonth = await P2PSyncOrchestrator.ensureRangeCompletelySynced(
        params.userId,
        monthRange.startMs,
        monthRange.endMs,
        {
          totalBudgetMs: 46_000,
          maxPagesPerDay: 40,
          concurrency: 3,
          forceRefreshToday: true,
        }
      );

      const monthOrders = syncedMonth.orders.filter(
        (o) =>
          o.createTimeMs >= monthRange.startMs &&
          o.createTimeMs <= monthRange.endMs
      );

      const tempPeriodLabel = `Libro Fiscal Mensual: ${monthRange.labelEs}`;
      const {
        dailyBreakdown,
        summary,
        excludedNonUsdtCount,
        excludedNonVesCount,
      } = buildDailyBreakdownAndMonthlySummary({
        userId: params.userId,
        targetMonth,
        monthOrders,
        periodLabel: tempPeriodLabel,
        badge: taxConfig.merchantBadge,
        seniatTaxPercent: taxConfig.seniatTaxPercent,
      });

      const periodLabel = `Libro Fiscal Mensual: ${monthRange.labelEs} (${monthOrders.length} órdenes · ${dailyBreakdown.length} ${dailyBreakdown.length === 1 ? "día con actividad" : "días con actividad"})`;

      return {
        scope: "MONTH",
        periodKey: targetMonth,
        periodLabel,
        generatedAtVet,
        summary: {
          ...summary,
          periodLabel,
        },
        orders: monthOrders,
        dailyClosures: dailyBreakdown,
        totalShiftsInPeriod: dailyBreakdown.length,
        excludedNonUsdtCount,
        excludedNonVesCount,
        syncComplete: syncedMonth.isComplete,
        incompleteDays: syncedMonth.incompleteDays,
        syncWarning: syncedMonth.warningMessage,
      };
    }

    const targetDate =
      params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
        ? params.date
        : getCurrentVetDateIso();

    const range = getVetDayRangeMs(targetDate);
    const syncedDay = await P2PSyncOrchestrator.ensureRangeCompletelySynced(
      params.userId,
      range.startMs,
      range.endMs,
      {
        totalBudgetMs: 30_000,
        maxPagesPerDay: 40,
        concurrency: 2,
        forceRefreshToday: true,
      }
    );
    const periodOrders = syncedDay.orders.filter(
      (o) => o.createTimeMs >= range.startMs && o.createTimeMs <= range.endMs
    );
    const periodLabel = `Cierre Diario: ${range.labelEs} (00:00:00 - 23:59:59 VET)`;
    const summary = calculateVueltaSummary({
      orders: periodOrders,
      period: "DAY",
      periodLabel,
      method: "FIFO",
      badge: taxConfig.merchantBadge,
      seniatTaxPercent: taxConfig.seniatTaxPercent,
    });
    const { excludedNonUsdtCount, excludedNonVesCount } =
      countExcludedCompletedOrders(periodOrders);

    return {
      scope: "DAY",
      periodKey: targetDate,
      periodLabel,
      generatedAtVet,
      summary,
      orders: periodOrders,
      excludedNonUsdtCount,
      excludedNonVesCount,
      syncComplete: syncedDay.isComplete,
      incompleteDays: syncedDay.incompleteDays,
      syncWarning: syncedDay.warningMessage,
    };
  }

  public static async getDailyClosings(userId: string): Promise<{
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
    const [closings, credential] = await Promise.all([
      SupabaseVaultRepository.getUserClosings(userId),
      SupabaseVaultRepository.getBinanceCredential(userId),
    ]);

    let grossUsdt = new Decimal(0);
    let grossVes = new Decimal(0);
    let taxUsdt = new Decimal(0);
    let taxVes = new Decimal(0);
    let netUsdt = new Decimal(0);
    let netVes = new Decimal(0);

    for (const c of closings) {
      grossUsdt = grossUsdt.plus(parseSafeDecimal(c.grossProfitUsdt));
      grossVes = grossVes.plus(parseSafeDecimal(c.grossProfitVes));
      taxUsdt = taxUsdt.plus(parseSafeDecimal(c.seniatTax16Usdt));
      taxVes = taxVes.plus(parseSafeDecimal(c.seniatTax16Ves));
      netUsdt = netUsdt.plus(parseSafeDecimal(c.netFreeProfitUsdt));
      netVes = netVes.plus(parseSafeDecimal(c.netFreeProfitVes));
    }

    return {
      monthGrossUsdt: formatDecimalMoney(grossUsdt),
      monthGrossVes: formatDecimalMoney(grossVes),
      monthSeniatTax16Usdt: formatDecimalMoney(taxUsdt),
      monthSeniatTax16Ves: formatDecimalMoney(taxVes),
      monthNetFreeUsdt: formatDecimalMoney(netUsdt),
      monthNetFreeVes: formatDecimalMoney(netVes),
      closings,
      vaultStatus: {
        isConfigured: Boolean(credential),
        label: credential ? credential.label : "Sin cuenta vinculada",
        apiKeyMasked: credential
          ? credential.apiKeyMasked
          : "Sin llave API conectada",
        isReadOnlyVerified: true,
        withdrawalsBlocked: true,
        spotTradingBlocked: true,
      },
    };
  }

  public static async saveBinanceVaultCredentials(params: {
    readonly userId: string;
    readonly label: string;
    readonly apiKey: string;
    readonly apiSecret: string;
  }) {
    const encrypted = encryptBinanceCredentials(
      params.apiKey,
      params.apiSecret
    );

    await SupabaseVaultRepository.saveBinanceCredential({
      userId: params.userId,
      label: params.label,
      apiKeyMasked: encrypted.apiKeyMasked,
      apiKeyEncrypted: encrypted.apiKeyEncrypted,
      apiSecretEncrypted: encrypted.apiSecretEncrypted,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      isReadOnlyVerified: true,
      updatedAt: new Date().toISOString(),
    });

    P2PSyncOrchestrator.clearUserSyncState(params.userId);

    return {
      label: params.label,
      apiKeyMasked: encrypted.apiKeyMasked,
      encryptionAlgorithm: "AES-256-GCM",
      isReadOnlyVerified: true,
      withdrawalsBlocked: true,
      spotTradingBlocked: true,
      updatedAtVet: formatVetOrderTimestamp(Date.now()).timeLabel,
    };
  }

  public static async unlinkBinanceVaultCredentials(userId: string) {
    P2PSyncOrchestrator.clearUserSyncState(userId);
    await SupabaseVaultRepository.deleteBinanceCredentialAndOrders(userId);

    return {
      unlinked: true,
      updatedAtVet: formatVetOrderTimestamp(Date.now()).timeLabel,
    };
  }

  public static async getVenezuelanBanksMonitor(
    amount: number = 5000
  ): Promise<readonly BankLiveMonitorDto[]> {
    return BinanceP2PLiveService.getLiveBrechas(amount);
  }

  public static async getMerchantBadgeConfig(
    userId: string
  ): Promise<MerchantBadgeConfigDto> {
    return SupabaseVaultRepository.getMerchantBadgeConfig(userId);
  }

  public static async updateMerchantBadgeConfig(
    userId: string,
    badge: MerchantBadgeType
  ): Promise<MerchantBadgeConfigDto> {
    return SupabaseVaultRepository.saveMerchantBadgeConfig(userId, badge);
  }

  public static async getUserTaxConfig(userId: string) {
    return SupabaseVaultRepository.getUserTaxConfig(userId);
  }

  public static async updateUserTaxConfig(
    userId: string,
    input: { seniatTaxPercent: number; makerFeePercent: number }
  ) {
    await SupabaseVaultRepository.saveUserTaxConfig(userId, input);
    return SupabaseVaultRepository.getUserTaxConfig(userId);
  }
}
