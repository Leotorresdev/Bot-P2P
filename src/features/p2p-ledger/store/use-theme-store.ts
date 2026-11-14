"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppThemeMode = "dark" | "light";

interface ThemeState {
  readonly theme: AppThemeMode;
  setTheme: (theme: AppThemeMode) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "dark",
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === "dark" ? "light" : "dark",
        })),
    }),
    {
      name: "bot-p2p-theme",
    }
  )
);
