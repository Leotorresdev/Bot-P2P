import "server-only";
import fs from "node:fs";
import path from "node:path";
import { supabase } from "@/lib/supabase";

export interface StoredHourlyCandleRecord {
  readonly bankName: string;
  readonly hourBucketUtc: number;
  readonly hourLabelVet: string;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  readonly buyOpen: number;
  readonly buyClose: number;
  readonly samplesCount: number;
  readonly updatedAt: string;
}

export interface HourlySampleInput {
  readonly bankName: string;
  readonly sellPrice: number;
  readonly buyPrice: number;
}

interface LocalCandlesFile {
  candles: StoredHourlyCandleRecord[];
}

interface SupabaseHourlyCandleRow {
  bank_name: string;
  hour_bucket_utc: number | string;
  hour_label_vet: string;
  open: number;
  high: number;
  low: number;
  close: number;
  buy_open: number;
  buy_close: number;
  samples_count: number;
  updated_at: string;
}

const DATA_DIR = path.join(process.cwd(), "data");
const CANDLES_FILE_PATH = path.join(DATA_DIR, "hourly-candles.json");
const MAX_HOURS_PER_BANK = 720; // 30 días de velas de 1H por banco

const MEMORY_CANDLES = new Map<string, StoredHourlyCandleRecord>();
let localFileLoaded = false;

function makeKey(bankName: string, hourBucketUtc: number): string {
  return `${bankName}::${hourBucketUtc}`;
}

/**
 * Calcula la hora exacta truncada en horario de Venezuela (America/Caracas, UTC-4).
 * Dado que Venezuela no tiene horario de verano (UTC-4 fijo), cada hora UTC exacta
 * coincide exactamente con una hora en punto en Venezuela (00:00 .. 23:00 VET).
 */
export function getVenezuelaHourBucket(nowMs: number = Date.now()): {
  readonly hourBucketUtc: number;
  readonly hourLabelVet: string;
  readonly shortHourVet: string;
} {
  const hourBucketUtc = Math.floor(nowMs / 3_600_000) * 3600;
  const bucketDate = new Date(hourBucketUtc * 1000);

  const datePart = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(bucketDate);

  const timePart = new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(bucketDate);

  return {
    hourBucketUtc,
    hourLabelVet: `${datePart} ${timePart} VET`,
    shortHourVet: `${timePart} VET`,
  };
}

function ensureLocalLoaded(): void {
  if (localFileLoaded) return;
  localFileLoaded = true;
  try {
    if (!fs.existsSync(CANDLES_FILE_PATH)) return;
    const raw = fs.readFileSync(CANDLES_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalCandlesFile>;
    for (const item of parsed.candles ?? []) {
      if (item && item.bankName && typeof item.hourBucketUtc === "number") {
        MEMORY_CANDLES.set(makeKey(item.bankName, item.hourBucketUtc), item);
      }
    }
  } catch {
    // Entorno serverless de solo lectura o archivo aún no creado
  }
}

function flushLocalFile(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const cutoffBucket = Math.floor(Date.now() / 3_600_000) * 3600 - MAX_HOURS_PER_BANK * 3600;
    const allCandles: StoredHourlyCandleRecord[] = [];

    for (const [key, rec] of MEMORY_CANDLES.entries()) {
      if (rec.hourBucketUtc < cutoffBucket) {
        MEMORY_CANDLES.delete(key);
      } else {
        allCandles.push(rec);
      }
    }

    allCandles.sort((a, b) => a.hourBucketUtc - b.hourBucketUtc);
    fs.writeFileSync(
      CANDLES_FILE_PATH,
      JSON.stringify({ candles: allCandles }, null, 2),
      "utf8"
    );
  } catch {
    // En Vercel el sistema de archivos es efímero/solo lectura; Supabase persiste en la nube
  }
}

function mapSupabaseRow(row: SupabaseHourlyCandleRow): StoredHourlyCandleRecord {
  return {
    bankName: row.bank_name,
    hourBucketUtc: Number(row.hour_bucket_utc),
    hourLabelVet: row.hour_label_vet,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    buyOpen: Number(row.buy_open),
    buyClose: Number(row.buy_close),
    samplesCount: Number(row.samples_count ?? 1),
    updatedAt: row.updated_at,
  };
}

export class HourlyCandlesRepository {
  /**
   * Registra un muestreo de mercado para la hora exacta actual en Venezuela.
   * Si la vela de la hora ya existe, preserva `open` y actualiza `high`, `low`, `close`.
   * Si es el primer tick de la nueva hora, crea la nueva vela horaria automáticamente.
   */
  public static async upsertHourlySamples(
    samples: readonly HourlySampleInput[],
    nowMs: number = Date.now()
  ): Promise<readonly StoredHourlyCandleRecord[]> {
    if (samples.length === 0) return [];
    ensureLocalLoaded();

    const { hourBucketUtc, hourLabelVet } = getVenezuelaHourBucket(nowMs);
    const updatedAt = new Date(nowMs).toISOString();

    // 1. Consultar estado existente en Supabase para esta hora exacta (crucial en cold starts de Vercel)
    const remoteExisting = new Map<string, StoredHourlyCandleRecord>();
    try {
      const { data, error } = await supabase
        .from("p2p_hourly_candles")
        .select("*")
        .eq("hour_bucket_utc", hourBucketUtc);

      if (!error && Array.isArray(data)) {
        for (const row of data as SupabaseHourlyCandleRow[]) {
          const mapped = mapSupabaseRow(row);
          remoteExisting.set(mapped.bankName, mapped);
        }
      }
    } catch {
      // Fallback a memoria/archivo local si la tabla aún no existe en Supabase
    }

    const updatedRecords: StoredHourlyCandleRecord[] = [];
    const supabasePayload: SupabaseHourlyCandleRow[] = [];

    for (const sample of samples) {
      if (sample.sellPrice <= 0 || sample.buyPrice <= 0) continue;

      const key = makeKey(sample.bankName, hourBucketUtc);
      const localPrev = MEMORY_CANDLES.get(key);
      const remotePrev = remoteExisting.get(sample.bankName);

      // Preferir el registro existente más completo (mayor cantidad de muestras)
      const prev =
        remotePrev && (!localPrev || remotePrev.samplesCount >= localPrev.samplesCount)
          ? remotePrev
          : localPrev;

      const sell = Number(sample.sellPrice.toFixed(2));
      const buy = Number(sample.buyPrice.toFixed(2));

      const nextRecord: StoredHourlyCandleRecord = prev
        ? {
            bankName: sample.bankName,
            hourBucketUtc,
            hourLabelVet,
            open: prev.open,
            high: Number(Math.max(prev.high, sell).toFixed(2)),
            low: Number(Math.min(prev.low, sell).toFixed(2)),
            close: sell,
            buyOpen: prev.buyOpen,
            buyClose: buy,
            samplesCount: prev.samplesCount + 1,
            updatedAt,
          }
        : {
            bankName: sample.bankName,
            hourBucketUtc,
            hourLabelVet,
            open: sell,
            high: sell,
            low: sell,
            close: sell,
            buyOpen: buy,
            buyClose: buy,
            samplesCount: 1,
            updatedAt,
          };

      MEMORY_CANDLES.set(key, nextRecord);
      updatedRecords.push(nextRecord);
      supabasePayload.push({
        bank_name: nextRecord.bankName,
        hour_bucket_utc: nextRecord.hourBucketUtc,
        hour_label_vet: nextRecord.hourLabelVet,
        open: nextRecord.open,
        high: nextRecord.high,
        low: nextRecord.low,
        close: nextRecord.close,
        buy_open: nextRecord.buyOpen,
        buy_close: nextRecord.buyClose,
        samples_count: nextRecord.samplesCount,
        updated_at: nextRecord.updatedAt,
      });
    }

    // 2. Persistir en paralelo en Supabase y espejo local
    if (supabasePayload.length > 0) {
      try {
        await supabase
          .from("p2p_hourly_candles")
          .upsert(supabasePayload, { onConflict: "bank_name,hour_bucket_utc" });
      } catch {
        // Silencioso si la tabla SQL todavía no ha sido creada
      }
      flushLocalFile();
    }

    return updatedRecords;
  }

  /**
   * Obtiene todas las velas reales de 1H registradas para un banco dentro de una ventana horaria.
   */
  public static async getHourlyCandlesRange(
    bankName: string,
    fromBucketUtc: number,
    toBucketUtc: number
  ): Promise<Map<number, StoredHourlyCandleRecord>> {
    ensureLocalLoaded();
    const merged = new Map<number, StoredHourlyCandleRecord>();

    // 1. Cargar desde memoria/disco local
    for (const rec of MEMORY_CANDLES.values()) {
      if (
        rec.bankName.toLowerCase() === bankName.toLowerCase() &&
        rec.hourBucketUtc >= fromBucketUtc &&
        rec.hourBucketUtc <= toBucketUtc
      ) {
        merged.set(rec.hourBucketUtc, rec);
      }
    }

    // 2. Cargar desde Supabase (fuente autoritativa 24/7 en la nube)
    try {
      const { data, error } = await supabase
        .from("p2p_hourly_candles")
        .select("*")
        .eq("bank_name", bankName)
        .gte("hour_bucket_utc", fromBucketUtc)
        .lte("hour_bucket_utc", toBucketUtc)
        .order("hour_bucket_utc", { ascending: true });

      if (!error && Array.isArray(data)) {
        for (const row of data as SupabaseHourlyCandleRow[]) {
          const mapped = mapSupabaseRow(row);
          const local = merged.get(mapped.hourBucketUtc);
          if (!local || mapped.samplesCount >= local.samplesCount) {
            merged.set(mapped.hourBucketUtc, mapped);
            MEMORY_CANDLES.set(makeKey(mapped.bankName, mapped.hourBucketUtc), mapped);
          }
        }
      }
    } catch {
      // Fallback al caché local
    }

    return merged;
  }
}
