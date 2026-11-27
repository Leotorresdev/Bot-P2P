import type {
  ActiveShiftDto,
  DailyClosingActaDto,
  DailyTotalClosureDto,
  MerchantBadgeType,
  OrderStatusCategory,
  ShiftClosureDto,
} from "@/features/p2p-ledger/schemas/p2p.schemas";

export interface StoredUserRecord {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly passwordHash: string;
  readonly passwordSalt: string;
  readonly totpSecret: string;
  readonly role: "OPERATOR";
  readonly createdAt: string;
}

export interface StoredVaultCredentialRecord {
  readonly userId: string;
  readonly label: string;
  readonly apiKeyMasked: string;
  readonly apiKeyEncrypted: string;
  readonly apiSecretEncrypted: string;
  readonly iv: string;
  readonly authTag: string;
  readonly isReadOnlyVerified: boolean;
  readonly updatedAt: string;
}

export interface StoredP2POrderRecord {
  readonly orderNumber: string;
  readonly advNo: string;
  readonly userId: string;
  readonly createTimeMs: number;
  readonly timeVetLabel: string;
  readonly tradeType: "BUY" | "SELL";
  readonly orderStatus: string;
  readonly statusCategory: OrderStatusCategory;
  readonly advertisementRole: "MAKER" | "TAKER";
  readonly asset: string;
  readonly fiat: string;
  readonly payMethodName: string;
  readonly counterPartNickName: string;
  readonly amountUsdt: string;
  readonly commissionUsdt: string;
  readonly unitPriceVes: string;
  readonly totalPriceVes: string;
  readonly costBasisRateVes: string;
}

export interface StoredUserTaxConfigRecord {
  readonly userId: string;
  readonly seniatTaxPercent: number;
  readonly makerFeePercent: number;
  readonly merchantBadge?: MerchantBadgeType;
  readonly badgeFeePercent?: number;
  readonly updatedAt: string;
}

export interface SyncedDayCoverageRecord {
  readonly userId: string;
  readonly dateIsoVet: string;
  readonly isComplete: boolean;
  readonly buyCount: number;
  readonly sellCount: number;
  readonly openOrdersCount: number;
  readonly syncedAt: string;
}

export interface LocalVaultDatabase {
  users: StoredUserRecord[];
  credentials: StoredVaultCredentialRecord[];
  orders: StoredP2POrderRecord[];
  closings: Array<DailyClosingActaDto & { readonly userId: string }>;
  taxConfigs?: StoredUserTaxConfigRecord[];
  activeShifts?: ActiveShiftDto[];
  shiftClosures?: ShiftClosureDto[];
  dailyTotalClosures?: DailyTotalClosureDto[];
}
