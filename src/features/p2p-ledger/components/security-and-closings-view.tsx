"use client";

import { useState, type FormEvent } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Loader2,
  Lock,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Unlink,
  UserCheck,
  Users,
  XCircle,
} from "lucide-react";
import {
  useDailyClosingsQuery,
  useSaveBinanceVaultMutation,
  useTestBinanceMutation,
  useUnlinkBinanceVaultMutation,
} from "@/features/p2p-ledger/api/use-p2p-queries";
import {
  SaveBinanceVaultBodySchema,
  type SaveBinanceVaultInput,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import { useLedgerUiStore } from "@/features/p2p-ledger/store/use-ledger-ui-store";

interface ActionFeedback {
  readonly kind: "success" | "error" | "info";
  readonly message: string;
}

const CONNECTION_STEPS = [
  {
    step: "1",
    title: "Abre Gestión de API en Binance",
    description:
      "Inicia sesión en Binance, ve a Perfil → Gestión de API y presiona Crear API.",
  },
  {
    step: "2",
    title: "Elige API generada por el sistema",
    description:
      "Selecciona 'Generada por el sistema', asigna un nombre (ej. Bot P2P) y confirma tu 2FA.",
  },
  {
    step: "3",
    title: "Deja solo Habilitar lectura",
    description:
      "Verifica que únicamente esté marcado Habilitar lectura. Nunca actives retiros ni trading.",
  },
  {
    step: "4",
    title: "Pega tus claves y prueba",
    description:
      "Ingresa API Key y Secret Key aquí, guarda y pulsa Probar Conexión para verificar.",
  },
] as const;

export function SecurityAndClosingsView() {
  const { activeRole, setActiveRole, setUnlockAccountantModalOpen } =
    useLedgerUiStore();

  const { data: closingsData, isLoading: isVaultLoading } =
    useDailyClosingsQuery();
  const saveVaultMutation = useSaveBinanceVaultMutation();
  const unlinkVaultMutation = useUnlinkBinanceVaultMutation();
  const testBinanceMutation = useTestBinanceMutation();

  const vaultStatus = closingsData?.vaultStatus;
  const isConfigured = Boolean(vaultStatus?.isConfigured);
  const isAccountantMode = activeRole === "AUDITOR_SENIAT";

  const [formToggleOverride, setFormToggleOverride] = useState<boolean | null>(
    null,
  );
  const [confirmUnlinkOpen, setConfirmUnlinkOpen] = useState(false);

  const [label, setLabel] = useState("Binance P2P Principal");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showApiSecret, setShowApiSecret] = useState(false);
  const [confirmReadOnly, setConfirmReadOnly] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ActionFeedback | null>(null);

  const isFormOpen =
    !isAccountantMode &&
    (formToggleOverride ?? (!isVaultLoading && !isConfigured));

  const isBusy =
    saveVaultMutation.isPending ||
    unlinkVaultMutation.isPending ||
    testBinanceMutation.isPending;

  async function handleSaveVault(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFeedback(null);

    const candidate: Record<string, unknown> = {
      label: label.trim() || "Binance P2P Principal",
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      confirmReadOnlyOnly: confirmReadOnly,
    };

    const parsed = SaveBinanceVaultBodySchema.safeParse(candidate);
    if (!parsed.success) {
      setFormError(
        parsed.error.issues[0]?.message ??
          "Revisa los datos ingresados antes de guardar.",
      );
      return;
    }

    const payload: SaveBinanceVaultInput = parsed.data;

    try {
      const response = await saveVaultMutation.mutateAsync(payload);
      setApiKey("");
      setApiSecret("");
      setShowApiSecret(false);
      setConfirmUnlinkOpen(false);
      setFormToggleOverride(false);
      setFeedback({
        kind: "success",
        message:
          response.message ||
          "Cuenta Binance vinculada y cifrada correctamente con AES-256-GCM.",
      });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar la conexión con Binance.",
      );
    }
  }

  async function handleTestConnection() {
    setFormError(null);
    setFeedback(null);

    try {
      const response = await testBinanceMutation.mutateAsync();
      if (response.data.success) {
        setFeedback({
          kind: "success",
          message: response.data.message || response.message,
        });
      } else {
        setFeedback({
          kind: "error",
          message:
            response.data.message ||
            "Binance no respondió con éxito. Verifica tus claves y permisos de lectura.",
        });
      }
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "Error probando la conexión con Binance.",
      });
    }
  }

  async function handleConfirmUnlink() {
    setFormError(null);
    setFeedback(null);

    try {
      const response = await unlinkVaultMutation.mutateAsync();
      setConfirmUnlinkOpen(false);
      setApiKey("");
      setApiSecret("");
      setLabel("Binance P2P Principal");
      setShowApiSecret(false);
      setFormToggleOverride(true);
      setFeedback({
        kind: "info",
        message:
          response.message ||
          "Cuenta Binance desvinculada. Ya puedes ingresar las claves de otra cuenta.",
      });
    } catch (error) {
      setFeedback({
        kind: "error",
        message:
          error instanceof Error
            ? error.message
            : "No se pudo desvincular la cuenta de Binance.",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Columna izquierda: Conexión con Binance + Personas con Acceso */}
        <div className="space-y-6 lg:col-span-7">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#2B3139] dark:bg-[#181A20] sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-[#0ECB81]">
                    <KeyRound className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-[#EAECEF]">
                      Conexión con tu Binance
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-[#848E9C]">
                      Sincronización automática de órdenes P2P con llaves de
                      Solo Lectura
                    </p>
                  </div>
                </div>
              </div>

              {isVaultLoading ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#848E9C]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Verificando...
                </span>
              ) : isConfigured ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 dark:border-[#0ECB81]/30 dark:bg-[#0ECB81]/10 dark:text-[#0ECB81]">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Conectado y Seguro
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700 dark:border-[#FCD535]/30 dark:bg-[#FCD535]/10 dark:text-[#FCD535]">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Sin cuenta vinculada
                </span>
              )}
            </div>

            {isAccountantMode ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-[#FCD535]/25 dark:bg-[#1E2329]">
                <div className="flex items-start gap-3">
                  <Lock className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-600 dark:text-[#FCD535]" />
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-[#EAECEF]">
                      Acceso restringido en Modo Contador
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-[#848E9C]">
                      Por seguridad Zero-Trust, el perfil de Contador no puede
                      visualizar, editar ni desvincular claves API de Binance.
                      Cambia a Dueño Principal para gestionar la conexión.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Estado de la cuenta actual */}
                <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-[#2B3139] dark:bg-[#1E2329]">
                  {isVaultLoading ? (
                    <div className="space-y-2.5 animate-pulse">
                      <div className="h-4 w-44 rounded bg-slate-200 dark:bg-[#2B3139]" />
                      <div className="h-3.5 w-64 rounded bg-slate-200 dark:bg-[#2B3139]" />
                    </div>
                  ) : isConfigured && vaultStatus ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase dark:text-[#848E9C]">
                            Cuenta Vinculada
                          </p>
                          <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-[#EAECEF]">
                            {vaultStatus.label || "Binance P2P Principal"}
                          </p>
                          <p className="mt-1 font-mono text-xs text-slate-500 dark:text-[#848E9C]">
                            API Key: {vaultStatus.apiKeyMasked}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={handleTestConnection}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60 dark:border-[#0ECB81]/30 dark:bg-[#0ECB81]/15 dark:text-[#0ECB81] dark:hover:bg-[#0ECB81]/25"
                          >
                            {testBinanceMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <PlugZap className="h-3.5 w-3.5" />
                            )}
                            Probar Conexión
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setConfirmUnlinkOpen(false);
                              setFormToggleOverride((prev) =>
                                prev === null ? !isFormOpen : !prev,
                              );
                            }}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60 dark:border-[#2B3139] dark:bg-[#181A20] dark:text-[#EAECEF] dark:hover:bg-[#2B3139]"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            {isFormOpen ? "Ocultar Formulario" : "Cambiar Claves"}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setFeedback(null);
                              setFormError(null);
                              setConfirmUnlinkOpen((prev) => !prev);
                            }}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60 dark:border-[#F6465D]/35 dark:bg-[#F6465D]/12 dark:text-[#F6465D] dark:hover:bg-[#F6465D]/20"
                          >
                            <Unlink className="h-3.5 w-3.5" />
                            Desvincular cuenta
                          </button>
                        </div>
                      </div>

                      {/* Permisos verificados */}
                      <div className="grid grid-cols-1 gap-2 border-t border-slate-200/80 pt-3 dark:border-[#2B3139] sm:grid-cols-3">
                        <div className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-xs dark:bg-[#181A20]">
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-[#0ECB81]" />
                          <span className="font-medium text-slate-700 dark:text-[#EAECEF]">
                            Leer Órdenes P2P
                          </span>
                        </div>
                        <div className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-xs dark:bg-[#181A20]">
                          <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-500 dark:text-[#F6465D]" />
                          <span className="font-medium text-slate-500 dark:text-[#848E9C]">
                            Retiros Bloqueados
                          </span>
                        </div>
                        <div className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-xs dark:bg-[#181A20]">
                          <XCircle className="h-3.5 w-3.5 shrink-0 text-rose-500 dark:text-[#F6465D]" />
                          <span className="font-medium text-slate-500 dark:text-[#848E9C]">
                            Trading Bloqueado
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-[#EAECEF]">
                          Ninguna cuenta de Binance conectada
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-[#848E9C]">
                          Vincula tu API Key de Solo Lectura abajo para activar
                          la sincronización automática P2P.
                        </p>
                      </div>
                      {!isFormOpen && (
                        <button
                          type="button"
                          onClick={() => setFormToggleOverride(true)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#FCD535] px-3.5 py-2 text-xs font-bold text-[#0B0E11] transition hover:brightness-95"
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                          Vincular Cuenta
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Confirmación segura para desvincular cuenta */}
                {confirmUnlinkOpen && isConfigured && (
                  <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/90 p-4 dark:border-[#F6465D]/40 dark:bg-[#F6465D]/10">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-rose-600 dark:text-[#F6465D]" />
                      <div className="flex-1">
                        <p className="text-xs font-bold text-rose-900 dark:text-[#EAECEF]">
                          ¿Desvincular{" "}
                          {vaultStatus?.label ?? "esta cuenta de Binance"}?
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-rose-700 dark:text-[#EAECEF]/80">
                          Se eliminarán las credenciales guardadas y las órdenes
                          en vivo sincronizadas de esta cuenta para evitar
                          mezclas al vincular otra. Tus cierres de jornada y
                          reportes guardados permanecerán intactos.
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={handleConfirmUnlink}
                            disabled={unlinkVaultMutation.isPending}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-60 dark:bg-[#F6465D] dark:hover:bg-[#e03a50]"
                          >
                            {unlinkVaultMutation.isPending ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Unlink className="h-3.5 w-3.5" />
                            )}
                            Confirmar desvinculación
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmUnlinkOpen(false)}
                            disabled={unlinkVaultMutation.isPending}
                            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#EAECEF] dark:hover:bg-[#2B3139]"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Mensajes de estado (prueba de conexión / guardado / desvinculado) */}
                {feedback && (
                  <div
                    className={`mt-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs font-medium ${
                      feedback.kind === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-[#0ECB81]/35 dark:bg-[#0ECB81]/10 dark:text-[#0ECB81]"
                        : feedback.kind === "error"
                          ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-[#F6465D]/35 dark:bg-[#F6465D]/10 dark:text-[#F6465D]"
                          : "border-amber-200 bg-amber-50 text-amber-800 dark:border-[#FCD535]/35 dark:bg-[#FCD535]/10 dark:text-[#FCD535]"
                    }`}
                  >
                    {feedback.kind === "success" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : feedback.kind === "error" ? (
                      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <span>{feedback.message}</span>
                  </div>
                )}

                {/* Formulario para vincular o actualizar claves */}
                {isFormOpen && (
                  <form
                    onSubmit={handleSaveVault}
                    className="mt-5 space-y-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-[#2B3139] dark:bg-[#1E2329]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xs font-bold tracking-wide text-slate-800 uppercase dark:text-[#EAECEF]">
                        {isConfigured
                          ? "Actualizar Claves API de Binance"
                          : "Vincular Nueva Cuenta Binance"}
                      </h3>
                      {isConfigured && (
                        <button
                          type="button"
                          onClick={() => setFormToggleOverride(false)}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-700 dark:text-[#848E9C] dark:hover:text-[#EAECEF]"
                        >
                          Cerrar
                        </button>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor="binance-vault-label"
                        className="block text-[11px] font-semibold text-slate-600 dark:text-[#848E9C]"
                      >
                        Nombre identificador de la cuenta
                      </label>
                      <input
                        id="binance-vault-label"
                        type="text"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="Ej. Binance P2P Principal"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-[#2B3139] dark:bg-[#0B0E11] dark:text-[#EAECEF] dark:placeholder-[#848E9C]/60 dark:focus:border-[#FCD535]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="binance-api-key"
                        className="block text-[11px] font-semibold text-slate-600 dark:text-[#848E9C]"
                      >
                        Binance API Key (Solo Lectura)
                      </label>
                      <input
                        id="binance-api-key"
                        type="text"
                        autoComplete="off"
                        spellCheck={false}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Pega aquí tu API Key alfanumérica (32-128 caracteres)"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-[#2B3139] dark:bg-[#0B0E11] dark:text-[#EAECEF] dark:placeholder-[#848E9C]/60 dark:focus:border-[#FCD535]"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="binance-api-secret"
                        className="block text-[11px] font-semibold text-slate-600 dark:text-[#848E9C]"
                      >
                        Binance Secret Key
                      </label>
                      <div className="relative mt-1.5">
                        <input
                          id="binance-api-secret"
                          type={showApiSecret ? "text" : "password"}
                          autoComplete="off"
                          spellCheck={false}
                          value={apiSecret}
                          onChange={(e) => setApiSecret(e.target.value)}
                          placeholder="Se cifra en servidor con AES-256-GCM y nunca vuelve al navegador"
                          className="w-full rounded-xl border border-slate-200 bg-white py-2 pr-10 pl-3 font-mono text-xs text-slate-900 focus:border-emerald-500 focus:outline-none dark:border-[#2B3139] dark:bg-[#0B0E11] dark:text-[#EAECEF] dark:placeholder-[#848E9C]/60 dark:focus:border-[#FCD535]"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiSecret((prev) => !prev)}
                          aria-label={
                            showApiSecret
                              ? "Ocultar Secret Key"
                              : "Mostrar Secret Key"
                          }
                          className="absolute inset-y-0 right-2 flex items-center px-1.5 text-slate-400 hover:text-slate-600 dark:text-[#848E9C] dark:hover:text-[#EAECEF]"
                        >
                          {showApiSecret ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 dark:border-[#2B3139] dark:bg-[#181A20] dark:text-[#EAECEF]">
                      <input
                        type="checkbox"
                        checked={confirmReadOnly}
                        onChange={(e) => setConfirmReadOnly(e.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-[#2B3139] dark:bg-[#0B0E11]"
                      />
                      <span>
                        Confirmo que esta API Key fue configurada con permiso
                        único de <strong>Habilitar lectura (Read-Only)</strong>{" "}
                        y tiene retiros y trading desactivados.
                      </span>
                    </label>

                    {formError && (
                      <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-medium text-rose-700 dark:border-[#F6465D]/35 dark:bg-[#F6465D]/10 dark:text-[#F6465D]">
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{formError}</span>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      <button
                        type="submit"
                        disabled={saveVaultMutation.isPending}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60 dark:bg-[#FCD535] dark:text-[#0B0E11] dark:hover:brightness-95"
                      >
                        {saveVaultMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="h-3.5 w-3.5" />
                        )}
                        Guardar y Vincular Cuenta
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </section>

          {/* Personas con Acceso (Modo Dueño vs Modo Contador) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#2B3139] dark:bg-[#181A20] sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-[#1E2329] dark:text-[#FCD535]">
                  <Users className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-[#EAECEF]">
                    Personas con Acceso
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-[#848E9C]">
                    Cambia entre vista administrativa completa y modo contador
                    de solo lectura
                  </p>
                </div>
              </div>

              {isAccountantMode ? (
                <button
                  type="button"
                  onClick={() => setUnlockAccountantModalOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-slate-800 dark:bg-[#FCD535] dark:text-[#0B0E11] dark:hover:brightness-95"
                >
                  <Lock className="h-3.5 w-3.5" />
                  Desbloquear Modo Dueño
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setActiveRole("AUDITOR_SENIAT")}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-[#2B3139] dark:bg-[#1E2329] dark:text-[#EAECEF] dark:hover:bg-[#2B3139]"
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  Activar Modo Contador
                </button>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div
                className={`rounded-xl border p-3.5 transition ${
                  !isAccountantMode
                    ? "border-emerald-300 bg-emerald-50/60 dark:border-[#0ECB81]/40 dark:bg-[#0ECB81]/10"
                    : "border-slate-200 bg-slate-50/70 dark:border-[#2B3139] dark:bg-[#1E2329]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-[#EAECEF]">
                    Dueño Principal
                  </span>
                  {!isAccountantMode && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-[#0ECB81]/20 dark:text-[#0ECB81]">
                      Activo
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-[#848E9C]">
                  Acceso total a conexión Binance, jornadas, libro operativo y
                  exportación de cierres.
                </p>
              </div>

              <div
                className={`rounded-xl border p-3.5 transition ${
                  isAccountantMode
                    ? "border-amber-300 bg-amber-50/60 dark:border-[#FCD535]/40 dark:bg-[#FCD535]/10"
                    : "border-slate-200 bg-slate-50/70 dark:border-[#2B3139] dark:bg-[#1E2329]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 dark:text-[#EAECEF]">
                    Contador SENIAT
                  </span>
                  {isAccountantMode && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-[#FCD535]/20 dark:text-[#FCD535]">
                      Activo
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-[#848E9C]">
                  Solo lectura fiscal de la provisión SENIAT y libro mensual en
                  Excel. Sin acceso a claves API de Binance.
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Columna derecha: Instructivo resumido y claro */}
        <aside className="lg:col-span-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-[#2B3139] dark:bg-[#181A20] sm:p-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-[#FCD535]/15 dark:text-[#FCD535]">
                <BookOpen className="h-4.5 w-4.5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-[#EAECEF]">
                  ¿Cómo conectar tu API de Binance?
                </h3>
                <p className="text-xs text-slate-500 dark:text-[#848E9C]">
                  Guía rápida en 4 pasos (solo lectura)
                </p>
              </div>
            </div>

            <ol className="mt-5 space-y-3">
              {CONNECTION_STEPS.map((item) => (
                <li
                  key={item.step}
                  className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-[#2B3139] dark:bg-[#1E2329]"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-extrabold text-white dark:bg-[#FCD535] dark:text-[#0B0E11]">
                    {item.step}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-slate-900 dark:text-[#EAECEF]">
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-[#848E9C]">
                      {item.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <div className="mt-4 rounded-xl border border-emerald-200/80 bg-emerald-50/70 p-3.5 dark:border-[#0ECB81]/25 dark:bg-[#0ECB81]/10">
              <p className="text-xs font-bold text-emerald-900 dark:text-[#0ECB81]">
                ¿Vas a cambiar de cuenta Binance?
              </p>
              <p className="mt-1 text-xs leading-relaxed text-emerald-800 dark:text-[#EAECEF]/85">
                Usa <strong>Desvincular cuenta</strong> antes de ingresar nuevas
                claves. Así limpias las órdenes en vivo de la cuenta anterior
                sin perder tus cierres diarios ni reportes mensuales.
              </p>
            </div>
          </section>
        </aside>
      </div>

      {/* Pie de seguridad criptográfica */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-xs text-slate-600 dark:border-[#2B3139] dark:bg-[#181A20] dark:text-[#848E9C]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-[#0ECB81]" />
          <span>
            Credenciales cifradas en servidor con{" "}
            <strong className="text-slate-900 dark:text-[#EAECEF]">
              AES-256-GCM
            </strong>{" "}
            y firmas HMAC-SHA256 por solicitud.
          </span>
        </div>
        <span className="font-mono text-[11px] text-slate-400 dark:text-[#848E9C]">
          Zero-Trust · Read-Only API
        </span>
      </div>
    </div>
  );
}
