import { z } from "zod";

// =========================================================
// 1. ENUMS Y CONSTANTES DE DOMINIO
// =========================================================

export const PeriodFilterSchema = z.enum(["TODAY", "7D", "30D"]).default("TODAY");
export type PeriodFilter = z.infer<typeof PeriodFilterSchema>;

export const LotMethodSchema = z.enum(["FIFO", "WAC"]).default("FIFO");
export type LotMethod = z.infer<typeof LotMethodSchema>;

export const TradeTypeFilterSchema = z
  .enum(["ALL", "SELL", "BUY"])
  .default("ALL");
export type TradeTypeFilter = z.infer<typeof TradeTypeFilterSchema>;

export const UserRoleSchema = z.enum(["OPERATOR", "AUDITOR_SENIAT"]);
export type UserRoleType = z.infer<typeof UserRoleSchema>;

export const VenezuelanBankSchema = z.enum([
  "Banesco",
  "Pago Móvil",
  "Mercantil",
  "BBVA",
  "Banco de Venezuela",
  "Bancamiga",
  "BNC",
]);
export type VenezuelanBank = z.infer<typeof VenezuelanBankSchema>;

// =========================================================
// 2. VALIDACIÓN DE ENTRADAS HTTP (QUERY / BODY) — ANTI-INJECTION
// =========================================================

export const GetSummaryQuerySchema = z.object({
  period: PeriodFilterSchema,
  method: LotMethodSchema,
});

export const GetBanksQuerySchema = z.object({
  amount: z.coerce.number().min(50).max(50_000_000).default(100_000).optional(),
  buyAmount: z.coerce.number().min(50).max(50_000_000).default(100_000).optional(),
  sellAmount: z.coerce.number().min(50).max(50_000_000).default(100_000).optional(),
});
export type GetBanksQueryInput = z.infer<typeof GetBanksQuerySchema>;

export const GetOrdersQuerySchema = z.object({
  period: PeriodFilterSchema,
  tradeType: TradeTypeFilterSchema,
  bank: z.string().trim().max(40).optional(),
  date: z.string().trim().max(25).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const SaveBinanceVaultBodySchema = z.object({
  label: z
    .string()
    .trim()
    .min(3, "La etiqueta debe tener al menos 3 caracteres")
    .max(60, "Máximo 60 caracteres")
    .default("Binance P2P Principal"),
  apiKey: z
    .string()
    .trim()
    .min(32, "La API Key de Binance debe tener al menos 32 caracteres")
    .max(128, "API Key demasiado larga")
    .regex(/^[A-Za-z0-9]+$/, "La API Key solo puede contener caracteres alfanuméricos"),
  apiSecret: z
    .string()
    .trim()
    .min(32, "El API Secret de Binance debe tener al menos 32 caracteres")
    .max(128, "API Secret demasiado largo")
    .regex(/^[A-Za-z0-9]+$/, "El API Secret solo puede contener caracteres alfanuméricos"),
  confirmReadOnlyOnly: z.literal(true, {
    errorMap: () => ({
      message:
        "Debes confirmar que la llave de Binance solo tiene permisos de Lectura (Read-Only)",
    }),
  }),
});
export type SaveBinanceVaultInput = z.infer<typeof SaveBinanceVaultBodySchema>;

export const LoginCredentialsSchema = z.object({
  role: UserRoleSchema.default("OPERATOR"),
  email: z
    .string()
    .trim()
    .email("Ingresa un correo electrónico válido")
    .max(120),
  password: z
    .string()
    .min(8, "La contraseña requiere mínimo 8 caracteres")
    .max(128),
  totpCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Completa los 6 dígitos del código de Google Authenticator"),
});
export type LoginCredentialsInput = z.infer<typeof LoginCredentialsSchema>;

export interface LoginVaultResponseDto {
  readonly sessionId: string;
  readonly role: UserRoleType;
  readonly email: string;
  readonly authorizedIp: string;
  readonly maxSessionHours: number;
  readonly redirectTo: "/" | "/?view=closings";
}

export const RegisterUserSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(3, "El nombre o razón comercial debe tener al menos 3 caracteres")
      .max(80, "Máximo 80 caracteres"),
    email: z
      .string()
      .trim()
      .email("Ingresa un correo electrónico válido")
      .max(120),
    password: z
      .string()
      .min(10, "La contraseña requiere mínimo 10 caracteres")
      .max(128),
    confirmPassword: z.string().min(10, "Confirma tu contraseña"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });
export type RegisterUserInput = z.infer<typeof RegisterUserSchema>;

export interface RegisterUserResponseDto {
  readonly success: boolean;
  readonly userId: string;
  readonly email: string;
  readonly fullName: string;
  readonly role: UserRoleType;
  readonly totpSecret: string;
  readonly otpauthUrl: string;
  readonly message: string;
}

export const VerifyPasswordSchema = z.object({
  password: z.string().min(1, "La contraseña es requerida"),
});
export type VerifyPasswordInput = z.infer<typeof VerifyPasswordSchema>;

export const TriggerDailyClosingSchema = z.object({
  closingDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha requerido: YYYY-MM-DD"),
});

export const UpdateTaxConfigSchema = z.object({
  seniatTaxPercent: z.coerce
    .number()
    .min(0, "El porcentaje no puede ser negativo")
    .max(99, "El porcentaje debe ser menor a 100%"),
  makerFeePercent: z.coerce
    .number()
    .min(0, "La comisión no puede ser negativa")
    .max(10, "La comisión debe ser menor a 10%")
    .default(0.163),
});
export type UpdateTaxConfigInput = z.infer<typeof UpdateTaxConfigSchema>;

export interface UserTaxConfigDto {
  readonly seniatTaxPercent: number;
  readonly makerFeePercent: number;
  readonly updatedAt?: string;
}

// =========================================================
// 3. CONTRATOS DE RESPUESTA TIPADOS (DTOs)
// =========================================================

export interface PnlSummaryDto {
  readonly period: PeriodFilter;
  readonly method: LotMethod;
  readonly reconciledOrdersCount: number;
  readonly averageSpreadPercent: string;
  readonly netFreeProfitUsdt: string;
  readonly netFreeProfitVes: string;
  readonly grossProfitUsdt: string;
  readonly grossProfitVes: string;
  readonly seniatTax16Usdt: string;
  readonly seniatTax16Ves: string;
  readonly seniatTaxRatePercent: string;
  readonly makerFeeRatePercent: string;
  readonly exemptCapitalUsdt: string;
  readonly exemptCapitalVes: string;
  readonly currentWacCostVes: string;
  readonly availableVaultUsdt: string;
  readonly totalBinanceFeesUsdt: string;
  readonly nextClosingTimeVet: string;
  readonly lastSyncSecondsAgo: number;
  readonly workingCapitalUsdt?: string;
  readonly workingCapitalVes?: string;
}

export interface BankLiveMonitorDto {
  readonly bankName: VenezuelanBank;
  readonly filterAmountVes: number;
  readonly buyFilterAmountVes: number;
  readonly sellFilterAmountVes: number;
  readonly buyRate2nd: string;
  readonly sellRate2nd: string;
  readonly brechaPointsVes: string;
  readonly spreadPercent: string;
  readonly merchantBuyNick: string;
  readonly merchantSellNick: string;
  readonly liveRateVes: string;
  readonly reconciledOrdersToday: number;
  readonly volumeVesToday: string;
  readonly isLiveApi: boolean;
}

export interface P2POrderRowDto {
  readonly orderNumber: string;
  readonly timeVetLabel: string;
  readonly tradeType: "BUY" | "SELL";
  readonly advertisementRole: "MAKER" | "TAKER";
  readonly payMethodName: VenezuelanBank;
  readonly counterPartNickName: string;
  readonly amountUsdt: string;
  readonly commissionUsdt: string;
  readonly netBuyUsdt?: string;
  readonly unitPriceVes: string;
  readonly costBasisRateVes: string;
  readonly totalPriceVes: string;
  readonly exemptCapitalVes: string;
  readonly seniatTax16Ves: string;
  readonly seniatTax16Usdt: string;
  readonly seniatTaxPercentApplied?: string;
  readonly makerFeePercentApplied?: string;
  readonly netFreeProfitUsdt: string;
  readonly netFreeProfitVes: string;
  readonly marginPercent: string;
  readonly lotBadge?: string;
  readonly lotRemainingLabel?: string;
}

export interface DailyClosingActaDto {
  readonly id: string;
  readonly closingDateLabel: string;
  readonly closingIsoDate: string;
  readonly executedAtVet: string;
  readonly reconciledOrders: number;
  readonly totalVolumeUsdt: string;
  readonly grossProfitUsdt: string;
  readonly grossProfitVes: string;
  readonly seniatTax16Usdt: string;
  readonly seniatTax16Ves: string;
  readonly netFreeProfitUsdt: string;
  readonly netFreeProfitVes: string;
  readonly integrityHashSha256: string;
}
