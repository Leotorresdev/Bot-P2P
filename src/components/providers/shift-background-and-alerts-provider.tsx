"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  p2pQueryKeys,
  useShiftStateQuery,
  useVenezuelanBanksQuery,
} from "@/features/p2p-ledger/api/use-p2p-queries";
import {
  evaluateBrechaImprovements,
  parseSpreadPercentString,
  useAlertSettingsStore,
  type BankBrechaSample,
  type BrechaBankHistoryEntry,
} from "@/features/p2p-ledger/store/use-alert-settings-store";
import {
  playBrechaImprovedSound,
  showOsNotification,
} from "@/lib/notification-sound";

interface ShiftBackgroundAndAlertsProviderProps {
  readonly buyBrechaAmount: number;
  readonly sellBrechaAmount: number;
}

/**
 * Orquestador silencioso para el dashboard autenticado:
 * 1. Mantiene la app viva mientras haya una jornada activa (Screen Wake Lock + Web Worker).
 * 2. Vigila mejoras de brecha bancaria y dispara toast (sonner) + sonido (Web Audio API) + notificación SO.
 */
export function ShiftBackgroundAndAlertsProvider({
  buyBrechaAmount,
  sellBrechaAmount,
}: ShiftBackgroundAndAlertsProviderProps) {
  const queryClient = useQueryClient();
  const {
    alertsEnabled,
    soundEnabled,
    osNotificationsEnabled,
    keepAwakeDuringShift,
    watchedBanks,
    minSpreadPercentThreshold,
    minImprovementDeltaPct,
    cooldownMinutes,
    setRuntimeStatus,
  } = useAlertSettingsStore();

  const shiftStateQuery = useShiftStateQuery(undefined, {
    keepAliveInBackground: keepAwakeDuringShift,
  });
  const activeShift = shiftStateQuery.data?.activeShift ?? null;
  const isShiftRunning = activeShift !== null;
  const shouldKeepAlive = isShiftRunning && keepAwakeDuringShift;

  // Escucha los datos de bancos cacheados (comparte exactamente la misma queryKey sin duplicar peticiones)
  const banksQuery = useVenezuelanBanksQuery(buyBrechaAmount, sellBrechaAmount, {
    enabled: alertsEnabled || shouldKeepAlive,
    keepAliveInBackground: shouldKeepAlive,
  });

  const historyRef = React.useRef<Map<string, BrechaBankHistoryEntry>>(
    new Map()
  );

  // Reiniciar línea base si cambian los montos de filtro para evitar alertas falsas por cambio de monto
  React.useEffect(() => {
    historyRef.current = new Map();
  }, [buyBrechaAmount, sellBrechaAmount]);

  // 1. Screen Wake Lock API mientras hay jornada activa
  React.useEffect(() => {
    if (!shouldKeepAlive) {
      setRuntimeStatus({ isWakeLockActive: false });
      return;
    }

    const wakeLockApi = navigator.wakeLock;
    if (!wakeLockApi || typeof wakeLockApi.request !== "function") {
      setRuntimeStatus({ isWakeLockActive: false });
      return;
    }

    let disposed = false;
    let sentinel: WakeLockSentinel | null = null;

    const handleRelease = () => {
      if (!disposed) {
        setRuntimeStatus({ isWakeLockActive: false });
      }
    };

    const requestLock = async () => {
      if (disposed || document.visibilityState !== "visible") return;
      try {
        if (sentinel && !sentinel.released) return;
        sentinel = await wakeLockApi.request("screen");
        sentinel.addEventListener("release", handleRelease);
        if (!disposed) {
          setRuntimeStatus({ isWakeLockActive: true });
        }
      } catch {
        if (!disposed) {
          setRuntimeStatus({ isWakeLockActive: false });
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestLock();
      }
    };

    void requestLock();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (sentinel) {
        sentinel.removeEventListener("release", handleRelease);
        void sentinel.release().catch(() => {});
        sentinel = null;
      }
      setRuntimeStatus({ isWakeLockActive: false });
    };
  }, [shouldKeepAlive, setRuntimeStatus]);

  // 2. Web Worker heartbeat (public/shift-worker.js) para mantener refrescos vivos en pestañas ocultas
  React.useEffect(() => {
    if (!shouldKeepAlive || typeof Worker === "undefined") {
      setRuntimeStatus({ isBackgroundWorkerActive: false });
      return;
    }

    let worker: Worker | null = null;
    try {
      worker = new Worker("/shift-worker.js");
      worker.onmessage = (event: MessageEvent<{ readonly type?: string }>) => {
        if (event.data?.type === "TICK" && document.hidden) {
          void queryClient.invalidateQueries({
            queryKey: p2pQueryKeys.banks(buyBrechaAmount, sellBrechaAmount),
          });
        }
      };
      worker.postMessage({ type: "START", intervalMs: 25_000 });
      setRuntimeStatus({ isBackgroundWorkerActive: true });
    } catch {
      setRuntimeStatus({ isBackgroundWorkerActive: false });
    }

    return () => {
      if (worker) {
        try {
          worker.postMessage({ type: "STOP" });
          worker.terminate();
        } catch {
          // ignore
        }
      }
      setRuntimeStatus({ isBackgroundWorkerActive: false });
    };
  }, [
    shouldKeepAlive,
    buyBrechaAmount,
    sellBrechaAmount,
    queryClient,
    setRuntimeStatus,
  ]);

  // 3. Detector de mejora de brechas bancarias -> toast (sonner) + sonido + notificación SO
  React.useEffect(() => {
    const banks = banksQuery.data;
    if (!banks || banks.length === 0) return;

    const samples: BankBrechaSample[] = banks.map((bank) => ({
      bankName: bank.bankName,
      spreadPercent: parseSpreadPercentString(bank.spreadPercent),
      spreadPointsVes: bank.brechaPointsVes,
      sellRateVes: bank.sellRate2nd,
      buyRateVes: bank.buyRate2nd,
    }));

    const { alerts, nextHistory } = evaluateBrechaImprovements({
      samples,
      config: {
        alertsEnabled,
        watchedBanks,
        minSpreadPercentThreshold,
        minImprovementDeltaPct,
        cooldownMs: cooldownMinutes * 60_000,
      },
      history: historyRef.current,
      nowMs: Date.now(),
    });

    historyRef.current = nextHistory;

    if (alerts.length === 0) return;

    // Reproducir sonido una sola vez aunque mejoren 2 bancos en el mismo ciclo
    if (soundEnabled) {
      void playBrechaImprovedSound();
    }

    for (const alert of alerts.slice(0, 3)) {
      const spreadStr = `${alert.spreadPercent >= 0 ? "+" : ""}${alert.spreadPercent.toFixed(2)}%`;
      const deltaStr =
        alert.improvementDeltaPct > 0
          ? ` (+${alert.improvementDeltaPct.toFixed(2)}%)`
          : "";
      const title = `Brecha mejoró en ${alert.bankName}: ${spreadStr}${deltaStr}`;
      const description = `Venta ${alert.sellRateVes} Bs · Compra ${alert.buyRateVes} Bs (${alert.spreadPointsVes} pts)`;

      toast.success(title, {
        description,
        duration: 7000,
      });

      if (osNotificationsEnabled) {
        void showOsNotification({
          title: `📈 ${title}`,
          body: description,
          tag: `brecha-${alert.bankName.toLowerCase().replace(/\s+/g, "-")}`,
        });
      }
    }
  }, [
    banksQuery.data,
    alertsEnabled,
    soundEnabled,
    osNotificationsEnabled,
    watchedBanks,
    minSpreadPercentThreshold,
    minImprovementDeltaPct,
    cooldownMinutes,
  ]);

  return null;
}
