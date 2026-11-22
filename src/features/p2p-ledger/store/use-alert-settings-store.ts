"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export const DEFAULT_WATCHED_BANKS = [
  "Banesco",
  "Pago Móvil",
  "Mercantil",
  "BBVA",
  "Banco de Venezuela",
  "Bancamiga",
  "BNC",
] as const;

export interface BankBrechaSample {
  readonly bankName: string;
  readonly spreadPercent: number;
  readonly spreadPointsVes: string;
  readonly sellRateVes: string;
  readonly buyRateVes: string;
}

export interface BrechaAlertCandidate {
  readonly bankName: string;
  readonly spreadPercent: number;
  readonly previousSpreadPercent: number | null;
  readonly improvementDeltaPct: number;
  readonly spreadPointsVes: string;
  readonly sellRateVes: string;
  readonly buyRateVes: string;
}

export interface BrechaWatcherConfig {
  readonly alertsEnabled: boolean;
  readonly watchedBanks: readonly string[];
  readonly minSpreadPercentThreshold: number;
  readonly minImprovementDeltaPct: number;
  readonly cooldownMs: number;
}

export interface BrechaBankHistoryEntry {
  readonly lastSeenSpreadPct: number;
  readonly lastAlertedAtMs: number;
  readonly lastAlertedSpreadPct: number;
}

/**
 * Función pura determinista que decide qué bancos mejoraron su brecha lo suficiente
 * como para disparar notificación con sonido (respetando umbral, delta mínimo y cooldown por banco).
 */
export function evaluateBrechaImprovements(params: {
  readonly samples: readonly BankBrechaSample[];
  readonly config: BrechaWatcherConfig;
  readonly history: ReadonlyMap<string, BrechaBankHistoryEntry>;
  readonly nowMs: number;
}): {
  readonly alerts: readonly BrechaAlertCandidate[];
  readonly nextHistory: Map<string, BrechaBankHistoryEntry>;
} {
  const { samples, config, history, nowMs } = params;
  const nextHistory = new Map<string, BrechaBankHistoryEntry>(history);
  const alerts: BrechaAlertCandidate[] = [];

  if (!config.alertsEnabled) {
    for (const s of samples) {
      const prev = nextHistory.get(s.bankName);
      nextHistory.set(s.bankName, {
        lastSeenSpreadPct: s.spreadPercent,
        lastAlertedAtMs: prev?.lastAlertedAtMs ?? 0,
        lastAlertedSpreadPct: prev?.lastAlertedSpreadPct ?? s.spreadPercent,
      });
    }
    return { alerts, nextHistory };
  }

  const watchedSet = new Set(
    config.watchedBanks.map((b) => b.trim().toLowerCase())
  );

  for (const sample of samples) {
    if (!Number.isFinite(sample.spreadPercent)) continue;

    const prev = nextHistory.get(sample.bankName);

    // Primera lectura de este banco: solo inicializar línea base (evita spam al abrir la página)
    if (!prev) {
      nextHistory.set(sample.bankName, {
        lastSeenSpreadPct: sample.spreadPercent,
        lastAlertedAtMs: 0,
        lastAlertedSpreadPct: sample.spreadPercent,
      });
      continue;
    }

    const isWatched =
      watchedSet.size === 0 ||
      watchedSet.has(sample.bankName.trim().toLowerCase());
    const deltaFromPrev = sample.spreadPercent - prev.lastSeenSpreadPct;
    const crossedAboveThreshold =
      prev.lastSeenSpreadPct < config.minSpreadPercentThreshold &&
      sample.spreadPercent >= config.minSpreadPercentThreshold;
    const improvedSignificantlyAboveThreshold =
      sample.spreadPercent >= config.minSpreadPercentThreshold &&
      deltaFromPrev >= config.minImprovementDeltaPct;
    const cooldownElapsed =
      prev.lastAlertedAtMs === 0 ||
      nowMs - prev.lastAlertedAtMs >= config.cooldownMs;

    if (
      isWatched &&
      cooldownElapsed &&
      (crossedAboveThreshold || improvedSignificantlyAboveThreshold)
    ) {
      alerts.push({
        bankName: sample.bankName,
        spreadPercent: sample.spreadPercent,
        previousSpreadPercent: prev.lastSeenSpreadPct,
        improvementDeltaPct: deltaFromPrev,
        spreadPointsVes: sample.spreadPointsVes,
        sellRateVes: sample.sellRateVes,
        buyRateVes: sample.buyRateVes,
      });
      nextHistory.set(sample.bankName, {
        lastSeenSpreadPct: sample.spreadPercent,
        lastAlertedAtMs: nowMs,
        lastAlertedSpreadPct: sample.spreadPercent,
      });
    } else {
      nextHistory.set(sample.bankName, {
        lastSeenSpreadPct: sample.spreadPercent,
        lastAlertedAtMs: prev.lastAlertedAtMs,
        lastAlertedSpreadPct: prev.lastAlertedSpreadPct,
      });
    }
  }

  return { alerts, nextHistory };
}

export function parseSpreadPercentString(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/%/g, "").replace(/,/g, "").trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}

interface AlertSettingsState {
  readonly alertsEnabled: boolean;
  readonly soundEnabled: boolean;
  readonly osNotificationsEnabled: boolean;
  readonly keepAwakeDuringShift: boolean;
  readonly watchedBanks: readonly string[];
  readonly minSpreadPercentThreshold: number;
  readonly minImprovementDeltaPct: number;
  readonly cooldownMinutes: number;
  readonly isWakeLockActive: boolean;
  readonly isBackgroundWorkerActive: boolean;
  setAlertsEnabled: (enabled: boolean) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setOsNotificationsEnabled: (enabled: boolean) => void;
  setKeepAwakeDuringShift: (enabled: boolean) => void;
  toggleWatchedBank: (bankName: string) => void;
  setMinSpreadPercentThreshold: (pct: number) => void;
  setMinImprovementDeltaPct: (deltaPct: number) => void;
  setCooldownMinutes: (minutes: number) => void;
  setRuntimeStatus: (status: {
    readonly isWakeLockActive?: boolean;
    readonly isBackgroundWorkerActive?: boolean;
  }) => void;
}

export const useAlertSettingsStore = create<AlertSettingsState>()(
  persist(
    (set) => ({
      alertsEnabled: true,
      soundEnabled: true,
      osNotificationsEnabled: false,
      keepAwakeDuringShift: true,
      watchedBanks: [...DEFAULT_WATCHED_BANKS],
      minSpreadPercentThreshold: 1.2,
      minImprovementDeltaPct: 0.15,
      cooldownMinutes: 3,
      isWakeLockActive: false,
      isBackgroundWorkerActive: false,
      setAlertsEnabled: (enabled) => set({ alertsEnabled: enabled }),
      setSoundEnabled: (enabled) => set({ soundEnabled: enabled }),
      setOsNotificationsEnabled: (enabled) =>
        set({ osNotificationsEnabled: enabled }),
      setKeepAwakeDuringShift: (enabled) =>
        set({ keepAwakeDuringShift: enabled }),
      toggleWatchedBank: (bankName) =>
        set((state) => {
          const exists = state.watchedBanks.includes(bankName);
          const next = exists
            ? state.watchedBanks.filter((b) => b !== bankName)
            : [...state.watchedBanks, bankName];
          return { watchedBanks: next.length > 0 ? next : [bankName] };
        }),
      setMinSpreadPercentThreshold: (pct) =>
        set({
          minSpreadPercentThreshold: Math.max(0.1, Math.min(25, pct)),
        }),
      setMinImprovementDeltaPct: (deltaPct) =>
        set({
          minImprovementDeltaPct: Math.max(0.05, Math.min(10, deltaPct)),
        }),
      setCooldownMinutes: (minutes) =>
        set({
          cooldownMinutes: Math.max(1, Math.min(60, Math.round(minutes))),
        }),
      setRuntimeStatus: (status) =>
        set((state) => ({
          isWakeLockActive:
            status.isWakeLockActive ?? state.isWakeLockActive,
          isBackgroundWorkerActive:
            status.isBackgroundWorkerActive ?? state.isBackgroundWorkerActive,
        })),
    }),
    {
      name: "bot-p2p-alert-settings-v1",
      partialize: (state) => ({
        alertsEnabled: state.alertsEnabled,
        soundEnabled: state.soundEnabled,
        osNotificationsEnabled: state.osNotificationsEnabled,
        keepAwakeDuringShift: state.keepAwakeDuringShift,
        watchedBanks: state.watchedBanks,
        minSpreadPercentThreshold: state.minSpreadPercentThreshold,
        minImprovementDeltaPct: state.minImprovementDeltaPct,
        cooldownMinutes: state.cooldownMinutes,
      }),
    }
  )
);
