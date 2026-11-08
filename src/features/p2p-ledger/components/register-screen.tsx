"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  RegisterUserSchema,
  type RegisterUserInput,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import { useLedgerUiStore } from "@/features/p2p-ledger/store/use-ledger-ui-store";
import { FinanceLogo } from "@/components/ui/finance-logo";
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  Copy,
  KeyRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function RegisterScreen() {
  const router = useRouter();
  const { setActiveRole, setActiveTab } = useLedgerUiStore();
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [totpSetupKey, setTotpSetupKey] = React.useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = React.useState(false);

  const form = useForm<RegisterUserInput>({
    resolver: zodResolver(RegisterUserSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values: RegisterUserInput) => {
    setIsSubmitting(true);
    setApiError(null);
    try {
      const res = await fetch("/api/p2p/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      const json = await res.json();

      if (!res.ok) {
        setApiError(json.error ?? "No se pudo registrar la cuenta.");
        setIsSubmitting(false);
        return;
      }

      setActiveRole("OPERATOR");
      setActiveTab("DASHBOARD_LIVE");
      setTotpSetupKey(json.data?.totpSecret ?? null);
      setIsSubmitting(false);
    } catch (error) {
      setApiError(
        error instanceof Error ? error.message : "Error de conexión."
      );
      setIsSubmitting(false);
    }
  };

  const handleCopySecret = async () => {
    if (!totpSetupKey) return;
    try {
      await navigator.clipboard.writeText(totpSetupKey);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2500);
    } catch {
      // Fallback
    }
  };

  const handleGoToDashboard = () => {
    router.refresh();
    router.push("/");
  };

  return (
    <main className="flex min-h-screen w-full flex-col lg:flex-row">
      {/* COLUMNA IZQUIERDA: Marca & Beneficios */}
      <aside className="flex w-full shrink-0 flex-col justify-between bg-[#0B1714] px-8 py-10 lg:min-h-screen lg:w-[600px] lg:px-[52px] lg:py-12">
        {/* Cabecera de Marca */}
        <div className="flex w-full items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <FinanceLogo
              size={40}
              className="h-10 w-10 shadow-md shadow-emerald-500/20"
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

          <div className="flex items-center gap-1.5 rounded-full border border-[#10B981]/35 bg-[#059669]/15 px-3 py-1">
            <span className="h-2 w-2 rounded-full bg-[#10B981]" />
            <span className="font-sans text-[11px] font-semibold text-[#6EE7B7]">
              REGISTRO DE OPERADORES
            </span>
          </div>
        </div>

        {/* Bloque Central */}
        <div className="my-10 flex w-full flex-col gap-7">
          <div className="flex flex-col gap-3">
            <span className="font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-[#10B981]">
              NUEVA CUENTA DE COMERCIANTE P2P
            </span>
            <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-white">
              Crea tu cuenta de Bot P2P desde cero y toma el control.
            </h1>
            <p className="text-sm leading-relaxed text-[#A7B8B2]">
              Registra tu perfil de operador para monitorear las brechas reales
              de Binance, calcular el 0.163% de comisión y llevar tus cuentas
              al día.
            </p>
          </div>

          {/* Beneficios */}
          <div className="flex flex-col gap-3.5">
            <div className="flex items-start gap-3.5 rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-display text-sm font-bold text-white">
                  Cálculo automático de comisiones (0.163%)
                </span>
                <span className="text-xs leading-relaxed text-[#94A39E]">
                  Descuenta automáticamente la comisión de cada anuncio de
                  compra y de venta para mostrarte tu ganancia neta exacta.
                </span>
              </div>
            </div>

            <div className="flex items-start gap-3.5 rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="font-display text-sm font-bold text-white">
                  Protección con Google Authenticator (2FA)
                </span>
                <span className="text-xs leading-relaxed text-[#94A39E]">
                  Al crear tu cuenta recibirás tu llave única de Google
                  Authenticator para blindar el inicio de sesión.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Pie de Columna Izquierda */}
        <div className="flex w-full items-center justify-between border-t border-white/10 pt-5 text-xs text-[#94A39E]">
          <span>Tus datos financieros siempre protegidos</span>
          <span className="font-semibold text-[#6EE7B7]">Venezuela (UTC-4)</span>
        </div>
      </aside>

      {/* COLUMNA DERECHA: Formulario de Registro o Configuración 2FA */}
      <section className="flex flex-1 flex-col items-center justify-center bg-[#F6F8F7] px-6 py-10 sm:px-16">
        <div className="w-full max-w-[460px] flex flex-col gap-6">
          {totpSetupKey ? (
            /* PASO 2 POST-REGISTRO: Mostrar Clave de Google Authenticator */
            <div className="flex flex-col gap-5 rounded-2xl border border-emerald-200 bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
              <div className="flex items-center gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <div className="flex flex-col">
                  <h2 className="font-display text-xl font-extrabold text-slate-900">
                    ¡Cuenta Creada con Éxito!
                  </h2>
                  <p className="text-xs font-medium text-slate-500">
                    Guarda tu llave de Google Authenticator para futuros inicios
                    de sesión
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                <div className="flex items-center gap-2 text-xs font-extrabold text-amber-950">
                  <KeyRound className="h-4 w-4 text-amber-600" />
                  <span>
                    Tu Clave Secreta de Google Authenticator (2FA):
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-amber-900">
                  Abre la app <strong>Google Authenticator</strong> en tu
                  teléfono, pulsa el botón <strong>(+)</strong>, elige{" "}
                  <strong>&quot;Ingresar clave de configuración&quot;</strong> y
                  pega este código:
                </p>

                <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-300 bg-white px-3.5 py-2.5">
                  <code className="font-mono text-sm font-extrabold tracking-wider text-slate-900">
                    {totpSetupKey}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-amber-700"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>{copiedSecret ? "¡Copiada!" : "Copiar"}</span>
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoToDashboard}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3.5 text-xs font-extrabold text-white shadow-md shadow-emerald-600/20 transition-all hover:from-emerald-500 hover:to-teal-500"
              >
                <span>Ya guardé mi clave &bull; Entrar a mi Panel P2P</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          ) : (
            /* PASO 1: Formulario de Registro */
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="flex flex-col gap-5 rounded-2xl border border-slate-200/90 bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
            >
              {/* Encabezado del Formulario */}
              <div className="flex items-center gap-3.5">
                <FinanceLogo
                  size={44}
                  className="h-11 w-11 shadow-md shadow-emerald-600/20"
                />
                <div className="flex flex-col">
                  <h2 className="font-display text-2xl font-extrabold tracking-tight text-slate-900">
                    Crear Cuenta
                  </h2>
                  <p className="text-xs font-medium text-slate-500">
                    Ingresa tus datos para registrarte como operador del bot
                  </p>
                </div>
              </div>

              {apiError && (
                <div className="flex items-center gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                  <span>{apiError}</span>
                </div>
              )}

              {/* Campo 1: Nombre Completo / Razón Social */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="fullName"
                  className="text-xs font-bold text-slate-700"
                >
                  Nombre o Razón Comercial
                </label>
                <div className="relative flex items-center">
                  <User className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />
                  <input
                    id="fullName"
                    type="text"
                    placeholder="Ej: Inversiones P2P Caracas"
                    {...form.register("fullName")}
                    className={cn(
                      "w-full rounded-xl border bg-slate-50 py-2.5 pl-10 pr-4 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none",
                      form.formState.errors.fullName
                        ? "border-red-300 focus:border-red-500"
                        : "border-slate-200 focus:border-emerald-500"
                    )}
                  />
                </div>
                {form.formState.errors.fullName && (
                  <span className="text-[11px] font-semibold text-red-600">
                    {form.formState.errors.fullName.message}
                  </span>
                )}
              </div>

              {/* Campo 2: Correo Electrónico */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="email"
                  className="text-xs font-bold text-slate-700"
                >
                  Correo Electrónico
                </label>
                <div className="relative flex items-center">
                  <Mail className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />
                  <input
                    id="email"
                    type="email"
                    placeholder="ejemplo@tucorreo.com"
                    {...form.register("email")}
                    className={cn(
                      "w-full rounded-xl border bg-slate-50 py-2.5 pl-10 pr-4 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none",
                      form.formState.errors.email
                        ? "border-red-300 focus:border-red-500"
                        : "border-slate-200 focus:border-emerald-500"
                    )}
                  />
                </div>
                {form.formState.errors.email && (
                  <span className="text-[11px] font-semibold text-red-600">
                    {form.formState.errors.email.message}
                  </span>
                )}
              </div>

              {/* Campo 3: Contraseña */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="password"
                  className="text-xs font-bold text-slate-700"
                >
                  Contraseña (Mínimo 10 caracteres)
                </label>
                <div className="relative flex items-center">
                  <Lock className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••••••"
                    {...form.register("password")}
                    className={cn(
                      "w-full rounded-xl border bg-slate-50 py-2.5 pl-10 pr-10 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none",
                      form.formState.errors.password
                        ? "border-red-300 focus:border-red-500"
                        : "border-slate-200 focus:border-emerald-500"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {form.formState.errors.password && (
                  <span className="text-[11px] font-semibold text-red-600">
                    {form.formState.errors.password.message}
                  </span>
                )}
              </div>

              {/* Campo 4: Confirmar Contraseña */}
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="confirmPassword"
                  className="text-xs font-bold text-slate-700"
                >
                  Confirmar Contraseña
                </label>
                <div className="relative flex items-center">
                  <Lock className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••••••"
                    {...form.register("confirmPassword")}
                    className={cn(
                      "w-full rounded-xl border bg-slate-50 py-2.5 pl-10 pr-10 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none",
                      form.formState.errors.confirmPassword
                        ? "border-red-300 focus:border-red-500"
                        : "border-slate-200 focus:border-emerald-500"
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 text-slate-400 hover:text-slate-600"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {form.formState.errors.confirmPassword && (
                  <span className="text-[11px] font-semibold text-red-600">
                    {form.formState.errors.confirmPassword.message}
                  </span>
                )}
              </div>

              {/* Botón de Registro */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 py-3 text-xs font-extrabold text-white shadow-md shadow-emerald-600/20 transition-all hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50"
              >
                <span>
                  {isSubmitting
                    ? "Creando cuenta..."
                    : "Crear Mi Cuenta en Bot P2P"}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}

          {/* Enlace para volver a Iniciar Sesión */}
          <div className="flex items-center justify-center gap-1.5 text-xs text-slate-600">
            <span>¿Ya tienes una cuenta registrada?</span>
            <Link
              href="/login"
              className="font-bold text-emerald-700 hover:text-emerald-800 hover:underline"
            >
              Iniciar Sesión &rarr;
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
