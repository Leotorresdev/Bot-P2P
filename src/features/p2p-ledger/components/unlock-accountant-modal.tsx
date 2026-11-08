"use client";

import * as React from "react";
import { Lock, Eye, EyeOff, X, ShieldCheck, FileCheck2 } from "lucide-react";
import { useLedgerUiStore } from "@/features/p2p-ledger/store/use-ledger-ui-store";
import { FinanceLogo } from "@/components/ui/finance-logo";

export function UnlockAccountantModal() {
  const {
    isUnlockAccountantModalOpen,
    setUnlockAccountantModalOpen,
    setActiveRole,
  } = useLedgerUiStore();

  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isVerifying, setIsVerifying] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (isUnlockAccountantModalOpen) {
      setPassword("");
      setError(null);
      setShowPassword(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 60);
    }
  }, [isUnlockAccountantModalOpen]);

  if (!isUnlockAccountantModalOpen) {
    return null;
  }

  const handleClose = () => {
    setUnlockAccountantModalOpen(false);
    setPassword("");
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError("Por favor ingresa tu contraseña para continuar.");
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
      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Contraseña incorrecta.");
        setIsVerifying(false);
        return;
      }

      setIsVerifying(false);
      setActiveRole("AUDITOR_SENIAT");
      setUnlockAccountantModalOpen(false);
      setPassword("");
    } catch {
      setError("No se pudo verificar la contraseña con el servidor.");
      setIsVerifying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={handleClose}
    >
      <div
        className="relative flex w-full max-w-[440px] flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Botón Cerrar */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Cerrar ventana"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Encabezado */}
        <div className="flex items-start gap-3.5 pr-6">
          <FinanceLogo
            size={44}
            variant="accountant"
            className="h-11 w-11 shrink-0 rounded-2xl shadow-md shadow-amber-500/20"
          />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-lg font-extrabold text-slate-900">
                Activar Modo Contador
              </h3>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              Ingresa tu contraseña para mostrar únicamente los libros de IVA
              (16%) y cierres de las 11:59 PM.
            </p>
          </div>
        </div>

        {/* Resumen de Privacidad */}
        <div className="flex flex-col gap-2 rounded-xl border border-amber-200/80 bg-amber-50/60 p-3.5 text-xs">
          <div className="flex items-center gap-2 font-bold text-amber-950">
            <ShieldCheck className="h-4 w-4 shrink-0 text-amber-600" />
            <span>¿Qué verá tu contador en este modo?</span>
          </div>
          <ul className="ml-6 list-disc space-y-1 text-[11px] font-medium text-amber-900">
            <li>Actas de cierre diario (11:59 PM) y descarga de Excel SENIAT.</li>
            <li>
              <strong>Oculto por seguridad:</strong> Tus claves API de Binance y
              configuración de cuenta quedan bloqueadas.
            </li>
          </ul>
        </div>

        {/* Formulario de Contraseña */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="unlock-accountant-password"
              className="text-xs font-bold text-slate-800"
            >
              Confirma tu Contraseña de Operador
            </label>
            <div className="relative flex items-center">
              <Lock className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                id="unlock-accountant-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="••••••••••••"
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2.5 pl-10 pr-10 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 text-slate-400 hover:text-slate-700"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {error && (
              <span className="text-xs font-semibold text-rose-600">
                {error}
              </span>
            )}
          </div>

          {/* Botones de Acción */}
          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isVerifying}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-amber-600/20 transition-all hover:from-amber-500 hover:to-amber-600 disabled:opacity-60"
            >
              <FileCheck2 className="h-4 w-4" />
              <span>
                {isVerifying ? "Verificando..." : "Mostrar Modo Contador"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
