"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  LoginCredentialsSchema,
  type LoginCredentialsInput,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import { useLedgerUiStore } from "@/features/p2p-ledger/store/use-ledger-ui-store";
import { FinanceLogo } from "@/components/ui/finance-logo";
import { cn } from "@/lib/utils";

export function LoginVaultScreen() {
  const router = useRouter();
  const { setActiveRole, setActiveTab } = useLedgerUiStore();
  const [showPassword, setShowPassword] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [totpDigits, setTotpDigits] = React.useState<string[]>([
    "",
    "",
    "",
    "",
    "",
    "",
  ]);

  const inputRefs = React.useRef<Array<HTMLInputElement | null>>([]);

  const form = useForm<LoginCredentialsInput>({
    resolver: zodResolver(LoginCredentialsSchema),
    defaultValues: {
      role: "OPERATOR",
      email: "",
      password: "",
      totpCode: "",
    },
  });

  const handleDigitChange = (index: number, rawValue: string) => {
    const clean = rawValue.replace(/\D/g, "").slice(-1);
    const updated = [...totpDigits];
    updated[index] = clean;
    setTotpDigits(updated);

    const joinedCode = updated.join("");
    form.setValue("totpCode", joinedCode, {
      shouldValidate: joinedCode.length === 6,
    });

    if (clean && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (!pasted) return;
    const nextDigits = ["", "", "", "", "", ""];
    for (let i = 0; i < 6; i++) {
      nextDigits[i] = pasted[i] ?? "";
    }
    setTotpDigits(nextDigits);
    form.setValue("totpCode", nextDigits.join(""), { shouldValidate: true });
    const focusIdx = Math.min(pasted.length, 5);
    inputRefs.current[focusIdx]?.focus();
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Backspace" && !totpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const onSubmit = async (values: LoginCredentialsInput) => {
    setIsSubmitting(true);
    setApiError(null);
    try {
      const res = await fetch("/api/p2p/login-vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, role: "OPERATOR" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApiError(data.error ?? "Error al verificar tus datos de acceso");
        setIsSubmitting(false);
        return;
      }
      setActiveRole("OPERATOR");
      setActiveTab("MARKET_LIVE");
      router.refresh();
      router.push("/");
    } catch {
      setApiError("Error de conexión con el servidor. Intenta nuevamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-[#F6F8F7] text-xs leading-4 antialiased lg:flex-row">
      {/* COLUMNA IZQUIERDA (640px en Desktop, fondo #0B1714) */}
      <aside className="flex w-full shrink-0 flex-col justify-between bg-[#0B1714] px-8 py-10 lg:min-h-screen lg:w-[640px] lg:px-[52px] lg:py-12">
        {/* Cabecera de Marca */}
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FinanceLogo
              size={38}
              className="h-[38px] w-[38px] shadow-md shadow-emerald-500/20"
            />
            <div className="flex flex-col gap-[1px]">
              <span className="font-display text-base font-bold leading-5 text-white">
                Bot P2P
              </span>
              <span className="font-sans text-[11px] leading-[14px] text-[#94A39E]">
                Control Contable &amp; Monitoreo P2P
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-full border border-[#10B981]/35 bg-[#059669]/15 px-3 py-[5px]">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#10B981]" />
            <span className="font-sans text-[11px] font-semibold leading-[14px] text-[#6EE7B7]">
              ACCESO PROTEGIDO
            </span>
          </div>
        </div>

        {/* Bloque Central: Titular + 3 Pilares */}
        <div className="my-10 flex w-full flex-col gap-7">
          <div className="flex flex-col gap-2.5">
            <span className="font-sans text-[11px] font-bold uppercase leading-[14px] tracking-[0.08em] text-[#10B981]">
              SEGURIDAD &bull; CONTROL CONTABLE
            </span>
            <h1 className="font-display text-[30px] font-bold leading-[36px] tracking-[-0.025em] text-white">
              Tus cuentas y ganancias P2P, fáciles y al día.
            </h1>
            <p className="font-sans text-[13px] leading-[20px] text-[#A7B8B2]">
              Mira cuánto ganas en cada venta de Binance, monitorea las brechas
              de los bancos nacionales y ten tus reportes listos sin enredos.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3.5">
            {/* Pilar 1 */}
            <div className="flex items-start gap-3.5 rounded-xl border border-white/[0.09] bg-white/[0.04] px-4 py-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#10B981]/15">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div className="flex flex-col gap-[3px]">
                <span className="font-display text-[13px] font-bold leading-[17px] text-white">
                  1. Tus claves siempre protegidas
                </span>
                <span className="font-sans text-[12px] leading-[17px] text-[#94A39E]">
                  Tus credenciales de Binance se guardan con seguridad bancaria.
                  Nadie más tiene acceso a ellas.
                </span>
              </div>
            </div>

            {/* Pilar 2 */}
            <div className="flex items-start gap-3.5 rounded-xl border border-white/[0.09] bg-white/[0.04] px-4 py-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#10B981]/15">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div className="flex flex-col gap-[3px]">
                <span className="font-display text-[13px] font-bold leading-[17px] text-white">
                  2. Tu dinero nunca sale de Binance
                </span>
                <span className="font-sans text-[12px] leading-[17px] text-[#94A39E]">
                  El bot solo lee tus órdenes para calcular ganancias. Es
                  imposible retirar o transferir tus fondos.
                </span>
              </div>
            </div>

            {/* Pilar 3 */}
            <div className="flex items-start gap-3.5 rounded-xl border border-white/[0.09] bg-white/[0.04] px-4 py-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#D97706]/[0.18]">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div className="flex flex-col gap-[3px]">
                <span className="font-display text-[13px] font-bold leading-[17px] text-white">
                  3. Modo Contador integrado en tu cuenta
                </span>
                <span className="font-sans text-[12px] leading-[17px] text-[#94A39E]">
                  Activa la vista para tu contador con tu contraseña cuando
                  quieras mostrar o descargar los reportes del IVA (16%).
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Pie de Columna Izquierda Limpio */}
        <div className="flex w-full items-center justify-between border-t border-white/10 pt-5">
          <div className="flex items-center gap-2">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#10B981"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span className="font-sans text-[12px] leading-[16px] text-[#94A39E]">
              Tus datos financieros y contables siempre protegidos
            </span>
          </div>
          <span className="font-sans text-[11px] font-semibold leading-[14px] text-[#6EE7B7]">
            Verificación 2FA
          </span>
        </div>
      </aside>

      {/* COLUMNA DERECHA (Fondo #F6F8F7, Card centrada de 480px) */}
      <section className="flex flex-1 flex-col justify-between bg-[#F6F8F7] px-6 py-10 sm:px-16">
        {/* Barra Superior Derecha */}
        <div className="flex w-full items-center justify-end gap-2.5">
          <div className="flex items-center gap-1.5 rounded-full border border-[#E2E8E6] bg-white px-3 py-[5px]">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#059669]" />
            <span className="font-sans text-[11px] font-semibold leading-[14px] text-[#0B1714]">
              Sistema en Línea
            </span>
          </div>
        </div>

        {/* Tarjeta de Inicio de Sesión */}
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="my-8 flex w-full max-w-[480px] flex-col gap-[22px] self-center rounded-[20px] border border-[#E2E8E6] bg-white px-9 py-[34px] shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
        >
          {/* Encabezado Limpio */}
          <div className="flex w-full flex-col gap-3">
            <div className="flex items-center gap-3.5">
              <FinanceLogo
                size={44}
                variant="finance"
                className="h-11 w-11 shadow-md shadow-emerald-600/20"
              />
              <div className="flex flex-col gap-0.5">
                <h2 className="font-display text-2xl font-bold leading-[28px] tracking-[-0.02em] text-[#0B1714]">
                  Iniciar Sesión
                </h2>
                <p className="font-sans text-[13px] leading-[18px] text-[#4A5D58]">
                  Ingresa tus datos de operador para acceder a tu panel P2P.
                </p>
              </div>
            </div>

            {apiError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 font-sans text-xs font-medium text-red-600">
                {apiError}
              </div>
            )}
          </div>

          {/* Campos de Credenciales */}
          <div className="flex w-full flex-col gap-4">
            {/* Correo Electrónico */}
            <div className="flex w-full flex-col gap-1.5">
              <label className="font-sans text-xs font-semibold leading-4 text-[#0B1714]">
                Correo Electrónico
              </label>
              <div className="flex items-center rounded-[10px] border border-[#CBD5E1] bg-[#F6F8F7] px-3.5 py-[11px] transition-colors focus-within:border-[#059669] focus-within:bg-white">
                <input
                  type="email"
                  placeholder="ejemplo@tucorreo.com"
                  autoComplete="email"
                  {...form.register("email")}
                  className="w-full bg-transparent font-sans text-[13px] leading-4 text-[#0B1714] placeholder:text-[#94A39E] focus:outline-none"
                />
              </div>
              {form.formState.errors.email && (
                <span className="font-sans text-[11px] font-medium text-red-600">
                  {form.formState.errors.email.message}
                </span>
              )}
            </div>

            {/* Contraseña */}
            <div className="flex w-full flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="font-sans text-xs font-semibold leading-4 text-[#0B1714]">
                  Contraseña
                </label>
                <span className="cursor-pointer font-sans text-[11px] font-semibold leading-[14px] text-[#059669] hover:underline">
                  ¿Olvidaste tu contraseña?
                </span>
              </div>
              <div className="flex items-center justify-between rounded-[10px] border border-[#CBD5E1] bg-[#F6F8F7] px-3.5 py-[11px] transition-colors focus-within:border-[#059669] focus-within:bg-white">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  {...form.register("password")}
                  className="w-full bg-transparent font-sans text-sm leading-[18px] text-[#0B1714] placeholder:text-[#94A39E] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label="Mostrar u ocultar contraseña"
                  className="shrink-0 text-[#526660] hover:text-[#0B1714]"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#526660"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
              {form.formState.errors.password && (
                <span className="font-sans text-[11px] font-medium text-red-600">
                  {form.formState.errors.password.message}
                </span>
              )}
            </div>

            {/* Código Google Authenticator (2FA) */}
            <div className="flex w-full flex-col gap-2 pt-0.5">
              <div className="flex items-center justify-between">
                <label className="font-sans text-xs font-semibold leading-4 text-[#0B1714]">
                  Código de Seguridad (Google Authenticator)
                </label>
                <span className="font-sans text-[11px] font-medium leading-[14px] text-[#059669]">
                  6 dígitos
                </span>
              </div>

              <div className="flex w-full items-center justify-between gap-2">
                {totpDigits.map((digit, idx) => {
                  const hasDigit = digit !== "";
                  return (
                    <div
                      key={idx}
                      className={cn(
                        "flex h-[46px] flex-1 basis-0 items-center justify-center rounded-[9px] transition-colors",
                        hasDigit
                          ? "border-[1.5px] border-[#059669] bg-[#ECFDF5]"
                          : "border border-[#CBD5E1] bg-[#F6F8F7] focus-within:border-[#059669] focus-within:bg-white"
                      )}
                    >
                      <input
                        ref={(el) => {
                          inputRefs.current[idx] = el;
                        }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        placeholder="•"
                        onPaste={handlePaste}
                        onChange={(e) => handleDigitChange(idx, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(idx, e)}
                        aria-label={`Dígito Google Authenticator ${idx + 1}`}
                        className="h-full w-full bg-transparent text-center font-mono text-lg font-bold leading-[22px] text-[#0B1714] placeholder:text-[#94A39E] focus:outline-none"
                      />
                    </div>
                  );
                })}
              </div>
              {form.formState.errors.totpCode && (
                <span className="font-sans text-[11px] font-medium text-red-600">
                  {form.formState.errors.totpCode.message}
                </span>
              )}
            </div>
          </div>

          {/* Botón Entrar al Sistema + Enlace de Registro */}
          <div className="flex w-full flex-col gap-4 pt-1">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2.5 rounded-[10px] bg-[#059669] px-5 py-[13px] shadow-sm transition-colors hover:bg-[#047857] disabled:opacity-60"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span className="font-sans text-sm font-bold leading-[18px] text-white">
                {isSubmitting ? "Entrando..." : "Entrar al Sistema →"}
              </span>
            </button>

            {/* Enlace para Registrarse */}
            <div className="flex items-center justify-center gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
              <span>¿No tienes una cuenta de Bot P2P?</span>
              <Link
                href="/register"
                className="font-bold text-[#059669] hover:underline"
              >
                Crear cuenta nueva &rarr;
              </Link>
            </div>
          </div>
        </form>

        {/* Nota Legal Inferior */}
        <div className="flex w-full items-center justify-between">
          <span className="font-sans text-xs leading-4 text-[#526660]">
            &copy; 2026 Bot P2P &bull; Uso Privado Autorizado
          </span>
          <span className="font-sans text-[11px] leading-[14px] text-[#526660]">
            Normas Contables Venezolanas (VEN-NIF)
          </span>
        </div>
      </section>
    </div>
  );
}
