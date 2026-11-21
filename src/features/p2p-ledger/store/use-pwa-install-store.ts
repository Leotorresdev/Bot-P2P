"use client";

import { create } from "zustand";

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  readonly userChoice: Promise<{
    readonly outcome: "accepted" | "dismissed";
    readonly platform: string;
  }>;
  prompt: () => Promise<void>;
}

interface PwaInstallState {
  readonly deferredPrompt: BeforeInstallPromptEvent | null;
  readonly isInstalled: boolean;
  readonly isIosSafari: boolean;
  readonly isInstalling: boolean;
  setDeferredPrompt: (event: BeforeInstallPromptEvent | null) => void;
  setIsInstalled: (installed: boolean) => void;
  setIsIosSafari: (isIos: boolean) => void;
  triggerInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

export const usePwaInstallStore = create<PwaInstallState>((set, get) => ({
  deferredPrompt: null,
  isInstalled: false,
  isIosSafari: false,
  isInstalling: false,
  setDeferredPrompt: (event) => set({ deferredPrompt: event }),
  setIsInstalled: (installed) =>
    set(installed ? { isInstalled: true, deferredPrompt: null } : { isInstalled: false }),
  setIsIosSafari: (isIos) => set({ isIosSafari: isIos }),
  triggerInstall: async () => {
    const promptEvent = get().deferredPrompt;
    if (!promptEvent) {
      return "unavailable";
    }
    set({ isInstalling: true });
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        set({
          deferredPrompt: null,
          isInstalled: true,
          isInstalling: false,
        });
      } else {
        set({ deferredPrompt: null, isInstalling: false });
      }
      return choice.outcome;
    } catch {
      set({ isInstalling: false });
      return "dismissed";
    }
  },
}));
