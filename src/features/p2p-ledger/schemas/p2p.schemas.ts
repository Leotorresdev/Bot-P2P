import { z } from "zod";

// =========================================================
// 1. ENUMS Y CONSTANTES DE DOMINIO
// =========================================================

export const PeriodFilterSchema = z
  .enum(["TODAY", "MONTH", "DAY", "ALL", "7D", "30D"])
  .default("TODAY");
export type PeriodFilter = z.infer<typeof PeriodFilterSchema>;

export const LotMethodSchema = z.enum(["FIFO", "WAC"]).default("FIFO");
export type LotMethod = z.infer<typeof LotMethodSchema>;

export const AveragePriceModeSchema = z
  .enum(["WEIGHTED", "SIMPLE"])
  .default("WEIGHTED");
export type AveragePriceMode = z.infer<typeof AveragePriceModeSchema>;

export const MerchantBadgeSchema = z.enum(["BRONZE", "SILVER", "GOLD"]);
export type MerchantBadgeType = z.infer<typeof MerchantBadgeSchema>;

export const MERCHANT_BADGE_META: Record<
  MerchantBadgeType,
  {
    readonly id: MerchantBadgeType;
    readonly label: string;
    readonly emoji: string;
    readonly feePercent: number;
    readonly feeFactor: string;
    readonly feeLabel: string;
  }
> = {
  BRONZE: {
    id: "BRONZE",
    label: "Bronce",
    emoji: "🥉",
    feePercent: 0.2,
    feeFactor: "0.0020",
    feeLabel: "-0.20%",
  },
  SILVER: {
    id: "SILVER",
    label: "Plata",
    emoji: "🥈",
    feePercent: 0.175,
    feeFactor: "0.00175",
    feeLabel: "-0.175%",
  },
  GOLD: {
    id: "GOLD",
    label: "Oro",
    emoji: "🥇",
    feePercent: 0.125,
    feeFactor: "0.00125",
    feeLabel: "-0.125%",
  },
};

export const OrderStatusCategorySchema = z.enum([
  "COMPLETED",
  "CANCELLED",
  "IN_APPEAL",
  "IN_PROGRESS",
]);
export type OrderStatusCategory = z.infer<typeof OrderStatusCategorySchema>;

export const OrderStatusFilterSchema = z
  .enum(["ALL", "COMPLETED", "CANCELLED", "IN_APPEAL", "IN_PROGRESS"])
  .default("ALL");
export type OrderStatusFilter = z.infer<typeof OrderStatusFilterSchema>;

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
  method: LotMethodSchema.optional().default("FIFO"),
  date: z.string().trim().max(25).optional(),
  month: z.string().trim().max(10).optional(),
  avgMode: AveragePriceModeSchema,
});

export const GetBanksQuerySchema = z.object({
  amount: z.coerce.number().min(50).max(50_000_000).default(100_000).optional(),
  buyAmount: z.coerce.number().min(50).max(50_000_000).default(100_000).optional(),
  sellAmount: z.coerce.number().min(50).max(50_000_000).default(100_000).optional(),
});
export type GetBanksQueryInput = z.infer<typeof GetBanksQuerySchema>;

export const GetOrdersQuerySchema = z.object({
  period: PeriodFilterSchema.optional().default("ALL"),
  tradeType: TradeTypeFilterSchema,
  status: OrderStatusFilterSchema.optional().default("ALL"),
  bank: z.string().trim().max(40).optional(),
  date: z.string().trim().max(25).optional(),
  month: z.string().trim().max(10).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(5000).default(50),
});

export const ExportClosingQuerySchema = z.object({
  scope: z.enum(["DAY", "MONTH"]).default("DAY"),
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato requerido YYYY-MM-DD")
    .optional(),
  month: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}$/, "Formato requerido YYYY-MM")
    .optional(),
  format: z.enum(["xlsx", "csv", "pdf"]).default("xlsx"),
  avgMode: AveragePriceModeSchema,
});
export type ExportClosingQueryInput = z.infer<typeof ExportClosingQuerySchema>;

export const UpdateMerchantBadgeSchema = z.object({
  badge: MerchantBadgeSchema,
});
export type UpdateMerchantBadgeInput = z.infer<typeof UpdateMerchantBadgeSchema>;

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
  readonly merchantBadge: MerchantBadgeType;
  readonly badgeFeePercent: number;
  readonly updatedAt?: string;
}

export interface MerchantBadgeConfigDto {
  readonly badge: MerchantBadgeType;
  readonly label: string;
  readonly emoji: string;
  readonly feePercent: number;
  readonly feeFactor: string;
  readonly feeLabel: string;
  readonly updatedAt?: string;
}

// =========================================================
// 3. CONTRATOS DE RESPUESTA TIPADOS (DTOs)
// =========================================================

export interface PnlSummaryDto {
  readonly period: PeriodFilter;
  readonly periodLabel: string;
  readonly method: LotMethod;
  readonly avgMode: AveragePriceMode;
  readonly merchantBadge: MerchantBadgeType;
  readonly merchantBadgeLabel: string;
  readonly badgeFeePercent: string;
  readonly badgeFeeFactor: string;
  // Volúmenes completados
  readonly totalSoldUsdt: string;
  readonly totalSoldVes: string;
  readonly totalBoughtUsdt: string;
  readonly totalBoughtVes: string;
  readonly totalVolumeUsdt: string;
  // Promedios y Brecha
  readonly avgSellRateWeightedVes: string;
  readonly avgBuyRateWeightedVes: string;
  readonly avgSellRateSimpleVes: string;
  readonly avgBuyRateSimpleVes: string;
  readonly activeAvgSellRateVes: string;
  readonly activeAvgBuyRateVes: string;
  readonly brechaPointsVes: string;
  readonly averageSpreadPercent: string;
  // Vuelta & Excedente
  readonly vueltaVolumeUsdt: string;
  readonly pendingDirection: "NONE" | "BUY_BACK" | "SELL_OUT";
  readonly pendingUsdt: string;
  // Ganancia Bruta, Comisión Insignia y Ganancia Neta Final
  readonly grossProfitVes: string;
  readonly grossProfitUsdt: string;
  readonly volumeCommissionUsdt: string;
  readonly volumeCommissionVes: string;
  readonly netProfitUsdt: string;
  readonly netProfitVes: string;
  readonly isNetProfitNegative: boolean;
  // Contadores exactos del período
  readonly completedSellCount: number;
  readonly completedBuyCount: number;
  readonly cancelledCount: number;
  readonly appealCount: number;
  readonly inProgressCount: number;
  readonly totalOrdersInPeriod: number;
  readonly reconciledOrdersCount: number;
  // Compatibilidad con vistas previas
  readonly netFreeProfitUsdt: string;
  readonly netFreeProfitVes: string;
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
  readonly advNo: string;
  readonly createTimeMs: number;
  readonly timeVetLabel: string;
  readonly dateLabelVet: string;
  readonly timeLabelVet: string;
  readonly dateIsoVet: string;
  readonly monthIsoVet: string;
  readonly tradeType: "BUY" | "SELL";
  readonly orderStatus: string;
  readonly statusCategory: OrderStatusCategory;
  readonly statusLabel: string;
  readonly advertisementRole: "MAKER" | "TAKER";
  readonly asset: string;
  readonly fiat: string;
  readonly payMethodName: string;
  readonly counterPartNickName: string;
  readonly unitPriceVes: string;
  readonly amountUsdt: string;
  readonly totalPriceVes: string;
  readonly commissionUsdt: string;
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

export const ChartTimeframeSchema = z
  .enum(["24H", "72H", "7D"])
  .default("24H")
  .catch("24H");
export type ChartTimeframe = z.infer<typeof ChartTimeframeSchema>;

export const GetChartDataQuerySchema = z.object({
  bank: z.string().trim().default("Banesco"),
  timeframe: ChartTimeframeSchema,
});
export type GetChartDataQueryInput = z.infer<typeof GetChartDataQuerySchema>;

export interface ChartPointDto {
  readonly time: number;
  readonly value: number;
}

export interface ChartCandleDto {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
}

export interface BankChartDataDto {
  readonly bankName: string;
  readonly timeframe: ChartTimeframe;
  readonly candleInterval: "1H";
  readonly timezone: "America/Caracas";
  readonly currentHourVetLabel: string;
  readonly persistedCandlesCount: number;
  readonly sellPoints: readonly ChartPointDto[];
  readonly buyPoints: readonly ChartPointDto[];
  readonly candles: readonly ChartCandleDto[];
  readonly currentSellRate: number;
  readonly currentBuyRate: number;
  readonly currentSpreadPct: number;
  readonly isLive: boolean;
  readonly benchmarkSource: string;
}

