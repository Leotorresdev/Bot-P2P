"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useThemeStore } from "@/features/p2p-ledger/store/use-theme-store";
import { PwaProvider } from "@/components/providers/pwa-provider";

function ThemeSynchronizer() {
  const theme = useThemeStore((state) => state.theme);

  React.useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  return (
    <Toaster
      theme={theme}
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        className:
          "font-sans text-xs border border-slate-200 dark:border-[#2B3139]",
      }}
    />
  );
}

export function QueryProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSynchronizer />
      <PwaProvider />
      {children}
    </QueryClientProvider>
  );
}
