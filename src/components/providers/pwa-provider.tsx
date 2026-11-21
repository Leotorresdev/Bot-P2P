"use client";

import * as React from "react";
import {
  usePwaInstallStore,
  type BeforeInstallPromptEvent,
} from "@/features/p2p-ledger/store/use-pwa-install-store";

interface NavigatorWithStandalone extends Navigator {
  readonly standalone?: boolean;
}

function detectStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;
  const standaloneMedia = window.matchMedia(
    "(display-mode: standalone)"
  ).matches;
  const iosStandalone =
    (window.navigator as NavigatorWithStandalone).standalone === true;
  return standaloneMedia || iosStandalone;
}

function detectIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  const isIosDevice =
    /iPad|iPhone|iPod/.test(ua) ||
    (window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1);
  const isWebKit = /WebKit/i.test(ua);
  const isOtherIosBrowser = /CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua);
  return isIosDevice && isWebKit && !isOtherIosBrowser;
}

export function PwaProvider() {
  const setDeferredPrompt = usePwaInstallStore(
    (state) => state.setDeferredPrompt
  );
  const setIsInstalled = usePwaInstallStore((state) => state.setIsInstalled);
  const setIsIosSafari = usePwaInstallStore((state) => state.setIsIosSafari);

  React.useEffect(() => {
    const isStandalone = detectStandaloneMode();
    setIsInstalled(isStandalone);
    setIsIosSafari(detectIosSafari());

    // 1. Registrar Service Worker para habilitar instalación PWA nativa y respaldo offline
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // Ignorar fallo silencioso en contextos no seguros o navegación privada restrictiva
        });
    }

    // 2. Capturar evento nativo de instalación en Android Chrome / Edge / Desktop
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    const displayModeQuery = window.matchMedia("(display-mode: standalone)");
    const handleDisplayModeChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setIsInstalled(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    displayModeQuery.addEventListener("change", handleDisplayModeChange);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
      displayModeQuery.removeEventListener("change", handleDisplayModeChange);
    };
  }, [setDeferredPrompt, setIsInstalled, setIsIosSafari]);

  return null;
}
