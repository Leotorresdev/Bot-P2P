"use client";

import * as React from "react";
import { Lock, Eye, EyeOff, ShieldCheck, ArrowRight, KeyRound } from "lucide-react";
import { useLedgerUiStore } from "@/features/p2p-ledger/store/use-ledger-ui-store";
import { cn } from "@/lib/utils";

export function ResultsLockScreen() {
  const { setResultsUnlocked, setActiveTab } = useLedgerUiStore();
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isVerifying, setIsVerifying] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 80);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Ingresa la contraseña de tu cuenta para desbloquear.");
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const res = await fetch("/api/p2p/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = (await res.json()) as { error?: string; verified?: boolean };

      if (!res.ok) {
        setError(json.error ?? "Contraseña incorrecta.");
        setIsVerifying(false);
        return;
      }

      setPassword("");
      setIsVerifying(false);
      setResultsUnlocked(true);
    } catch {
      setError("No se pudo validar la contraseña con el servidor.");
      setIsVerifying(false);
    }
  };

  return (
    <div className="flex min-h-[68vh] w-full items-center justify-center px-3 py-8">
      <div className="relative w-full max-w-[440px] overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xl transition-all dark:border-[#2B3139] dark:bg-[#181A20] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.75)] sm:p-8">
        {/* Línea superior dorada estilo Binance Pro */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#F0B90B] via-[#FCD535] to-[#F0B90B]" />

        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-amber-600 shadow-sm dark:border-[#FCD535]/30 dark:bg-[#FCD535]/10 dark:text-[#FCD535]">
            <Lock className="h-6 w-6" />
          </div>

          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#848E9C]">
            <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-[#0ECB81]" />
            Bóveda Operativa Protegida
          </span>

          <h2 className="mt-3 font-display text-xl font-extrabold tracking-tight text-slate-900 dark:text-[#EAECEF]">
            Acceso a Resultados
          </h2>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500 dark:text-[#848E9C]">
            Por seguridad, el panel financiero, ganancias P&amp;L, historial de
            órdenes y credenciales están ocultos. Ingresa la contraseña de tu
            cuenta del bot para desbloquear.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="results-unlock-password"
              className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-[#EAECEF]"
            >
              <KeyRound className="h-3.5 w-3.5 text-amber-600 dark:text-[#FCD535]" />
              <span>Contraseña de la cuenta</span>
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                id="results-unlock-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Ingresa tu contraseña..."
                autoComplete="current-password"
                className={cn(
                  "w-full rounded-xl border bg-slate-50 px-3.5 py-2.5 pr-10 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none transition-colors",
                  "dark:bg-[#1E2329] dark:text-[#EAECEF] dark:placeholder:text-[#848E9C]",
                  error
                    ? "border-rose-400 focus:border-rose-500 dark:border-[#F6465D] dark:focus:border-[#F6465D]"
                    : "border-slate-200 focus:border-amber-500 dark:border-[#2B3139] dark:focus:border-[#FCD535]"
                )}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={
                  showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-700 dark:text-[#848E9C] dark:hover:text-[#EAECEF]"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {error && (
              <p className="text-xs font-semibold text-rose-600 dark:text-[#F6465D]">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isVerifying}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition-all hover:bg-slate-800 active:scale-[0.99] disabled:opacity-60 dark:bg-[#FCD535] dark:text-[#0B0E11] dark:hover:bg-[#F0B90B]"
          >
            <span>
              {isVerifying ? "Verificando..." : "Desbloquear Resultados"}
            </span>
            <ArrowRight className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("MARKET_LIVE")}
            className="w-full rounded-xl border border-slate-200 bg-transparent px-4 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-[#2B3139] dark:text-[#848E9C] dark:hover:bg-[#1E2329] dark:hover:text-[#EAECEF]"
          >
            Volver a Gráficas y Brechas en Vivo
          </button>
        </form>
      </div>
    </div>
  );
}
