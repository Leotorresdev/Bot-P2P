"use client";

import * as React from "react";
import { Smartphone, Share, PlusSquare, X } from "lucide-react";
import { usePwaInstallStore } from "@/features/p2p-ledger/store/use-pwa-install-store";
import { cn } from "@/lib/utils";

interface InstallAppButtonProps {
  readonly variant?: "navbar" | "pill";
  readonly className?: string;
}

export function InstallAppButton({
  variant = "navbar",
  className,
}: InstallAppButtonProps) {
  const {
    deferredPrompt,
    isInstalled,
    isIosSafari,
    isInstalling,
    triggerInstall,
  } = usePwaInstallStore();
  const [showIosGuide, setShowIosGuide] = React.useState(false);

  const canInstallNative = deferredPrompt !== null;
  const shouldShow = !isInstalled && (canInstallNative || isIosSafari);

  if (!shouldShow) {
    return null;
  }

  const handleClick = async () => {
    if (canInstallNative) {
      await triggerInstall();
      return;
    }
    if (isIosSafari) {
      setShowIosGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isInstalling}
        title="Instalar Bot P2P como aplicación en tu teléfono o computadora"
        className={cn(
          variant === "pill"
            ? "inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-600 px-3.5 py-[6px] font-sans text-[11px] font-bold leading-[14px] text-white shadow-sm transition-all hover:bg-emerald-700 disabled:opacity-60"
            : "flex items-center gap-1.5 rounded-xl border border-emerald-300/80 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 shadow-sm transition-all hover:border-emerald-400 hover:bg-emerald-100 active:scale-[0.98] disabled:opacity-60 dark:border-[#0ECB81]/40 dark:bg-[#0ECB81]/15 dark:text-[#0ECB81] dark:hover:bg-[#0ECB81]/20",
          className
        )}
      >
        <Smartphone className="h-3.5 w-3.5 shrink-0" />
        <span>{isInstalling ? "Instalando..." : "Instalar App"}</span>
      </button>

      {showIosGuide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cómo instalar Bot P2P en iPhone o iPad"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setShowIosGuide(false)}
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-[#2B3139] dark:bg-[#181A20]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              aria-label="Cerrar instrucciones"
              className="absolute right-3.5 top-3.5 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-[#848E9C] dark:hover:bg-[#2B3139] dark:hover:text-[#EAECEF]"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2.5 pr-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:bg-[#0ECB81]/15 dark:text-[#0ECB81]">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-sm font-extrabold text-slate-900 dark:text-[#EAECEF]">
                  Instalar Bot P2P en iPhone
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-[#848E9C]">
                  Acceso directo desde tu pantalla de inicio
                </p>
              </div>
            </div>

            <ol className="mt-4 space-y-3 text-xs text-slate-700 dark:text-[#EAECEF]">
              <li className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-[#2B3139] dark:bg-[#0B0E11]">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-extrabold text-white dark:bg-[#FCD535] dark:text-[#0B0E11]">
                  1
                </span>
                <div className="leading-relaxed">
                  Toca el botón{" "}
                  <span className="inline-flex items-center gap-1 font-bold text-slate-900 dark:text-[#FCD535]">
                    <Share className="inline h-3.5 w-3.5" />
                    Compartir
                  </span>{" "}
                  en la barra inferior de Safari.
                </div>
              </li>
              <li className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-[#2B3139] dark:bg-[#0B0E11]">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-extrabold text-white dark:bg-[#FCD535] dark:text-[#0B0E11]">
                  2
                </span>
                <div className="leading-relaxed">
                  Desliza y selecciona{" "}
                  <span className="inline-flex items-center gap-1 font-bold text-slate-900 dark:text-[#0ECB81]">
                    <PlusSquare className="inline h-3.5 w-3.5" />
                    Añadir a pantalla de inicio
                  </span>{" "}
                  y pulsa <strong>Añadir</strong>.
                </div>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIosGuide(false)}
              className="mt-4 w-full rounded-xl bg-slate-900 py-2.5 text-xs font-extrabold text-white transition-colors hover:bg-slate-800 dark:bg-[#FCD535] dark:text-[#0B0E11] dark:hover:bg-[#F0B90B]"
            >
              Entendido
            </button>
          </div>
        </div>
      )}
    </>
  );
}
