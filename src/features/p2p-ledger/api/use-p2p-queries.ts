"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/hono-client";
import type {
  ChartTimeframe,
  LoginCredentialsInput,
  LotMethod,
  MerchantBadgeType,
  OrderStatusFilter,
  PeriodFilter,
  SaveBinanceVaultInput,
  TradeTypeFilter,
  UpdateTaxConfigInput,
} from "@/features/p2p-ledger/schemas/p2p.schemas";

export const p2pQueryKeys = {
  all: ["p2p-ledger"] as const,
  summary: (params: {
    readonly period: PeriodFilter;
    readonly method: LotMethod;
    readonly date?: string;
    readonly month?: string;
  }) => [...p2pQueryKeys.all, "summary", params] as const,
  banks: (buyAmount: number, sellAmount: number) =>
    [...p2pQueryKeys.all, "banks", buyAmount, sellAmount] as const,
  chart: (bank: string, timeframe: ChartTimeframe) =>
    [...p2pQueryKeys.all, "chart", bank, timeframe] as const,
  orders: (filters: {
    readonly period: PeriodFilter;
    readonly tradeType: TradeTypeFilter;
    readonly status: OrderStatusFilter;
    readonly bank?: string;
    readonly date?: string;
    readonly month?: string;
    readonly page: number;
    readonly limit: number;
  }) => [...p2pQueryKeys.all, "orders", filters] as const,
  closings: () => [...p2pQueryKeys.all, "closings"] as const,
  taxConfig: () => [...p2pQueryKeys.all, "tax-config"] as const,
  merchantBadge: () => [...p2pQueryKeys.all, "merchant-badge"] as const,
};

export interface P2PSummaryQueryParams {
  readonly period: PeriodFilter;
  readonly method?: LotMethod;
  readonly date?: string;
  readonly month?: string;
}

export function useP2PSummaryQuery(params: P2PSummaryQueryParams) {
  const effectiveMethod: LotMethod = params.method ?? "FIFO";

  return useQuery({
    queryKey: p2pQueryKeys.summary({
      period: params.period,
      method: effectiveMethod,
      date: params.date,
      month: params.month,
    }),
    queryFn: async () => {
      const res = await apiClient.api.p2p.summary.$get({
        query: {
          period: params.period,
          method: effectiveMethod,
          date: params.date || undefined,
          month: params.month || undefined,
        },
      });
      if (!res.ok) {
        throw new Error("No se pudo obtener el resumen P2P.");
      }
      const json = await res.json();
      return json.data;
    },
    refetchInterval: 30_000,
  });
}

export function useVenezuelanBanksQuery(
  buyAmount: number = 100_000,
  sellAmount: number = 100_000
) {
  return useQuery({
    queryKey: p2pQueryKeys.banks(buyAmount, sellAmount),
    queryFn: async () => {
      const res = await apiClient.api.p2p.banks.$get({
        query: {
          buyAmount: String(buyAmount),
          sellAmount: String(sellAmount),
        },
      });
      if (!res.ok) {
        throw new Error("Error consultando el mercado vivo P2P.");
      }
      const json = await res.json();
      return json.data;
    },
    refetchInterval: 12_000,
  });
}

export function useP2PChartDataQuery(
  bank: string = "Banesco",
  timeframe: ChartTimeframe = "24H"
) {
  return useQuery({
    queryKey: p2pQueryKeys.chart(bank, timeframe),
    queryFn: async () => {
      const res = await apiClient.api.p2p["chart-data"].$get({
        query: {
          bank,
          timeframe,
        },
      });
      if (!res.ok) {
        throw new Error("Error cargando histórico de velas P2P.");
      }
      const json = await res.json();
      return json.data;
    },
    refetchInterval: 60_000,
  });
}

export interface P2POrdersQueryParams {
  readonly period?: PeriodFilter;
  readonly tradeType: TradeTypeFilter;
  readonly status?: OrderStatusFilter;
  readonly bank?: string;
  readonly date?: string;
  readonly month?: string;
  readonly page: number;
  readonly limit?: number;
}

export function useP2POrdersQuery(params: P2POrdersQueryParams) {
  const effectivePeriod: PeriodFilter = params.period ?? "ALL";
  const effectiveStatus: OrderStatusFilter = params.status ?? "ALL";
  const effectiveLimit = params.limit ?? 50;

  return useQuery({
    queryKey: p2pQueryKeys.orders({
      period: effectivePeriod,
      tradeType: params.tradeType,
      status: effectiveStatus,
      bank: params.bank,
      date: params.date,
      month: params.month,
      page: params.page,
      limit: effectiveLimit,
    }),
    queryFn: async () => {
      const res = await apiClient.api.p2p.orders.$get({
        query: {
          period: effectivePeriod,
          tradeType: params.tradeType,
          status: effectiveStatus,
          bank: params.bank || undefined,
          date: params.date || undefined,
          month: params.month || undefined,
          page: String(params.page),
          limit: String(effectiveLimit),
        },
      });
      if (!res.ok) {
        throw new Error("No se pudo obtener el historial exacto de órdenes.");
      }
      const json = await res.json();
      return json.data;
    },
    refetchInterval: 30_000,
  });
}

export function useMerchantBadgeQuery() {
  return useQuery({
    queryKey: p2pQueryKeys.merchantBadge(),
    queryFn: async () => {
      const res = await apiClient.api.p2p["merchant-badge"].$get();
      if (!res.ok) {
        throw new Error("No se pudo obtener el nivel de insignia.");
      }
      const json = await res.json();
      return json.data;
    },
  });
}

export function useUpdateMerchantBadgeMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (badge: MerchantBadgeType) => {
      const res = await apiClient.api.p2p["merchant-badge"].$post({
        json: { badge },
      });
      const json = await res.json();
      if (!res.ok || "error" in json) {
        throw new Error(
          "error" in json && typeof json.error === "string"
            ? json.error
            : "No se pudo actualizar el nivel de insignia."
        );
      }
      return json;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: p2pQueryKeys.merchantBadge(),
      });
      void queryClient.invalidateQueries({
        queryKey: p2pQueryKeys.taxConfig(),
      });
      void queryClient.invalidateQueries({
        queryKey: [...p2pQueryKeys.all, "summary"],
      });
    },
  });
}

export function useSyncBinanceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.api.p2p["sync-binance"].$post();
      const json = await res.json();
      if (!res.ok || "error" in json) {
        throw new Error(
          "error" in json && typeof json.error === "string"
            ? json.error
            : "Error sincronizando órdenes de Binance."
        );
      }
      return json;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: p2pQueryKeys.all });
    },
  });
}

export function useTestBinanceMutation() {
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.api.p2p["test-binance"].$post();
      const json = await res.json();
      if (!res.ok || "error" in json) {
        throw new Error(
          "error" in json && typeof json.error === "string"
            ? json.error
            : "Error probando conexión con Binance."
        );
      }
      return json;
    },
  });
}

export function useDailyClosingsQuery() {
  return useQuery({
    queryKey: p2pQueryKeys.closings(),
    queryFn: async () => {
      const res = await apiClient.api.p2p.closings.$get();
      if (!res.ok) {
        throw new Error("Error cargando las actas de cierre de las 11:59 PM.");
      }
      const json = await res.json();
      return json.data;
    },
  });
}

export function useSaveBinanceVaultMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveBinanceVaultInput) => {
      const res = await apiClient.api.p2p.vault.$post({
        json: input,
      });
      const json = await res.json();
      if (!res.ok || "error" in json) {
        throw new Error(
          "error" in json && typeof json.error === "string"
            ? json.error
            : "No se pudo guardar la llave en la bóveda."
        );
      }
      return json;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: p2pQueryKeys.all });
    },
  });
}

export function useUnlockVaultMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: LoginCredentialsInput) => {
      const res = await apiClient.api.p2p["login-vault"].$post({
        json: input,
      });
      const json = await res.json();
      if (!res.ok || "error" in json) {
        throw new Error(
          "error" in json && typeof json.error === "string"
            ? json.error
            : "Error iniciando sesión en la bóveda."
        );
      }
      return json;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: p2pQueryKeys.all });
    },
  });
}

export function useTaxConfigQuery() {
  return useQuery({
    queryKey: p2pQueryKeys.taxConfig(),
    queryFn: async () => {
      const res = await apiClient.api.p2p["tax-config"].$get();
      if (!res.ok) {
        throw new Error("No se pudo obtener la configuración fiscal.");
      }
      const json = await res.json();
      return json.data;
    },
  });
}

export function useUpdateTaxConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateTaxConfigInput) => {
      const res = await apiClient.api.p2p["tax-config"].$post({
        json: input,
      });
      const json = await res.json();
      if (!res.ok || "error" in json) {
        throw new Error(
          "error" in json && typeof json.error === "string"
            ? json.error
            : "No se pudo actualizar la configuración fiscal."
        );
      }
      return json;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: p2pQueryKeys.all });
    },
  });
}
