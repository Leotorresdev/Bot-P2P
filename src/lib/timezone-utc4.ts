/**
 * Utilidades determinísticas para el huso horario fijo -4:00 UTC (Venezuela / VET).
 * Evita discrepancias por zona horaria del navegador/servidor o tablas ICU.
 */
export const UTC_MINUS_4_OFFSET_SECONDS = -4 * 3600;
export const UTC_MINUS_4_OFFSET_MS = -4 * 3_600_000;

const MONTH_NAMES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export interface UtcMinus4DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly dateIso: string;
  readonly ddMm: string;
  readonly hhMm: string;
}

/**
 * Extrae calendario y hora desde un Date ya desplazado a -4:00 UTC
 * (es decir, creado a partir de `(epochUtcSeconds + UTC_MINUS_4_OFFSET_SECONDS) * 1000`).
 */
export function extractPartsFromShiftedUtcDate(
  shiftedDate: Date
): UtcMinus4DateParts {
  const year = shiftedDate.getUTCFullYear();
  const month = shiftedDate.getUTCMonth() + 1;
  const day = shiftedDate.getUTCDate();
  const hour = shiftedDate.getUTCHours();
  const minute = shiftedDate.getUTCMinutes();

  const mmStr = String(month).padStart(2, "0");
  const ddStr = String(day).padStart(2, "0");
  const hhStr = String(hour).padStart(2, "0");
  const minStr = String(minute).padStart(2, "0");

  return {
    year,
    month,
    day,
    hour,
    minute,
    dateIso: `${year}-${mmStr}-${ddStr}`,
    ddMm: `${ddStr}/${mmStr}`,
    hhMm: `${hhStr}:${minStr}`,
  };
}

/**
 * Convierte un timestamp Unix UTC (en segundos) a sus componentes exactos en -4:00 UTC.
 */
export function getUtcMinus4Parts(epochUtcSeconds: number): UtcMinus4DateParts {
  const shiftedDate = new Date(
    (epochUtcSeconds + UTC_MINUS_4_OFFSET_SECONDS) * 1000
  );
  return extractPartsFromShiftedUtcDate(shiftedDate);
}

export interface VetOrderTimestampInfo {
  readonly dateTimeLabel: string;
  readonly dateLabel: string;
  readonly timeLabel: string;
  readonly dateIso: string;
  readonly monthIso: string;
}

/**
 * Formatea un epoch en milisegundos (createTime de Binance) a fecha y hora exacta
 * de Venezuela (America/Caracas / -4:00 UTC) con día, mes, año, hora, minuto y segundo.
 */
export function formatVetOrderTimestamp(epochMs: number): VetOrderTimestampInfo {
  const safeMs = Number.isFinite(epochMs) && epochMs > 0 ? epochMs : Date.now();
  const shifted = new Date(safeMs + UTC_MINUS_4_OFFSET_MS);

  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  const ss = String(shifted.getUTCSeconds()).padStart(2, "0");

  const dateLabel = `${day}/${month}/${year}`;
  const timeLabel = `${hh}:${mm}:${ss}`;

  return {
    dateTimeLabel: `${dateLabel} ${timeLabel}`,
    dateLabel,
    timeLabel,
    dateIso: `${year}-${month}-${day}`,
    monthIso: `${year}-${month}`,
  };
}

export function getCurrentVetDateIso(nowMs: number = Date.now()): string {
  return formatVetOrderTimestamp(nowMs).dateIso;
}

export function getCurrentVetMonthIso(nowMs: number = Date.now()): string {
  return formatVetOrderTimestamp(nowMs).monthIso;
}

export function formatDateIsoVe(dateIso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso.trim());
  if (!match) return dateIso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function formatMonthIsoEs(monthIso: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthIso.trim());
  if (!match) return monthIso;
  const monthIdx = Number(match[2]) - 1;
  const monthName = MONTH_NAMES_ES[monthIdx] ?? match[2];
  return `${monthName} ${match[1]}`;
}

/**
 * Devuelve los límites exactos en ms UTC de un día calendario en Venezuela (00:00:00.000 a 23:59:59.999 VET).
 */
export function getVetDayRangeMs(dateIso: string): {
  readonly startMs: number;
  readonly endMs: number;
  readonly dateIso: string;
  readonly labelEs: string;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso.trim());
  if (!match) {
    const fallback = getCurrentVetDateIso();
    return getVetDayRangeMs(fallback);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const startMs = Date.UTC(year, month - 1, day, 4, 0, 0, 0);
  const endMs = startMs + 86_400_000 - 1;

  return {
    startMs,
    endMs,
    dateIso: `${match[1]}-${match[2]}-${match[3]}`,
    labelEs: `${match[3]}/${match[2]}/${match[1]}`,
  };
}

/**
 * Devuelve los límites exactos en ms UTC de un mes calendario completo en Venezuela
 * (desde el día 1 a las 00:00:00.000 VET hasta el último día a las 23:59:59.999 VET).
 */
export function getVetMonthRangeMs(monthIso: string): {
  readonly startMs: number;
  readonly endMs: number;
  readonly monthIso: string;
  readonly labelEs: string;
} {
  const match = /^(\d{4})-(\d{2})$/.exec(monthIso.trim());
  if (!match) {
    const fallback = getCurrentVetMonthIso();
    return getVetMonthRangeMs(fallback);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const startMs = Date.UTC(year, month - 1, 1, 4, 0, 0, 0);
  const nextMonthStartMs = Date.UTC(year, month, 1, 4, 0, 0, 0);
  const endMs = nextMonthStartMs - 1;

  return {
    startMs,
    endMs,
    monthIso: `${match[1]}-${match[2]}`,
    labelEs: formatMonthIsoEs(`${match[1]}-${match[2]}`),
  };
}
