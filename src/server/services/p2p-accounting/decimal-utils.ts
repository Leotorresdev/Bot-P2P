import Decimal from "decimal.js";

// Configuración de alta precisión financiera (28 dígitos significativos, redondeo bancario)
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

/**
 * Formatea un Decimal a string legible con separadores de miles sin pasar por floats JS.
 */
export function formatDecimalMoney(
  val: Decimal,
  decimals: number = 2
): string {
  const fixed = val.toFixed(decimals);
  const isNegative = fixed.startsWith("-");
  const unsigned = isNegative ? fixed.slice(1) : fixed;
  const [intPart = "0", decPart] = unsigned.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const formatted =
    decPart !== undefined ? `${withCommas}.${decPart}` : withCommas;
  return isNegative ? `-${formatted}` : formatted;
}

/**
 * Parsea de forma segura una cadena numérica (incluso si trae separadores de miles ",")
 * retornando Decimal(0) ante entradas inválidas.
 */
export function parseSafeDecimal(
  raw: string | number | undefined | null
): Decimal {
  try {
    if (typeof raw === "number") {
      return Number.isFinite(raw) ? new Decimal(raw) : new Decimal(0);
    }
    const cleaned = String(raw ?? "0")
      .trim()
      .replace(/,/g, "");
    return new Decimal(cleaned === "" ? "0" : cleaned);
  } catch {
    return new Decimal(0);
  }
}

/**
 * Conserva la precisión exacta recibida de Binance asegurando al menos `minDecimals` decimales.
 */
export function formatExactDecimalString(
  raw: string | undefined,
  minDecimals: number = 2
): string {
  try {
    const dec = parseSafeDecimal(raw);
    const fullStr = dec.toFixed();
    const [intPart = "0", fracPart = ""] = fullStr.split(".");
    const trimmedFrac = fracPart.replace(/0+$/, "");
    const finalFrac =
      trimmedFrac.length >= minDecimals
        ? trimmedFrac
        : trimmedFrac.padEnd(minDecimals, "0");
    return `${intPart}.${finalFrac}`;
  } catch {
    return new Decimal(0).toFixed(minDecimals);
  }
}
