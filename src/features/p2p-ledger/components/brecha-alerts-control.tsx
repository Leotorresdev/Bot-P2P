"use client";

import * as React from "react";
import {
  Bell,
  BellOff,
  Check,
  Radio,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_WATCHED_BANKS,
  useAlertSettingsStore,
} from "@/features/p2p-ledger/store/use-alert-settings-store";
import {
  playBrechaImprovedSound,
  requestOsNotificationPermission,
  showOsNotification,
  unlockAudioContext,
} from "@/lib/notification-sound";
import { cn } from "@/lib/utils";

export function BrechaAlertsControl() {
  const {
    alertsEnabled,
    soundEnabled,
    osNotificationsEnabled,
    keepAwakeDuringShift,
    watchedBanks,
    minSpreadPercentThreshold,
    cooldownMinutes,
    isWakeLockActive,
    isBackgroundWorkerActive,
    setAlertsEnabled,
    setSoundEnabled,
    setOsNotificationsEnabled,
    setKeepAwakeDuringShift,
    toggleWatchedBank,
    setMinSpreadPercentThreshold,
    setCooldownMinutes,
  } = useAlertSettingsStore();

  const [isOpen, setIsOpen] = React.useState(false);
  const [osPermState, setOsPermState] = React.useState<string>("default");
  const panelRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setOsPermState(Notification.permission);
    } else {
      setOsPermState("unsupported");
    }
  }, [isOpen]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen]);

  const handleTestSound = async () => {
    await unlockAudioContext();
    await playBrechaImprovedSound();
    toast.success("Prueba de alerta: ¡Brecha Banesco +1.65%!", {
      description: "Así sonará y aparecerá el aviso cuando un banco mejore.",
      duration: 4500,
    });
    if (osNotificationsEnabled && osPermState === "granted") {
      await showOsNotification({
        title: "📈 Bot P2P — Prueba de Alerta",
        body: "Las notificaciones sonoras y del sistema están listas.",
        tag: "bot-p2p-test",
      });
    }
  };

  const handleToggleOsNotifications = async () => {
    if (osNotificationsEnabled) {
      setOsNotificationsEnabled(false);
      return;
    }
    const perm = await requestOsNotificationPermission();
    setOsPermState(perm);
    if (perm === "granted") {
      setOsNotificationsEnabled(true);
      toast.success("Notificaciones del sistema activadas", {
        description:
          "Recibirás avisos incluso cuando estés operando en otra pestaña o en Binance.",
      });
    } else if (perm === "denied") {
      toast.error("Permiso de notificaciones bloqueado en el navegador", {
        description:
          "Habilita notificaciones en la configuración del sitio de Chrome/Safari.",
      });
    } else {
      toast.info("Este navegador no soporta notificaciones nativas del sistema.");
    }
  };

  const isBackgroundLive = isWakeLockActive || isBackgroundWorkerActive;

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => {
          void unlockAudioContext();
          setIsOpen((prev) => !prev);
        }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-extrabold transition-all",
          alertsEnabled
            ? "border-emerald-300/90 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-[#0ECB81]/40 dark:bg-[#0ECB81]/15 dark:text-[#0ECB81] dark:hover:bg-[#0ECB81]/25"
            : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#848E9C]"
        )}
        title="Configurar alertas con sonido para brechas bancarias y segundo plano"
      >
        {alertsEnabled ? (
          <Bell className="h-3.5 w-3.5" />
        ) : (
          <BellOff className="h-3.5 w-3.5" />
        )}
        <span>Alertas</span>
        {alertsEnabled && soundEnabled && (
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-[#0ECB81]" />
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-40 mt-2 w-[320px] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-[#2B3139] dark:bg-[#181A20] sm:w-[350px]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-[#2B3139]">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-emerald-600 dark:text-[#FCD535]" />
              <span className="text-xs font-extrabold text-slate-900 dark:text-[#EAECEF]">
                Alertas con Sonido &amp; Segundo Plano
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Cerrar panel de alertas"
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-[#848E9C] dark:hover:bg-[#2B3139]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 flex flex-col gap-3 text-xs">
            {/* Switch 1: Alertas de Brechas */}
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-bold text-slate-800 dark:text-[#EAECEF]">
                  Avisar cuando mejore una brecha
                </p>
                <p className="text-[11px] text-slate-500 dark:text-[#848E9C]">
                  Detecta mejoras sobre tu umbral sin spam
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAlertsEnabled(!alertsEnabled)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-extrabold transition-colors",
                  alertsEnabled
                    ? "bg-emerald-600 text-white dark:bg-[#0ECB81] dark:text-[#0B0E11]"
                    : "bg-slate-200 text-slate-600 dark:bg-[#2B3139] dark:text-[#848E9C]"
                )}
              >
                {alertsEnabled ? "ACTIVO" : "OFF"}
              </button>
            </div>

            {/* Switch 2: Sonido + Probar Sonido */}
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 dark:border-[#2B3139] dark:bg-[#0B0E11]">
              <button
                type="button"
                onClick={() => {
                  void unlockAudioContext();
                  setSoundEnabled(!soundEnabled);
                }}
                className="flex items-center gap-2 font-bold text-slate-800 dark:text-[#EAECEF]"
              >
                {soundEnabled ? (
                  <Volume2 className="h-4 w-4 text-emerald-600 dark:text-[#0ECB81]" />
                ) : (
                  <VolumeX className="h-4 w-4 text-slate-400" />
                )}
                <span>{soundEnabled ? "Sonido activado" : "Sonido silenciado"}</span>
              </button>

              <button
                type="button"
                onClick={() => void handleTestSound()}
                className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-extrabold text-white transition-colors hover:bg-slate-800 dark:bg-[#FCD535] dark:text-[#0B0E11] dark:hover:bg-[#F0B90B]"
              >
                Probar sonido
              </button>
            </div>

            {/* Switch 3: Notificaciones nativas del SO */}
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-bold text-slate-800 dark:text-[#EAECEF]">
                  Notificaciones en barra del SO
                </p>
                <p className="text-[11px] text-slate-500 dark:text-[#848E9C]">
                  {osPermState === "granted"
                    ? "Permiso concedido en este dispositivo"
                    : osPermState === "denied"
                      ? "Bloqueado en ajustes del navegador"
                      : "Ver alertas aunque estés en Binance"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleToggleOsNotifications()}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-extrabold transition-colors",
                  osNotificationsEnabled && osPermState === "granted"
                    ? "bg-emerald-600 text-white dark:bg-[#0ECB81] dark:text-[#0B0E11]"
                    : "bg-slate-200 text-slate-700 dark:bg-[#2B3139] dark:text-[#EAECEF]"
                )}
              >
                {osNotificationsEnabled && osPermState === "granted"
                  ? "ON"
                  : "Activar"}
              </button>
            </div>

            {/* Switch 4: Mantener app activa en segundo plano durante jornada */}
            <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2 dark:border-[#FCD535]/25 dark:bg-[#FCD535]/10">
              <div className="pr-2">
                <p className="flex items-center gap-1.5 font-bold text-amber-950 dark:text-[#FCD535]">
                  <Radio className="h-3.5 w-3.5" />
                  <span>Activa en 2do plano (Jornada)</span>
                </p>
                <p className="text-[10.5px] leading-snug text-amber-900/80 dark:text-[#EAECEF]/80">
                  Mantiene Wake Lock y pulso activo mientras tengas una jornada abierta.
                </p>
                {isBackgroundLive && (
                  <span className="mt-1 inline-block rounded bg-emerald-600/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-[#0ECB81]/20 dark:text-[#0ECB81]">
                    ● Activo ahora en jornada
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setKeepAwakeDuringShift(!keepAwakeDuringShift)}
                className={cn(
                  "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold transition-colors",
                  keepAwakeDuringShift
                    ? "bg-amber-600 text-white dark:bg-[#FCD535] dark:text-[#0B0E11]"
                    : "bg-slate-200 text-slate-600 dark:bg-[#2B3139] dark:text-[#848E9C]"
                )}
              >
                {keepAwakeDuringShift ? "ON" : "OFF"}
              </button>
            </div>

            {/* Umbral % y Cooldown */}
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-slate-600 dark:text-[#848E9C]">
                  Brecha mínima (%)
                </span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="20"
                  value={minSpreadPercentThreshold}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) setMinSpreadPercentThreshold(v);
                  }}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-[#2B3139] dark:bg-[#0B0E11] dark:text-[#EAECEF] dark:focus:border-[#FCD535]"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-bold text-slate-600 dark:text-[#848E9C]">
                  Espera entre avisos (min)
                </span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="60"
                  value={cooldownMinutes}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) setCooldownMinutes(v);
                  }}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs font-bold text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-[#2B3139] dark:bg-[#0B0E11] dark:text-[#EAECEF] dark:focus:border-[#FCD535]"
                />
              </label>
            </div>

            {/* Bancos vigilados */}
            <div>
              <span className="text-[11px] font-bold text-slate-600 dark:text-[#848E9C]">
                Bancos vigilados:
              </span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {DEFAULT_WATCHED_BANKS.map((bank) => {
                  const selected = watchedBanks.includes(bank);
                  return (
                    <button
                      key={bank}
                      type="button"
                      onClick={() => toggleWatchedBank(bank)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition-all",
                        selected
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-[#0ECB81]/40 dark:bg-[#0ECB81]/15 dark:text-[#0ECB81]"
                          : "border-slate-200 bg-white text-slate-500 dark:border-[#2B3139] dark:bg-[#0B0E11] dark:text-[#848E9C]"
                      )}
                    >
                      {selected && <Check className="h-3 w-3" />}
                      <span>{bank}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
