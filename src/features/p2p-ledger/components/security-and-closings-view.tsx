"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ShieldCheck,
  KeyRound,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Ban,
  Users,
  CalendarCheck,
  Download,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Eye,
  UserCheck,
} from "lucide-react";
import {
  useDailyClosingsQuery,
  useSaveBinanceVaultMutation,
  useTestBinanceMutation,
} from "@/features/p2p-ledger/api/use-p2p-queries";
import {
  SaveBinanceVaultBodySchema,
  type SaveBinanceVaultInput,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import { useLedgerUiStore } from "@/features/p2p-ledger/store/use-ledger-ui-store";
import { cn } from "@/lib/utils";

export function SecurityAndClosingsView() {
  const { activeRole, setActiveRole, setUnlockAccountantModalOpen } =
    useLedgerUiStore();
  const closingsQuery = useDailyClosingsQuery();
  const saveVaultMutation = useSaveBinanceVaultMutation();

  const [showUpdateForm, setShowUpdateForm] = React.useState(false);
  const testMutation = useTestBinanceMutation();
  const [testResult, setTestResult] = React.useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [expandedClosingId, setExpandedClosingId] = React.useState<
    string | null
  >(null);

  const form = useForm<SaveBinanceVaultInput>({
    resolver: zodResolver(SaveBinanceVaultBodySchema),
    defaultValues: {
      label: "Binance P2P Principal",
      apiKey: "",
      apiSecret: "",
      confirmReadOnlyOnly: true,
    },
  });

  const onSubmitVault = (values: SaveBinanceVaultInput) => {
    saveVaultMutation.mutate(values, {
      onSuccess: () => {
        setShowUpdateForm(false);
        form.reset();
        setTestResult(null);
      },
    });
  };

  const handleTestConnection = () => {
    setTestResult(null);
    testMutation.mutate(undefined, {
      onSuccess: (res) => {
        setTestResult({
          success: true,
          message: res.message,
        });
      },
      onError: (err) => {
        setTestResult({
          success: false,
          message: err.message,
        });
      },
    });
  };

  const closingsData = closingsQuery.data;

  return (
    <div className="flex w-full flex-col gap-6">
      {/* Grid Principal: Columna Izquierda (Conexión Binance + Accesos) | Columna Derecha (Cierres Diarios) */}
      <div className="flex w-full flex-col gap-6 xl:flex-row xl:items-stretch">
        {/* COLUMNA IZQUIERDA (620px en Desktop) */}
        <div className="flex w-full flex-col gap-6 xl:w-[620px] xl:shrink-0">
          {/* TARJETA 1: Conexión con tu Cuenta de Binance */}
          <div className="flex flex-col gap-5 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/20">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-extrabold tracking-tight text-slate-900">
                    Conexión con tu Binance
                  </h2>
                  <p className="text-xs font-medium text-slate-500">
                    El bot solo lee tus órdenes para sacar cuentas. Tu dinero
                    nunca se toca.
                  </p>
                </div>
              </div>

              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Conectado y Seguro
              </span>
            </div>

            {activeRole === "AUDITOR_SENIAT" ? (
              <div className="flex items-start gap-3.5 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <Lock className="h-5 w-5" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-extrabold text-amber-950">
                    Estás viendo la pantalla como Contador
                  </span>
                  <span className="text-xs leading-relaxed text-amber-800">
                    Por seguridad, tu contador no puede ver ni cambiar tus
                    claves de Binance. Solo tiene permiso para descargar los
                    cierres diarios de la derecha.
                  </span>
                </div>
              </div>
            ) : (
              <>
                {/* Estado de la Clave Conectada */}
                <div className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-bold text-slate-500">
                        Tu Clave de Lectura (API Key)
                      </span>
                      <span className="text-sm font-extrabold tracking-tight text-slate-900">
                        {saveVaultMutation.data?.data.apiKeyMasked ??
                          closingsData?.vaultStatus?.apiKeyMasked ??
                          "Sin llave API conectada"}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleTestConnection}
                      disabled={testMutation.isPending}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-all cursor-pointer",
                        testResult?.success
                          ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                          : testResult?.success === false
                          ? "border-rose-300 bg-rose-50 text-rose-800"
                          : "border-slate-200 bg-white text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"
                      )}
                    >
                      <RefreshCw
                        className={cn(
                          "h-3.5 w-3.5",
                          testResult?.success ? "text-emerald-600" : testResult?.success === false ? "text-rose-600" : "text-emerald-600",
                          testMutation.isPending && "animate-spin"
                        )}
                      />
                      <span>
                        {testMutation.isPending
                          ? "Comprobando en Binance..."
                          : testResult?.success
                          ? "¡Conexión Perfecta!"
                          : "Probar Conexión Real"}
                      </span>
                    </button>
                  </div>

                  {testResult && (
                    <div
                      className={cn(
                        "rounded-lg p-2.5 text-xs font-semibold leading-relaxed border",
                        testResult.success
                          ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                          : "bg-rose-50 border-rose-200 text-rose-900"
                      )}
                    >
                      {testResult.message}
                    </div>
                  )}

                  <div className="flex items-center justify-between border-t border-slate-200/70 pt-2.5 text-xs">
                    <span className="font-medium text-slate-500">
                      Clave Secreta:
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700">
                      <ShieldCheck className="h-4 w-4 text-emerald-600" />
                      Protegida bajo llave y oculta para siempre
                    </span>
                  </div>
                </div>

                {/* Semáforo Visual: Qué puede y qué NO puede hacer el bot */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-extrabold text-slate-700">
                    Permisos de seguridad de esta conexión:
                  </span>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {/* Permitido */}
                    <div className="flex flex-col gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3.5">
                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        <span>Permitido</span>
                      </div>
                      <span className="text-sm font-extrabold text-slate-900">
                        Leer Órdenes P2P
                      </span>
                      <span className="text-[11px] font-medium text-slate-600">
                        Solo mira tus compras y ventas para sumar ganancias.
                      </span>
                    </div>

                    {/* Bloqueado 1 */}
                    <div className="flex flex-col gap-1.5 rounded-xl border border-rose-200 bg-rose-50/50 p-3.5">
                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-rose-700">
                        <Ban className="h-4 w-4 shrink-0 text-rose-600" />
                        <span>Bloqueado</span>
                      </div>
                      <span className="text-sm font-extrabold text-slate-900">
                        Retirar Dinero
                      </span>
                      <span className="text-[11px] font-medium text-slate-600">
                        Es imposible sacar o mover tus USDT de Binance.
                      </span>
                    </div>

                    {/* Bloqueado 2 */}
                    <div className="flex flex-col gap-1.5 rounded-xl border border-rose-200 bg-rose-50/50 p-3.5">
                      <div className="flex items-center gap-1.5 text-xs font-extrabold text-rose-700">
                        <Ban className="h-4 w-4 shrink-0 text-rose-600" />
                        <span>Bloqueado</span>
                      </div>
                      <span className="text-sm font-extrabold text-slate-900">
                        Hacer Trading
                      </span>
                      <span className="text-[11px] font-medium text-slate-600">
                        No puede abrir órdenes ni tocar tu billetera.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Botón o Formulario para cambiar las claves */}
                <div>
                  {!showUpdateForm ? (
                    <button
                      type="button"
                      onClick={() => setShowUpdateForm(true)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-700 transition-all hover:border-emerald-300 hover:bg-emerald-50/60 hover:text-slate-900"
                    >
                      <KeyRound className="h-4 w-4 text-emerald-600" />
                      <span>Cambiar mis claves de Binance</span>
                    </button>
                  ) : (
                    <form
                      onSubmit={form.handleSubmit(onSubmitVault)}
                      className="flex flex-col gap-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/30 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-extrabold text-slate-900">
                          Conectar nuevas claves de Binance
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowUpdateForm(false)}
                          className="text-xs font-bold text-slate-500 hover:text-slate-800"
                        >
                          Cancelar
                        </button>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-700">
                          1. Pega tu API Key de Binance
                        </label>
                        <input
                          {...form.register("apiKey")}
                          placeholder="Ejemplo: vmPUZE6mv9SD5VNHk4HlWFsOr6aKE2zv..."
                          autoComplete="off"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-emerald-500 focus:outline-none"
                        />
                        {form.formState.errors.apiKey && (
                          <span className="text-xs font-bold text-rose-600">
                            {form.formState.errors.apiKey.message}
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-bold text-slate-700">
                          2. Pega tu Secret Key
                        </label>
                        <input
                          type="password"
                          {...form.register("apiSecret")}
                          placeholder="••••••••••••••••••••••••••••••••"
                          autoComplete="off"
                          className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-900 focus:border-emerald-500 focus:outline-none"
                        />
                        {form.formState.errors.apiSecret && (
                          <span className="text-xs font-bold text-rose-600">
                            {form.formState.errors.apiSecret.message}
                          </span>
                        )}
                      </div>

                      {saveVaultMutation.isError && (
                        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>{saveVaultMutation.error.message}</span>
                        </div>
                      )}

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="submit"
                          disabled={saveVaultMutation.isPending}
                          className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-500 disabled:opacity-60"
                        >
                          {saveVaultMutation.isPending
                            ? "Guardando de forma segura..."
                            : "Guardar Nuevas Claves"}
                        </button>
                      </div>
                    </form>
                  )}

                  {saveVaultMutation.isSuccess && !showUpdateForm && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-800">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                      <span>
                        ¡Claves actualizadas con éxito! (
                        {saveVaultMutation.data.data.apiKeyMasked})
                      </span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* TARJETA 2: Quién Puede Entrar al Sistema (Tú vs Tu Contador) */}
          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-600">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-extrabold text-slate-900">
                    Personas con Acceso
                  </h2>
                  <p className="text-xs font-medium text-slate-500">
                    Tú ves todo el negocio; tu contador solo descarga los
                    reportes
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (activeRole === "OPERATOR") {
                    setUnlockAccountantModalOpen(true);
                  } else {
                    setActiveRole("OPERATOR");
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-slate-800"
              >
                <Lock className="h-3.5 w-3.5 text-emerald-400" />
                <span>
                  {activeRole === "OPERATOR"
                    ? "Activar Modo Contador (Con Contraseña)"
                    : "Volver a mi vista de Dueño"}
                </span>
              </button>
            </div>

            <div className="flex flex-col gap-3">
              {/* Perfil 1: Dueño */}
              <div
                className={cn(
                  "flex items-center justify-between rounded-xl border p-3.5 transition-all",
                  activeRole === "OPERATOR"
                    ? "border-emerald-300 bg-emerald-50/40 ring-1 ring-emerald-400"
                    : "border-slate-200 bg-slate-50/60"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-xs font-extrabold text-white">
                    TÚ
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-extrabold text-slate-900">
                      {closingsData?.userName
                        ? `${closingsData.userName} (Dueño Principal)`
                        : "Dueño Principal"}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      Control total de ganancias, bancos y claves de Binance
                    </span>
                  </div>
                </div>
                <span className="rounded-full border border-emerald-200 bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">
                  Dueño
                </span>
              </div>

              {/* Perfil 2: Contador */}
              <div
                className={cn(
                  "flex items-center justify-between rounded-xl border p-3.5 transition-all",
                  activeRole === "AUDITOR_SENIAT"
                    ? "border-amber-300 bg-amber-50/50 ring-1 ring-amber-400"
                    : "border-slate-200 bg-slate-50/60"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-xs font-extrabold text-white">
                    CT
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-extrabold text-slate-900">
                      Contador
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      Solo puede ver cierres diarios y descargar el Excel del
                      16%
                    </span>
                  </div>
                </div>
                <span className="rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-900">
                  Solo Reportes
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* COLUMNA DERECHA: Cierres Diarios Automáticos (11:59 PM) */}
        <div className="flex flex-1 flex-col justify-between gap-5 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="flex flex-col gap-5">
            {/* Cabecera Cierres */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-600">
                  <CalendarCheck className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-xl font-extrabold tracking-tight text-slate-900">
                      Cierres Diarios Guardados
                    </h2>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-extrabold text-amber-800">
                      Automático 11:59 PM
                    </span>
                  </div>
                  <p className="text-xs font-medium text-slate-500">
                    Cada medianoche guardamos el resumen exacto de tus ganancias
                    y del IVA del día
                  </p>
                </div>
              </div>

              <a
                href="/api/p2p/export-csv"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-emerald-600/20 transition-all hover:from-emerald-500 hover:to-teal-500"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Descargar Mes en Excel</span>
              </a>
            </div>

            {/* Tarjetas de Resumen Acumulado del Mes */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col justify-between gap-1 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4">
                <span className="text-xs font-bold text-emerald-900">
                  Tu Ganancia Libre del Mes
                </span>
                <span className="text-2xl font-extrabold tracking-tight text-emerald-700">
                  +${closingsData?.monthNetFreeUsdt ?? "0.00"}
                </span>
                <span className="text-xs font-bold text-emerald-800">
                  {closingsData?.monthNetFreeVes ?? "0.00"} Bs. libres para ti
                </span>
              </div>

              <div className="flex flex-col justify-between gap-1 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                <span className="text-xs font-bold text-amber-900">
                  Apartado IVA 16% del Mes
                </span>
                <span className="text-2xl font-extrabold tracking-tight text-amber-700">
                  -${closingsData?.monthSeniatTax16Usdt ?? "0.00"}
                </span>
                <span className="text-xs font-bold text-amber-800">
                  {closingsData?.monthSeniatTax16Ves ?? "0.00"} Bs. para
                  declarar
                </span>
              </div>

              <div className="flex flex-col justify-between gap-1 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <span className="text-xs font-bold text-slate-600">
                  Ganancia Total (Antes de IVA)
                </span>
                <span className="text-2xl font-extrabold tracking-tight text-slate-900">
                  +${closingsData?.monthGrossUsdt ?? "0.00"}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  {closingsData?.monthGrossVes ?? "0.00"} Bs. en total
                </span>
              </div>
            </div>

            {/* Lista Interactiva de Cierres por Día */}
            <div className="flex flex-col gap-3">
              <span className="text-xs font-extrabold text-slate-600">
                Historial de cierres por día (Haz clic en un día para ver más
                detalles):
              </span>

              {(closingsData?.closings ?? []).length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 py-8 text-center">
                  <span className="text-sm font-bold text-slate-700">
                    Aún no hay cierres diarios generados
                  </span>
                  <span className="max-w-sm text-xs font-medium text-slate-500">
                    Tu primer cierre automático se guardará hoy a las 11:59 PM
                    (Hora de Venezuela) una vez conectes tus operaciones.
                  </span>
                </div>
              ) : null}

              {(closingsData?.closings ?? []).map((closing) => {
                const isExpanded = expandedClosingId === closing.id;
                return (
                  <div
                    key={closing.id}
                    className={cn(
                      "overflow-hidden rounded-xl border transition-all duration-150",
                      isExpanded
                        ? "border-emerald-400 bg-white shadow-md"
                        : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/20"
                    )}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setExpandedClosingId(isExpanded ? null : closing.id)
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedClosingId(isExpanded ? null : closing.id);
                        }
                      }}
                      className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3.5"
                    >
                      {/* Fecha */}
                      <div className="flex w-[140px] shrink-0 flex-col gap-0.5">
                        <span className="text-sm font-extrabold text-slate-900">
                          {closing.closingDateLabel}
                        </span>
                        <span className="text-xs font-semibold text-emerald-700">
                          Guardado 11:59 PM
                        </span>
                      </div>

                      {/* Órdenes */}
                      <div className="flex w-[125px] shrink-0 flex-col gap-0.5">
                        <span className="text-xs font-extrabold text-slate-800">
                          {closing.reconciledOrders} ventas hechas
                        </span>
                        <span className="text-xs font-medium text-slate-500">
                          Movido: ${closing.totalVolumeUsdt}
                        </span>
                      </div>

                      {/* Apartado IVA */}
                      <div className="flex w-[135px] shrink-0 flex-col gap-0.5">
                        <span className="text-xs font-extrabold text-amber-700">
                          IVA: -${closing.seniatTax16Usdt}
                        </span>
                        <span className="text-xs font-medium text-amber-800">
                          -{closing.seniatTax16Ves} Bs (16%)
                        </span>
                      </div>

                      {/* Ganancia Libre */}
                      <div className="flex w-[150px] shrink-0 flex-col items-end gap-0.5">
                        <span className="text-base font-extrabold text-emerald-600">
                          +${closing.netFreeProfitUsdt} libres
                        </span>
                        <span className="text-xs font-bold text-slate-700">
                          +{closing.netFreeProfitVes} Bs.
                        </span>
                      </div>

                      {/* Botón Descargar + Flecha */}
                      <div className="flex items-center gap-2">
                        <a
                          href="/api/p2p/export-csv"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
                        >
                          <Download className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Excel</span>
                        </a>
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-emerald-50/30 px-4 py-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2 text-emerald-900 font-bold">
                            <Sparkles className="h-4 w-4 text-emerald-600" />
                            <span>
                              Resumen del {closing.closingDateLabel}: Hiciste{" "}
                              {closing.reconciledOrders} operaciones y te
                              quedaron +{closing.netFreeProfitVes} Bs. libres
                              después de apartar el 16%.
                            </span>
                          </div>
                          <span className="rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                            Respaldo verificado ✓
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Nota Inferior de Respaldo */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/50 px-4 py-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-bold text-emerald-950">
                Todos tus cierres quedan guardados automáticamente y listos para
                tu contador
              </span>
            </div>
            <span className="rounded-md bg-emerald-100 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-800">
              100% Al Día
            </span>
          </div>
        </div>
      </div>

      {/* Barra Inferior Amigable de Seguridad */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-slate-900 px-6 py-4 text-white shadow-md">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1 text-xs font-extrabold text-emerald-300">
            <UserCheck className="h-3.5 w-3.5" />
            Seguridad Activa
          </span>
          <span className="text-xs font-medium text-slate-300">
            Último cierre automático guardado a las 11:59 PM &bull; Tu cuenta
            está protegida con Google Authenticator
          </span>
        </div>
        <span className="text-xs font-extrabold text-emerald-400">
          ✓ Todo funcionando sin problemas
        </span>
      </div>
    </div>
  );
}
