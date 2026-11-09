"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/hono-client";
import type {
  LoginCredentialsInput,
  LotMethod,
  PeriodFilter,
  SaveBinanceVaultInput,
  TradeTypeFilter,
} from "@/features/p2p-ledger/schemas/p2p.schemas";

// Query Key Factory estricta (Single Source of Truth para invalidación quirúrgica)
export const p2pQueryKeys = {
  all: ["p2p-ledger"] as const,
  summary: (period: PeriodFilter, method: LotMethod) =>
    [...p2pQueryKeys.all, "summary", { period, method }] as const,
  banks: (buyAmount?: number, sellAmount?: number) =>
    [...p2pQueryKeys.all, "banks", { buyAmount, sellAmount }] as const,
  orders: (filters: {
    period: PeriodFilter;
    tradeType: TradeTypeFilter;
    bank?: string;
    page: number;
  }) => [...p2pQueryKeys.all, "orders", filters] as const,
  closings: () => [...p2pQueryKeys.all, "closings"] as const,
};

export function useP2PSummaryQuery(period: PeriodFilter, method: LotMethod) {
  return useQuery({
    queryKey: p2pQueryKeys.summary(period, method),
    queryFn: async () => {
      const res = await apiClient.api.p2p.summary.$get({
        query: { period, method },
      });
      if (!res.ok) {
        throw new Error("No se pudo cargar el resumen contable P&L.");
      }
      const json = await res.json();
      return json.data;
    },
    refetchInterval: 15_000, // Sincronización en vivo cada 15s
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
        throw new Error("Error consultando el monitor de brechas P2P.");
      }
      const json = await res.json();
      return json.data;
    },
    refetchInterval: 12_000,
  });
}

export function useP2POrdersQuery(params: {
  period: PeriodFilter;
  tradeType: TradeTypeFilter;
  bank?: string;
  page: number;
}) {
  return useQuery({
    queryKey: p2pQueryKeys.orders(params),
    queryFn: async () => {
      const res = await apiClient.api.p2p.orders.$get({
        query: {
          period: params.period,
          tradeType: params.tradeType,
          bank: params.bank,
          page: String(params.page),
          limit: "20",
        },
      });
      if (!res.ok) {
        throw new Error("No se pudo cargar el libro diario de órdenes.");
      }
      const json = await res.json();
      return json.data;
    },
    refetchInterval: 15_000, // Sincronización continua de órdenes
  });
}

export function useSyncBinanceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.api.p2p["sync-binance"].$post();
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error ??
            "Error al sincronizar con Binance."
        );
      }
      return json as { message: string; data: { count: number } };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: p2pQueryKeys.all });
    },
  });
}

export function useTestBinanceMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await apiClient.api.p2p["test-binance"].$post();
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          (json as { error?: string }).error ??
            "Binance rechazó la prueba de conexión."
        );
      }
      return json as {
        message: string;
        data: { success: boolean; message: string; orderCount?: number };
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: p2pQueryKeys.all });
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
      if (!res.ok) {
        const errData = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          errData?.error ?? "Error al cifrar y guardar las credenciales API."
        );
      }
      return res.json();
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
      if (!res.ok) {
        const errData = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          errData?.error ?? "Error verificando credenciales y llave 2FA."
        );
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: p2pQueryKeys.all });
    },
  });
}

