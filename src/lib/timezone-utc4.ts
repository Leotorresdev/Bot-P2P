/**
 * Utilidades determinísticas para el huso horario fijo -4:00 UTC (Venezuela / VET).
 * Evita discrepancias por zona horaria del navegador/servidor o tablas ICU.
 */
export const UTC_MINUS_4_OFFSET_SECONDS = -4 * 3600;

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
