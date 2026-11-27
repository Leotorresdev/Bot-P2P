import "server-only";
import { supabase } from "@/lib/supabase";
import {
  MERCHANT_BADGE_META,
  type ActiveShiftDto,
  type DailyClosingActaDto,
  type DailyTotalClosureDto,
  type P2POrderRowDto,
  type PnlSummaryDto,
  type ShiftClosureDto,
  type ShiftDigestMetaDto,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import {
  readLocalDb,
  resolveBadgeType,
  writeLocalDb,
} from "./vault-local-store";

export async function getUserClosings(
  userId: string
): Promise<readonly DailyClosingActaDto[]> {
  try {
    const { data, error } = await supabase
      .from("daily_closings")
      .select("*")
      .eq("user_id", userId)
      .order("closing_iso_date", { ascending: false });

    if (!error && data && data.length > 0) {
      const validRows = data.filter((row) =>
        /^\d{4}-\d{2}-\d{2}$/.test(String(row.closing_iso_date ?? ""))
      );
      if (validRows.length > 0) {
        return validRows.map((row) => ({
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
    }
  } catch {
    // Fallback
  }

  const db = readLocalDb();
  return db.closings.filter(
    (c) => c.userId === userId && /^\d{4}-\d{2}-\d{2}$/.test(c.closingIsoDate)
  );
}

export async function getActiveShift(
  userId: string
): Promise<ActiveShiftDto | null> {
  const db = readLocalDb();
  const localShift =
    (db.activeShifts ?? []).find((s) => s.userId === userId) ?? null;

  try {
    const { data, error } = await supabase
      .from("p2p_active_shifts")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (!error && data) {
      const startMs = Number(data.shift_start_time_ms ?? 0);
      if (startMs <= 0) return null;
      const iso = String(data.date_iso_vet);
      const parts = iso.split("-");
      const label =
        parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : iso;
      return {
        shiftId: String(data.shift_id),
        userId: String(data.user_id),
        dateIsoVet: iso,
        dateLabelVet: label,
        shiftNumber: Number(data.shift_number ?? 1),
        shiftStartTimeMs: startMs,
        startTimeVetLabel: String(data.start_time_vet_label),
        merchantBadge: resolveBadgeType(data.merchant_badge),
      };
    }

    if (!error && !data) {
      return localShift;
    }
  } catch {
    // Tabla p2p_active_shifts podría no estar creada aún; usar respaldo en daily_closings
  }

  try {
    const { data, error } = await supabase
      .from("daily_closings")
      .select("closing_date_label")
      .eq("user_id", userId)
      .eq("closing_iso_date", "__ACTIVE_SHIFT__")
      .maybeSingle();

    if (!error && data?.closing_date_label) {
      const rawLabel = String(data.closing_date_label);
      if (rawLabel === "CLOSED") {
        return null;
      }
      const parsed = JSON.parse(rawLabel) as ActiveShiftDto;
      if (parsed && parsed.shiftStartTimeMs > 0) {
        return parsed;
      }
    }
  } catch {
    // Fallback a memoria/archivo local
  }

  return localShift;
}

export async function saveActiveShift(shift: ActiveShiftDto): Promise<void> {
  const db = readLocalDb();
  const others = (db.activeShifts ?? []).filter(
    (s) => s.userId !== shift.userId
  );
  others.push(shift);
  db.activeShifts = others;
  writeLocalDb(db);

  try {
    const { error } = await supabase.from("p2p_active_shifts").upsert({
      user_id: shift.userId,
      shift_id: shift.shiftId,
      date_iso_vet: shift.dateIsoVet,
      shift_number: shift.shiftNumber,
      shift_start_time_ms: shift.shiftStartTimeMs,
      start_time_vet_label: shift.startTimeVetLabel,
      merchant_badge: shift.merchantBadge,
      created_at: new Date().toISOString(),
    });

    if (!error) {
      return;
    }
  } catch {
    // Fallback en daily_closings
  }

  try {
    await supabase.from("daily_closings").upsert(
      {
        id: `act_${shift.userId}`,
        user_id: shift.userId,
        closing_date_label: JSON.stringify(shift),
        closing_iso_date: "__ACTIVE_SHIFT__",
        executed_at_vet: shift.startTimeVetLabel,
        reconciled_orders: 0,
        total_volume_usdt: "0.00",
        gross_profit_usdt: "0.00",
        gross_profit_ves: "0.00",
        seniat_tax_16_usdt: "0.00",
        seniat_tax_16_ves: "0.00",
        net_free_profit_usdt: "0.00",
        net_free_profit_ves: "0.00",
        integrity_hash_sha256: shift.shiftId,
      },
      { onConflict: "user_id,closing_iso_date" }
    );
  } catch {
    // Respaldo local ya escrito
  }
}

export async function clearActiveShift(userId: string): Promise<void> {
  const db = readLocalDb();
  db.activeShifts = (db.activeShifts ?? []).filter((s) => s.userId !== userId);
  writeLocalDb(db);

  try {
    await supabase.from("p2p_active_shifts").delete().eq("user_id", userId);
  } catch {
    // ignore
  }

  try {
    await supabase.from("daily_closings").upsert(
      {
        id: `act_${userId}`,
        user_id: userId,
        closing_date_label: "CLOSED",
        closing_iso_date: "__ACTIVE_SHIFT__",
        executed_at_vet: "CLOSED",
        reconciled_orders: 0,
        total_volume_usdt: "0.00",
        gross_profit_usdt: "0.00",
        gross_profit_ves: "0.00",
        seniat_tax_16_usdt: "0.00",
        seniat_tax_16_ves: "0.00",
        net_free_profit_usdt: "0.00",
        net_free_profit_ves: "0.00",
        integrity_hash_sha256: "CLOSED",
      },
      { onConflict: "user_id,closing_iso_date" }
    );
    await supabase
      .from("daily_closings")
      .delete()
      .eq("user_id", userId)
      .eq("closing_iso_date", "__ACTIVE_SHIFT__");
  } catch {
    // ignore
  }
}

function mapRowToShiftClosure(
  row: Record<string, unknown>
): ShiftClosureDto | null {
  try {
    const badge = resolveBadgeType(row.merchant_badge);
    const badgeMeta = MERCHANT_BADGE_META[badge];
    const rawSummary =
      typeof row.summary_json === "string"
        ? (JSON.parse(row.summary_json) as PnlSummaryDto)
        : (row.summary_json as PnlSummaryDto);
    const rawOrders =
      typeof row.orders_json === "string"
        ? (JSON.parse(row.orders_json) as P2POrderRowDto[])
        : (row.orders_json as P2POrderRowDto[]);

    if (!rawSummary) return null;

    return {
      id: String(row.id),
      userId: String(row.user_id),
      dateIsoVet: String(row.date_iso_vet),
      dateLabelVet: String(row.date_label_vet),
      shiftNumber: Number(row.shift_number ?? 1),
      shiftStartTimeMs: Number(row.shift_start_time_ms ?? 0),
      shiftEndTimeMs: Number(row.shift_end_time_ms ?? 0),
      startTimeVetLabel: String(row.start_time_vet_label),
      endTimeVetLabel: String(row.end_time_vet_label),
      closedBy: row.closed_by === "AUTO_2359" ? "AUTO_2359" : "MANUAL",
      merchantBadge: badge,
      merchantBadgeLabel: badgeMeta.label,
      badgeFeePercent: String(row.badge_fee_percent ?? badgeMeta.feePercent),
      summary: rawSummary,
      orders: Array.isArray(rawOrders) ? rawOrders : [],
      createdAtIso: String(row.created_at ?? new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

export async function saveShiftClosure(
  closure: ShiftClosureDto
): Promise<void> {
  const db = readLocalDb();
  const existing = (db.shiftClosures ?? []).filter((s) => s.id !== closure.id);
  existing.push(closure);
  db.shiftClosures = existing;
  writeLocalDb(db);

  try {
    const { error } = await supabase.from("p2p_shift_closures").upsert({
      id: closure.id,
      user_id: closure.userId,
      date_iso_vet: closure.dateIsoVet,
      date_label_vet: closure.dateLabelVet,
      shift_number: closure.shiftNumber,
      shift_start_time_ms: closure.shiftStartTimeMs,
      shift_end_time_ms: closure.shiftEndTimeMs,
      start_time_vet_label: closure.startTimeVetLabel,
      end_time_vet_label: closure.endTimeVetLabel,
      closed_by: closure.closedBy,
      merchant_badge: closure.merchantBadge,
      badge_fee_percent: closure.badgeFeePercent,
      summary_json: closure.summary,
      orders_json: closure.orders,
      created_at: closure.createdAtIso,
    });

    if (!error) {
      return;
    }
  } catch {
    // Fallback en daily_closings
  }

  try {
    const isoKey = `__SHIFT__:${closure.dateIsoVet}:${String(closure.shiftNumber).padStart(3, "0")}`;
    await supabase.from("daily_closings").upsert(
      {
        id: closure.id,
        user_id: closure.userId,
        closing_date_label: JSON.stringify(closure),
        closing_iso_date: isoKey,
        executed_at_vet: `${closure.startTimeVetLabel}-${closure.endTimeVetLabel}`,
        reconciled_orders: closure.summary.reconciledOrdersCount,
        total_volume_usdt: closure.summary.totalVolumeUsdt,
        gross_profit_usdt: closure.summary.grossProfitUsdt,
        gross_profit_ves: closure.summary.grossProfitVes,
        seniat_tax_16_usdt: closure.summary.volumeCommissionUsdt,
        seniat_tax_16_ves: closure.summary.volumeCommissionVes,
        net_free_profit_usdt: closure.summary.netProfitUsdt,
        net_free_profit_ves: closure.summary.netProfitVes,
        integrity_hash_sha256: closure.id,
      },
      { onConflict: "user_id,closing_iso_date" }
    );
  } catch {
    // Respaldo local ya escrito
  }
}

export async function getAllUserShiftClosures(
  userId: string
): Promise<readonly ShiftClosureDto[]> {
  const mergedMap = new Map<string, ShiftClosureDto>();
  const db = readLocalDb();
  for (const loc of db.shiftClosures ?? []) {
    if (loc.userId === userId) {
      mergedMap.set(loc.id, loc);
    }
  }

  try {
    const { data, error } = await supabase
      .from("p2p_shift_closures")
      .select("*")
      .eq("user_id", userId)
      .order("date_iso_vet", { ascending: false })
      .order("shift_number", { ascending: true });

    if (!error && data && data.length > 0) {
      for (const row of data) {
        const mapped = mapRowToShiftClosure(row as Record<string, unknown>);
        if (mapped) {
          mergedMap.set(mapped.id, mapped);
        }
      }
    }
  } catch {
    // Fallback
  }

  try {
    const { data, error } = await supabase
      .from("daily_closings")
      .select("closing_date_label, closing_iso_date")
      .eq("user_id", userId)
      .like("closing_iso_date", "__SHIFT__:%");

    if (!error && data) {
      for (const row of data) {
        try {
          const parsed = JSON.parse(
            String(row.closing_date_label)
          ) as ShiftClosureDto;
          if (parsed && parsed.id) {
            mergedMap.set(parsed.id, parsed);
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  return Array.from(mergedMap.values()).sort((a, b) => {
    if (a.dateIsoVet !== b.dateIsoVet) {
      return b.dateIsoVet.localeCompare(a.dateIsoVet);
    }
    return a.shiftNumber - b.shiftNumber;
  });
}

export async function getShiftClosuresByDate(
  userId: string,
  dateIsoVet: string
): Promise<readonly ShiftClosureDto[]> {
  const all = await getAllUserShiftClosures(userId);
  return all
    .filter((s) => s.dateIsoVet === dateIsoVet)
    .sort((a, b) => a.shiftNumber - b.shiftNumber);
}

export async function getShiftClosureById(
  userId: string,
  shiftId: string
): Promise<ShiftClosureDto | null> {
  try {
    const { data, error } = await supabase
      .from("p2p_shift_closures")
      .select("*")
      .eq("user_id", userId)
      .eq("id", shiftId)
      .maybeSingle();

    if (!error && data) {
      const mapped = mapRowToShiftClosure(data as Record<string, unknown>);
      if (mapped) return mapped;
    }
  } catch {
    // Fallback
  }

  try {
    const { data, error } = await supabase
      .from("daily_closings")
      .select("closing_date_label")
      .eq("user_id", userId)
      .eq("id", shiftId)
      .maybeSingle();

    if (!error && data?.closing_date_label) {
      const parsed = JSON.parse(
        String(data.closing_date_label)
      ) as ShiftClosureDto;
      if (parsed && parsed.id === shiftId) {
        return parsed;
      }
    }
  } catch {
    // Fallback a bóveda local
  }

  const db = readLocalDb();
  return (
    (db.shiftClosures ?? []).find(
      (s) => s.userId === userId && s.id === shiftId
    ) ?? null
  );
}

function mapRowToDailyTotalClosure(
  row: Record<string, unknown>
): DailyTotalClosureDto | null {
  try {
    const badge = resolveBadgeType(row.merchant_badge);
    const badgeMeta = MERCHANT_BADGE_META[badge];
    const rawSummary =
      typeof row.summary_json === "string"
        ? (JSON.parse(row.summary_json) as PnlSummaryDto)
        : (row.summary_json as PnlSummaryDto);
    const rawShiftsMeta =
      typeof row.shifts_meta_json === "string"
        ? (JSON.parse(row.shifts_meta_json) as ShiftDigestMetaDto[])
        : (row.shifts_meta_json as ShiftDigestMetaDto[]);
    const rawOrders =
      typeof row.orders_json === "string"
        ? (JSON.parse(row.orders_json) as P2POrderRowDto[])
        : (row.orders_json as P2POrderRowDto[]);

    if (!rawSummary) return null;

    return {
      id: String(row.id),
      userId: String(row.user_id),
      dateIsoVet: String(row.date_iso_vet),
      monthIsoVet: String(row.month_iso_vet),
      dateLabelVet: String(row.date_label_vet),
      executedAtVet: String(row.executed_at_vet ?? "23:59:59 VET"),
      shiftsCount: Number(row.shifts_count ?? 1),
      merchantBadge: badge,
      merchantBadgeLabel: badgeMeta.label,
      summary: rawSummary,
      shiftsMeta: Array.isArray(rawShiftsMeta) ? rawShiftsMeta : [],
      orders: Array.isArray(rawOrders) ? rawOrders : [],
      updatedAtIso: String(row.updated_at ?? new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

export async function saveDailyTotalClosure(
  closure: DailyTotalClosureDto,
  integrityHashSha256: string
): Promise<void> {
  const db = readLocalDb();
  const otherTotals = (db.dailyTotalClosures ?? []).filter(
    (c) => !(c.userId === closure.userId && c.dateIsoVet === closure.dateIsoVet)
  );
  otherTotals.push(closure);
  db.dailyTotalClosures = otherTotals;

  const actaRecord: DailyClosingActaDto & { readonly userId: string } = {
    id: closure.id,
    userId: closure.userId,
    closingDateLabel: `${closure.dateLabelVet} (${closure.shiftsCount} ${closure.shiftsCount === 1 ? "jornada" : "jornadas"})`,
    closingIsoDate: closure.dateIsoVet,
    executedAtVet: closure.executedAtVet,
    reconciledOrders: closure.summary.reconciledOrdersCount,
    totalVolumeUsdt: closure.summary.totalVolumeUsdt,
    grossProfitUsdt: closure.summary.grossProfitUsdt,
    grossProfitVes: closure.summary.grossProfitVes,
    seniatTax16Usdt: closure.summary.seniatTax16Usdt,
    seniatTax16Ves: closure.summary.seniatTax16Ves,
    netFreeProfitUsdt: closure.summary.netProfitUsdt,
    netFreeProfitVes: closure.summary.netProfitVes,
    integrityHashSha256,
  };

  const otherClosings = db.closings.filter(
    (c) =>
      !(c.userId === closure.userId && c.closingIsoDate === closure.dateIsoVet)
  );
  otherClosings.push(actaRecord);
  db.closings = otherClosings;
  writeLocalDb(db);

  try {
    await supabase.from("p2p_daily_total_closures").upsert(
      {
        id: closure.id,
        user_id: closure.userId,
        date_iso_vet: closure.dateIsoVet,
        month_iso_vet: closure.monthIsoVet,
        date_label_vet: closure.dateLabelVet,
        executed_at_vet: closure.executedAtVet,
        shifts_count: closure.shiftsCount,
        merchant_badge: closure.merchantBadge,
        summary_json: closure.summary,
        shifts_meta_json: closure.shiftsMeta,
        orders_json: closure.orders,
        updated_at: closure.updatedAtIso,
      },
      { onConflict: "user_id,date_iso_vet" }
    );
  } catch {
    // Fallback
  }

  try {
    await supabase.from("daily_closings").upsert(
      {
        id: `dtot_${closure.userId}_${closure.dateIsoVet}`,
        user_id: closure.userId,
        closing_date_label: JSON.stringify(closure),
        closing_iso_date: `__DAILY_TOTAL__:${closure.dateIsoVet}`,
        executed_at_vet: closure.executedAtVet,
        reconciled_orders: closure.summary.reconciledOrdersCount,
        total_volume_usdt: closure.summary.totalVolumeUsdt,
        gross_profit_usdt: closure.summary.grossProfitUsdt,
        gross_profit_ves: closure.summary.grossProfitVes,
        seniat_tax_16_usdt: closure.summary.volumeCommissionUsdt,
        seniat_tax_16_ves: closure.summary.volumeCommissionVes,
        net_free_profit_usdt: closure.summary.netProfitUsdt,
        net_free_profit_ves: closure.summary.netProfitVes,
        integrity_hash_sha256: integrityHashSha256,
      },
      { onConflict: "user_id,closing_iso_date" }
    );

    await supabase.from("daily_closings").upsert(
      {
        id: actaRecord.id,
        user_id: actaRecord.userId,
        closing_date_label: actaRecord.closingDateLabel,
        closing_iso_date: actaRecord.closingIsoDate,
        executed_at_vet: actaRecord.executedAtVet,
        reconciled_orders: actaRecord.reconciledOrders,
        total_volume_usdt: actaRecord.totalVolumeUsdt,
        gross_profit_usdt: actaRecord.grossProfitUsdt,
        gross_profit_ves: actaRecord.grossProfitVes,
        seniat_tax_16_usdt: actaRecord.seniatTax16Usdt,
        seniat_tax_16_ves: actaRecord.seniatTax16Ves,
        net_free_profit_usdt: actaRecord.netFreeProfitUsdt,
        net_free_profit_ves: actaRecord.netFreeProfitVes,
        integrity_hash_sha256: actaRecord.integrityHashSha256,
      },
      { onConflict: "user_id,closing_iso_date" }
    );
  } catch {
    // Respaldo local ya escrito
  }
}

export async function getAllUserDailyTotalClosures(
  userId: string
): Promise<readonly DailyTotalClosureDto[]> {
  const mergedMap = new Map<string, DailyTotalClosureDto>();
  const db = readLocalDb();
  for (const loc of db.dailyTotalClosures ?? []) {
    if (loc.userId === userId) {
      mergedMap.set(loc.dateIsoVet, loc);
    }
  }

  try {
    const { data, error } = await supabase
      .from("p2p_daily_total_closures")
      .select("*")
      .eq("user_id", userId)
      .order("date_iso_vet", { ascending: true });

    if (!error && data && data.length > 0) {
      for (const row of data) {
        const mapped = mapRowToDailyTotalClosure(
          row as Record<string, unknown>
        );
        if (mapped) {
          mergedMap.set(mapped.dateIsoVet, mapped);
        }
      }
    }
  } catch {
    // Fallback
  }

  try {
    const { data, error } = await supabase
      .from("daily_closings")
      .select("closing_date_label, closing_iso_date")
      .eq("user_id", userId)
      .like("closing_iso_date", "__DAILY_TOTAL__:%");

    if (!error && data) {
      for (const row of data) {
        try {
          const parsed = JSON.parse(
            String(row.closing_date_label)
          ) as DailyTotalClosureDto;
          if (parsed && parsed.dateIsoVet) {
            mergedMap.set(parsed.dateIsoVet, parsed);
          }
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore
  }

  return Array.from(mergedMap.values()).sort((a, b) =>
    a.dateIsoVet.localeCompare(b.dateIsoVet)
  );
}

export async function getDailyTotalClosureByDate(
  userId: string,
  dateIsoVet: string
): Promise<DailyTotalClosureDto | null> {
  const all = await getAllUserDailyTotalClosures(userId);
  return all.find((c) => c.dateIsoVet === dateIsoVet) ?? null;
}

export async function getDailyTotalClosuresByMonth(
  userId: string,
  monthIsoVet: string
): Promise<readonly DailyTotalClosureDto[]> {
  const all = await getAllUserDailyTotalClosures(userId);
  return all
    .filter((c) => c.monthIsoVet === monthIsoVet)
    .sort((a, b) => a.dateIsoVet.localeCompare(b.dateIsoVet));
}
