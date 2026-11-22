"use client";

/**
 * Motor ligero de sonido fintech (Web Audio API, 0 KB de assets externos, funciona 100% offline en PWA)
 * + utilitario seguro de notificaciones nativas del SO (ServiceWorkerRegistration.showNotification / Notification API).
 */

interface WindowWithWebkitAudio extends Window {
  readonly webkitAudioContext?: typeof AudioContext;
}

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedAudioCtx) return sharedAudioCtx;
  const Ctx =
    window.AudioContext ??
    (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!Ctx) return null;
  try {
    sharedAudioCtx = new Ctx();
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

/**
 * Desbloquea el AudioContext ante un gesto del usuario (clic/toque),
 * cumpliendo la política autoplay de Chrome Android, Safari iOS y Desktop.
 */
export async function unlockAudioContext(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
    return ctx.state === "running";
  } catch {
    return false;
  }
}

function scheduleTone(
  ctx: AudioContext,
  options: {
    readonly frequencyHz: number;
    readonly startOffsetSec: number;
    readonly durationSec: number;
    readonly peakGain: number;
    readonly waveType?: OscillatorType;
  }
): void {
  const startTime = ctx.currentTime + options.startOffsetSec;
  const endTime = startTime + options.durationSec;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = options.waveType ?? "sine";
  osc.frequency.setValueAtTime(options.frequencyHz, startTime);

  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(
    Math.max(0.001, options.peakGain),
    startTime + 0.018
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(startTime);
  osc.stop(endTime + 0.02);
}

/**
 * Sonido brillante ascendente (2 notas armónicas tipo alerta de trading)
 * cuando la brecha de un banco mejora por encima del umbral.
 */
export async function playBrechaImprovedSound(): Promise<void> {
  const ready = await unlockAudioContext();
  const ctx = getAudioContext();
  if (!ready || !ctx) return;

  // Chime ascendente limpio: A5 (880Hz) -> E6 (1318.5Hz) -> A6 (1760Hz suave)
  scheduleTone(ctx, {
    frequencyHz: 880,
    startOffsetSec: 0,
    durationSec: 0.14,
    peakGain: 0.16,
    waveType: "triangle",
  });
  scheduleTone(ctx, {
    frequencyHz: 1318.51,
    startOffsetSec: 0.11,
    durationSec: 0.22,
    peakGain: 0.18,
    waveType: "sine",
  });
  scheduleTone(ctx, {
    frequencyHz: 1760,
    startOffsetSec: 0.21,
    durationSec: 0.26,
    peakGain: 0.1,
    waveType: "sine",
  });
}

/**
 * Tono firme de arranque al pulsar "Iniciar Jornada".
 */
export async function playShiftStartSound(): Promise<void> {
  const ready = await unlockAudioContext();
  const ctx = getAudioContext();
  if (!ready || !ctx) return;

  // Acorde ascendente C5 -> G5 -> C6
  scheduleTone(ctx, {
    frequencyHz: 523.25,
    startOffsetSec: 0,
    durationSec: 0.12,
    peakGain: 0.15,
    waveType: "triangle",
  });
  scheduleTone(ctx, {
    frequencyHz: 783.99,
    startOffsetSec: 0.1,
    durationSec: 0.15,
    peakGain: 0.16,
    waveType: "triangle",
  });
  scheduleTone(ctx, {
    frequencyHz: 1046.5,
    startOffsetSec: 0.2,
    durationSec: 0.26,
    peakGain: 0.14,
    waveType: "sine",
  });
}

/**
 * Acorde suave descendente de confirmación al pulsar "Cerrar Jornada".
 */
export async function playShiftCloseSound(): Promise<void> {
  const ready = await unlockAudioContext();
  const ctx = getAudioContext();
  if (!ready || !ctx) return;

  // Descenso limpio G5 -> E5 -> C5
  scheduleTone(ctx, {
    frequencyHz: 783.99,
    startOffsetSec: 0,
    durationSec: 0.13,
    peakGain: 0.14,
    waveType: "sine",
  });
  scheduleTone(ctx, {
    frequencyHz: 659.25,
    startOffsetSec: 0.11,
    durationSec: 0.16,
    peakGain: 0.14,
    waveType: "sine",
  });
  scheduleTone(ctx, {
    frequencyHz: 523.25,
    startOffsetSec: 0.22,
    durationSec: 0.28,
    peakGain: 0.13,
    waveType: "sine",
  });
}

/**
 * Solicita permiso de notificaciones del Sistema Operativo (Chrome Android / Desktop / iOS PWA).
 */
export async function requestOsNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "granted") {
    return "granted";
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/**
 * Envía una notificación nativa del SO (priorizando ServiceWorkerRegistration.showNotification
 * para máxima compatibilidad en Android Chrome / PWA instalada).
 */
export async function showOsNotification(payload: {
  readonly title: string;
  readonly body: string;
  readonly tag?: string;
}): Promise<boolean> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return false;
  }
  if (Notification.permission !== "granted") {
    return false;
  }

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration("/");
      if (reg && typeof reg.showNotification === "function") {
        await reg.showNotification(payload.title, {
          body: payload.body,
          icon: "/icons/icon-192x192.png",
          badge: "/icons/icon-192x192.png",
          tag: payload.tag ?? "bot-p2p-alert",
          silent: false,
        });
        return true;
      }
    }
  } catch {
    // Fallback a Notification directo
  }

  try {
    new Notification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192x192.png",
      tag: payload.tag ?? "bot-p2p-alert",
    });
    return true;
  } catch {
    return false;
  }
}
