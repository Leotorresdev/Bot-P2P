"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BarChart2,
  BellRing,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileSpreadsheet,
  Headphones,
  History,
  Layers,
  Lock,
  MessageCircle,
  Phone,
  PieChart,
  PlayCircle,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { FinanceLogo } from "@/components/ui/finance-logo";
import {
  BASE_PLAN,
  BOT_SKILLS,
  calculatePlanPricingBreakdown,
  formatShortUsd,
  type BotSkillIconKey,
  type PlanFeatureIconKey,
} from "@/features/p2p-ledger/config/plans-and-skills";
import { cn } from "@/lib/utils";

const FEATURE_ICONS: Record<
  PlanFeatureIconKey,
  React.ComponentType<{ className?: string }>
> = {
  charts: BarChart2,
  spreads: Building2,
  results: PieChart,
  history: History,
  accountant: ShieldCheck,
  excel: FileSpreadsheet,
};

const SKILL_ICONS: Record<
  BotSkillIconKey,
  React.ComponentType<{ className?: string }>
> = {
  alerts: BellRing,
  team: Users,
  reconcile: Wallet,
};

const SUPPORT_WHATSAPP_NUMBER_DISPLAY = "0424-7807851";
const SUPPORT_WHATSAPP_E164 = "584247807851";

function buildWhatsAppUrl(message: string): string {
  return `https://wa.me/${SUPPORT_WHATSAPP_E164}?text=${encodeURIComponent(message)}`;
}

export function PlansShowcaseScreen() {
  const [selectedSkillIds, setSelectedSkillIds] = React.useState<string[]>([]);
  const [showActivationPanel, setShowActivationPanel] = React.useState(false);
  const [copiedSummary, setCopiedSummary] = React.useState(false);

  const hasPublishedSkills = BOT_SKILLS.length > 0;

  const selectedSkills = React.useMemo(
    () => BOT_SKILLS.filter((skill) => selectedSkillIds.includes(skill.id)),
    [selectedSkillIds]
  );

  const pricing = React.useMemo(
    () =>
      calculatePlanPricingBreakdown(BASE_PLAN.monthlyPriceUsd, selectedSkills),
    [selectedSkills]
  );

  const toggleSkill = (skillId: string) => {
    setSelectedSkillIds((prev) =>
      prev.includes(skillId)
        ? prev.filter((id) => id !== skillId)
        : [...prev, skillId]
    );
  };

  const handleResetSkills = () => {
    setSelectedSkillIds([]);
  };

  const buildCopyText = () => {
    const lines = [
      `Bot P2P Venezuela — Resumen de Plan Mensual`,
      `• ${BASE_PLAN.name}: $${pricing.baseUsd} USD / mes`,
    ];
    if (!hasPublishedSkills) {
      lines.push(`• Skills adicionales: En desarrollo (solo Plan Básico activo)`);
    } else if (selectedSkills.length > 0) {
      for (const skill of selectedSkills) {
        lines.push(
          `• + Skill ${skill.name}: +$${skill.monthlyPriceUsd} USD / mes`
        );
      }
    } else {
      lines.push(`• Skills adicionales: Ninguna seleccionada`);
    }
    lines.push(`Total Mensual Estimado: $${pricing.totalUsd} USD / mes`);
    return lines.join("\n");
  };

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildCopyText());
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2500);
    } catch {
      // Ignorar si el navegador bloquea el portapapeles
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0B0E11] text-[#EAECEF] antialiased selection:bg-[#FCD535] selection:text-[#0B0E11]">
      {/* Barra Superior Binance Pro */}
      <header className="sticky top-0 z-30 border-b border-[#2B3139] bg-[#0B0E11]/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1380px] flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="flex items-center gap-3 transition-opacity hover:opacity-90"
            >
              <FinanceLogo
                size={38}
                className="h-9 w-9 rounded-xl shadow-md shadow-[#0ECB81]/15"
              />
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-display text-base font-extrabold tracking-tight text-[#EAECEF]">
                    Bot P2P
                  </span>
                  <span className="rounded-full border border-[#FCD535]/35 bg-[#FCD535]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#FCD535]">
                    Planes &amp; Skills
                  </span>
                </div>
                <span className="text-[11px] font-medium text-[#848E9C]">
                  Suite Contable, Fiscal SENIAT 16% &amp; Brechas en Vivo
                </span>
              </div>
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/demo"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#0ECB81]/45 bg-[#0ECB81]/15 px-3.5 py-2 text-xs font-extrabold text-[#0ECB81] transition-all hover:bg-[#0ECB81]/25"
            >
              <PlayCircle className="h-3.5 w-3.5" />
              <span>Demo Interactiva</span>
            </Link>
            <a
              href={buildWhatsAppUrl(
                "Hola, necesito soporte / información sobre Bot P2P Venezuela."
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-600 px-3.5 py-2 text-xs font-extrabold text-white shadow-sm transition-all hover:bg-emerald-500"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              <span>WhatsApp {SUPPORT_WHATSAPP_NUMBER_DISPLAY}</span>
            </a>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#2B3139] bg-[#1E2329] px-3.5 py-2 text-xs font-bold text-[#EAECEF] transition-all hover:border-[#FCD535]/50 hover:bg-[#2B3139]"
            >
              <ArrowLeft className="h-3.5 w-3.5 text-[#848E9C]" />
              <span>Ir al Bot</span>
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#FCD535] px-4 py-2 text-xs font-extrabold text-[#0B0E11] shadow-sm transition-all hover:bg-[#F0B90B]"
            >
              <span>Crear Cuenta</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1380px] flex-col gap-7 px-4 py-7 sm:px-6 sm:py-10">
        {/* Encabezado Editorial / Tesis del Modelo Modular */}
        <section className="flex flex-col gap-4 border-b border-[#2B3139] pb-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-2xl flex-col gap-2.5">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#0ECB81]/35 bg-[#0ECB81]/10 px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[#0ECB81]" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#0ECB81]">
                Arquitectura Modular · Plan Base + Skills
              </span>
            </div>
            <h1 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-[#EAECEF] sm:text-4xl">
              Nuestros Planes y{" "}
              <span className="text-[#FCD535]">Skills a Medida</span>
            </h1>
            <p className="text-sm leading-relaxed text-[#848E9C]">
              Comienza con todo lo que el bot ya ofrece en el{" "}
              <strong className="text-[#EAECEF]">Plan Básico por $30/mes</strong>.
              A medida que lancemos nuevas herramientas como{" "}
              <strong className="text-[#EAECEF]">Skills independientes</strong>,
              podrás sumarlas a tu cuenta pagando solo por lo que necesites.
            </p>
          </div>

          {/* Fórmula Visual de Precios */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#2B3139] bg-[#181A20] px-4 py-3 text-xs">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#848E9C]">
                Base Actual
              </span>
              <span className="font-mono text-sm font-extrabold tabular-nums text-[#EAECEF]">
                $30/mes
              </span>
            </div>
            <span className="px-1 font-mono text-base font-bold text-[#848E9C]">
              +
            </span>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#848E9C]">
                Skills Elegidas
              </span>
              <span className="font-mono text-sm font-extrabold tabular-nums text-[#FCD535]">
                {!hasPublishedSkills
                  ? "En desarrollo"
                  : selectedSkills.length > 0
                    ? `+${formatShortUsd(pricing.skillsUsd)}/mes`
                    : "+$0/mes"}
              </span>
            </div>
            <span className="px-1 font-mono text-base font-bold text-[#848E9C]">
              =
            </span>
            <div className="flex flex-col rounded-lg border border-[#FCD535]/30 bg-[#FCD535]/10 px-2.5 py-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#FCD535]">
                Tu Mensualidad
              </span>
              <span className="font-mono text-sm font-extrabold tabular-nums text-[#FCD535]">
                {formatShortUsd(pricing.totalUsd)}/mes
              </span>
            </div>
          </div>
        </section>

        {/* Grid Principal: Izquierda (Plan Básico + Skills) | Derecha (Resumen Sticky) */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* COLUMNA IZQUIERDA (7/12 - 8/12) */}
          <div className="flex flex-col gap-6 lg:col-span-7 xl:col-span-8">
            {/* TARJETA 1: PLAN BÁSICO ($30 / MES) */}
            <section
              aria-labelledby="plan-basico-heading"
              className="relative overflow-hidden rounded-2xl border border-[#FCD535]/45 bg-[#181A20] shadow-[0_20px_50px_-20px_rgba(0,0,0,0.85)]"
            >
              {/* Barra superior dorada estilo Binance */}
              <div className="h-1 w-full bg-gradient-to-r from-[#F0B90B] via-[#FCD535] to-[#0ECB81]" />

              <div className="flex flex-col gap-6 p-5 sm:p-7">
                {/* Cabecera de la Tarjeta del Plan Básico */}
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#2B3139] pb-5">
                  <div className="flex max-w-xl flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FCD535]/35 bg-[#FCD535]/10 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#FCD535]">
                        <Sparkles className="h-3 w-3" />
                        {BASE_PLAN.badgeLabel}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#0ECB81]/35 bg-[#0ECB81]/10 px-2.5 py-0.5 text-[10px] font-bold text-[#0ECB81]">
                        <CheckCircle2 className="h-3 w-3" />
                        Incluido en tu base
                      </span>
                    </div>
                    <h2
                      id="plan-basico-heading"
                      className="font-display text-2xl font-extrabold tracking-tight text-[#EAECEF]"
                    >
                      {BASE_PLAN.name}
                    </h2>
                    <p className="text-xs leading-relaxed text-[#848E9C] sm:text-sm">
                      {BASE_PLAN.subtitle}
                    </p>
                  </div>

                  {/* Precio Principal */}
                  <div className="flex flex-col items-start rounded-2xl border border-[#2B3139] bg-[#1E2329] px-5 py-3.5 sm:items-end">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#848E9C]">
                      Suscripción Base
                    </span>
                    <div className="mt-0.5 flex items-baseline gap-1.5">
                      <span className="font-mono text-4xl font-extrabold tracking-tight tabular-nums text-[#FCD535]">
                        ${BASE_PLAN.monthlyPriceUsd}
                      </span>
                      <span className="text-xs font-bold text-[#848E9C]">
                        USD / mes
                      </span>
                    </div>
                    <span className="mt-1 text-[11px] font-semibold text-[#0ECB81]">
                      Acceso completo al bot actual
                    </span>
                  </div>
                </div>

                {/* Lista de Módulos Incluidos en el Plan Básico */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-[#EAECEF]">
                      ¿Qué incluye el Plan Básico?
                    </span>
                    <span className="text-[11px] font-semibold text-[#848E9C]">
                      6 módulos operativos y fiscales activos
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {BASE_PLAN.features.map((feature) => {
                      const Icon = FEATURE_ICONS[feature.icon];
                      return (
                        <div
                          key={feature.id}
                          className="flex items-start gap-3 rounded-xl border border-[#2B3139] bg-[#1E2329]/80 p-3.5 transition-colors hover:border-[#2B3139]/80 hover:bg-[#1E2329]"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#0ECB81]/25 bg-[#0ECB81]/10 text-[#0ECB81]">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <span className="text-xs font-extrabold text-[#EAECEF]">
                                {feature.title}
                              </span>
                              <span className="rounded border border-[#2B3139] bg-[#0B0E11] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#FCD535]">
                                {feature.badge}
                              </span>
                            </div>
                            <p className="text-[11px] leading-relaxed text-[#848E9C]">
                              {feature.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Pie Técnico del Plan Básico */}
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#2B3139] bg-[#0B0E11]/70 px-4 py-2.5 text-[11px] text-[#848E9C]">
                  <span className="inline-flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-[#0ECB81]" />
                    <span>
                      Bóveda API AES-256-GCM · Solo Lectura · Verificación 2FA
                    </span>
                  </span>
                  <span className="font-mono font-bold text-[#EAECEF]">
                    Comisión 0.163% · Cierre 11:59 PM VET
                  </span>
                </div>
              </div>
            </section>

            {/* SECCIÓN 2: SKILLS MODULARES ADICIONALES */}
            <section
              aria-labelledby="skills-heading"
              className="flex flex-col gap-4 rounded-2xl border border-[#2B3139] bg-[#181A20] p-5 sm:p-7"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#2B3139] pb-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FCD535]/15 text-[#FCD535]">
                      <Layers className="h-4 w-4" />
                    </div>
                    <h2
                      id="skills-heading"
                      className="font-display text-lg font-extrabold tracking-tight text-[#EAECEF] sm:text-xl"
                    >
                      Skills Adicionales (Expansión Modular)
                    </h2>
                  </div>
                  <p className="text-xs leading-relaxed text-[#848E9C]">
                    {hasPublishedSkills ? (
                      <>
                        Cada nueva funcionalidad del bot funciona como una{" "}
                        <strong className="text-[#EAECEF]">Skill</strong>{" "}
                        opcional. Activa las que quieras probar para ver cómo su
                        precio (por ejemplo,{" "}
                        <span className="font-mono text-[#FCD535]">+$20</span>)
                        se suma automáticamente al Plan Básico de{" "}
                        <span className="font-mono text-[#EAECEF]">$30/mes</span>.
                      </>
                    ) : (
                      <>
                        Próximamente cada nueva funcionalidad del bot se
                        publicará como una{" "}
                        <strong className="text-[#EAECEF]">Skill</strong>{" "}
                        opcional con su propio precio mensual, que se sumará al{" "}
                        <span className="font-mono text-[#EAECEF]">
                          Plan Básico ($30/mes)
                        </span>
                        .
                      </>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {!hasPublishedSkills ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#FCD535]/40 bg-[#FCD535]/10 px-3 py-1 text-[11px] font-bold text-[#FCD535]">
                      <Clock className="h-3.5 w-3.5" />
                      <span>En desarrollo</span>
                    </span>
                  ) : (
                    <span
                      className={cn(
                        "rounded-full border px-3 py-1 font-mono text-[11px] font-bold tabular-nums",
                        selectedSkills.length > 0
                          ? "border-[#FCD535]/40 bg-[#FCD535]/10 text-[#FCD535]"
                          : "border-[#2B3139] bg-[#1E2329] text-[#848E9C]"
                      )}
                    >
                      {selectedSkills.length === 0
                        ? "0 skills agregadas"
                        : `${selectedSkills.length} ${selectedSkills.length === 1 ? "skill agregada" : "skills agregadas"} (+${formatShortUsd(pricing.skillsUsd)})`}
                    </span>
                  )}
                </div>
              </div>

              {/* Estado Actual: En Desarrollo o Tarjetas de Skills */}
              {!hasPublishedSkills ? (
                <div className="flex items-start gap-3.5 rounded-xl border border-dashed border-[#2B3139] bg-[#0B0E11]/70 p-5 sm:p-6">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#FCD535]/35 bg-[#FCD535]/10 text-[#FCD535]">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-sm font-extrabold text-[#EAECEF] sm:text-base">
                        Skills adicionales en desarrollo
                      </h3>
                      <span className="rounded-full border border-[#FCD535]/30 bg-[#FCD535]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#FCD535]">
                        Próximamente
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-[#848E9C]">
                      Por ahora solo contamos con el{" "}
                      <strong className="text-[#EAECEF]">
                        Plan Básico ($30/mes)
                      </strong>
                      , el cual ya incluye todas las herramientas activas del
                      bot. Aún no hay Skills publicadas; las nuevas
                      funcionalidades que desarrollemos aparecerán aquí en este
                      formato modular.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {BOT_SKILLS.map((skill) => {
                  const isSelected = selectedSkillIds.includes(skill.id);
                  const SkillIcon = SKILL_ICONS[skill.icon];

                  return (
                    <article
                      key={skill.id}
                      className={cn(
                        "flex flex-col justify-between gap-4 rounded-xl border p-4 transition-all duration-150 sm:flex-row sm:items-center",
                        isSelected
                          ? "border-[#FCD535] bg-[#1E2329] shadow-[0_0_0_1px_rgba(252,213,53,0.25)]"
                          : "border-[#2B3139] bg-[#1E2329]/60 hover:border-[#3B434E] hover:bg-[#1E2329]"
                      )}
                    >
                      <div className="flex items-start gap-3.5">
                        <div
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
                            isSelected
                              ? "border-[#FCD535]/40 bg-[#FCD535]/15 text-[#FCD535]"
                              : "border-[#2B3139] bg-[#0B0E11] text-[#848E9C]"
                          )}
                        >
                          <SkillIcon className="h-5 w-5" />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded bg-[#0B0E11] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#848E9C]">
                              {skill.code}
                            </span>
                            <h3 className="font-display text-sm font-extrabold text-[#EAECEF]">
                              {skill.name}
                            </h3>
                            <span className="rounded-full border border-[#2B3139] bg-[#0B0E11]/80 px-2 py-0.5 text-[10px] font-semibold text-[#848E9C]">
                              {skill.statusLabel}
                            </span>
                          </div>

                          <p className="text-xs leading-relaxed text-[#848E9C]">
                            {skill.description}
                          </p>

                          <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1">
                            {skill.highlights.map((item) => (
                              <span
                                key={item}
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-[#EAECEF]/85"
                              >
                                <Check className="h-3 w-3 shrink-0 text-[#0ECB81]" />
                                <span>{item}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Columna derecha de cada Skill: Precio + Botón Agregar/Quitar */}
                      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#2B3139] pt-3 sm:flex-col sm:items-end sm:border-t-0 sm:pt-0">
                        <div className="flex flex-col sm:items-end">
                          <span className="font-mono text-lg font-extrabold tabular-nums text-[#FCD535]">
                            +${skill.monthlyPriceUsd}
                            <span className="text-xs font-semibold text-[#848E9C]">
                              /mes
                            </span>
                          </span>
                          <span className="text-[10px] text-[#848E9C]">
                            Se suma al Plan Básico
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => toggleSkill(skill.id)}
                          aria-pressed={isSelected}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition-all active:scale-[0.98]",
                            isSelected
                              ? "border border-[#0ECB81]/40 bg-[#0ECB81]/15 text-[#0ECB81] hover:bg-[#0ECB81]/25"
                              : "bg-[#FCD535] text-[#0B0E11] hover:bg-[#F0B90B]"
                          )}
                        >
                          {isSelected ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Agregada</span>
                            </>
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5" />
                              <span>
                                Agregar (+${skill.monthlyPriceUsd})
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </article>
                  );
                })}
                </div>
              )}
            </section>
          </div>

          {/* COLUMNA DERECHA STICKY: CALCULADORA EN VIVO DE PLAN + SKILLS */}
          <aside className="lg:sticky lg:top-24 lg:col-span-5 xl:col-span-4">
            <div className="overflow-hidden rounded-2xl border border-[#2B3139] bg-[#181A20] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]">
              {/* Línea superior Binance */}
              <div className="h-1 w-full bg-gradient-to-r from-[#0ECB81] via-[#FCD535] to-[#F0B90B]" />

              <div className="flex flex-col gap-5 p-5 sm:p-6">
                {/* Encabezado */}
                <div className="flex items-start justify-between gap-2 border-b border-[#2B3139] pb-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#FCD535]">
                      Configurador Mensual
                    </span>
                    <h2 className="font-display text-lg font-extrabold text-[#EAECEF]">
                      Tu Plan Configurado
                    </h2>
                  </div>

                  {selectedSkills.length > 0 && (
                    <button
                      type="button"
                      onClick={handleResetSkills}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#2B3139] bg-[#1E2329] px-2.5 py-1 text-[11px] font-bold text-[#848E9C] transition-colors hover:border-[#FCD535]/40 hover:text-[#EAECEF]"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span>Solo Base</span>
                    </button>
                  )}
                </div>

                {/* Desglose de Elementos */}
                <div className="flex flex-col gap-2.5">
                  {/* Base Obligatoria */}
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-[#0ECB81]/30 bg-[#0ECB81]/5 px-3.5 py-3">
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-[#0ECB81]" />
                      <div className="flex flex-col">
                        <span className="text-xs font-extrabold text-[#EAECEF]">
                          {BASE_PLAN.name}
                        </span>
                        <span className="text-[10px] text-[#848E9C]">
                          Gráficas, Brechas, Resultados, Historial, Contador,
                          Excel
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-sm font-extrabold tabular-nums text-[#EAECEF]">
                      ${pricing.baseUsd}
                    </span>
                  </div>

                  {/* Skills Seleccionadas o Estado En Desarrollo */}
                  {!hasPublishedSkills ? (
                    <div className="rounded-xl border border-dashed border-[#2B3139] bg-[#0B0E11]/50 px-3.5 py-3 text-center">
                      <p className="text-[11px] leading-relaxed text-[#848E9C]">
                        <strong className="text-[#FCD535]">
                          Skills en desarrollo:
                        </strong>{" "}
                        por ahora solo contamos con el{" "}
                        <span className="font-mono text-[#EAECEF]">
                          Plan Básico ($30/mes)
                        </span>
                        . Las nuevas Skills se sumarán aquí cuando estén
                        disponibles.
                      </p>
                    </div>
                  ) : selectedSkills.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#2B3139] bg-[#0B0E11]/50 px-3.5 py-3 text-center">
                      <p className="text-[11px] leading-relaxed text-[#848E9C]">
                        Sin skills adicionales activas. Pulsa{" "}
                        <strong className="text-[#FCD535]">
                          Agregar
                        </strong>{" "}
                        en cualquier skill para ver su suma sobre los{" "}
                        <span className="font-mono text-[#EAECEF]">
                          $30/mes
                        </span>
                        .
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {selectedSkills.map((skill) => (
                        <div
                          key={skill.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-[#FCD535]/30 bg-[#1E2329] px-3.5 py-2.5"
                        >
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate text-xs font-bold text-[#EAECEF]">
                              + {skill.name}
                            </span>
                            <span className="font-mono text-[10px] text-[#848E9C]">
                              {skill.code} · Módulo adicional
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="font-mono text-xs font-extrabold tabular-nums text-[#FCD535]">
                              +${skill.monthlyPriceUsd}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleSkill(skill.id)}
                              aria-label={`Quitar ${skill.name}`}
                              className="flex h-6 w-6 items-center justify-center rounded-md border border-[#2B3139] bg-[#0B0E11] text-[#848E9C] transition-colors hover:border-[#F6465D]/50 hover:text-[#F6465D]"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Caja Matemática Total */}
                <div className="flex flex-col gap-2.5 rounded-xl border border-[#2B3139] bg-[#1E2329] p-4">
                  <div className="flex items-center justify-between text-xs text-[#848E9C]">
                    <span>Plan Básico (Mensual)</span>
                    <span className="font-mono font-bold tabular-nums text-[#EAECEF]">
                      ${pricing.baseUsd} USD
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[#848E9C]">
                    <span>
                      {hasPublishedSkills
                        ? `Skills Adicionales (${selectedSkills.length})`
                        : "Skills Adicionales"}
                    </span>
                    <span className="font-mono font-bold tabular-nums text-[#FCD535]">
                      {hasPublishedSkills
                        ? `+$${pricing.skillsUsd} USD`
                        : "En desarrollo"}
                    </span>
                  </div>

                  <div className="my-1 border-t border-[#2B3139]" />

                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-[#EAECEF]">
                      Total Mensual
                    </span>
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono text-3xl font-extrabold tracking-tight tabular-nums text-[#FCD535]">
                        ${pricing.totalUsd}
                      </span>
                      <span className="text-xs font-bold text-[#848E9C]">
                        USD / mes
                      </span>
                    </div>
                  </div>
                </div>

                {/* Botón CTA Principal */}
                <button
                  type="button"
                  onClick={() => setShowActivationPanel((prev) => !prev)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#FCD535] px-4 py-3 text-sm font-extrabold text-[#0B0E11] shadow-md transition-all hover:bg-[#F0B90B] active:scale-[0.99]"
                >
                  <span>
                    {showActivationPanel
                      ? "Ocultar Detalles de Activación"
                      : `Solicitar Plan (${formatShortUsd(pricing.totalUsd)}/mes)`}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </button>

                {/* Panel Privado de Activación (Cumpliendo Privacidad de Cobro AGENTS.md) */}
                {showActivationPanel && (
                  <div className="flex flex-col gap-3 rounded-xl border border-[#0ECB81]/35 bg-[#0B0E11] p-4">
                    <div className="flex items-start gap-2.5">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0ECB81]" />
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-extrabold text-[#EAECEF]">
                          Activación Privada con el Administrador
                        </span>
                        <p className="text-[11px] leading-relaxed text-[#848E9C]">
                          Por seguridad y privacidad, la cobranza y los métodos
                          de pago se coordinan directamente con el administrador
                          al momento de activar tu mensualidad.
                        </p>
                        {selectedSkills.length > 0 && (
                          <p className="text-[10px] leading-relaxed text-[#FCD535]">
                            El Plan Básico ($30/mes) está activo hoy; las Skills
                            próximas se habilitan al lanzarse cada módulo.
                          </p>
                        )}
                      </div>
                    </div>

                    <a
                      href={buildWhatsAppUrl(
                        `Hola, quiero activar mi suscripción de Bot P2P:\n${buildCopyText()}`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-3 py-2.5 text-xs font-extrabold text-[#0B0E11] shadow-sm transition-all hover:bg-[#22c35e]"
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>
                        Escribir por WhatsApp ({SUPPORT_WHATSAPP_NUMBER_DISPLAY})
                      </span>
                    </a>

                    <button
                      type="button"
                      onClick={handleCopySummary}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#2B3139] bg-[#181A20] px-3 py-2 text-xs font-bold text-[#EAECEF] transition-colors hover:border-[#FCD535]/50 hover:text-[#FCD535]"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>
                        {copiedSummary
                          ? "¡Resumen copiado al portapapeles!"
                          : "Copiar resumen de mi plan"}
                      </span>
                    </button>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <Link
                        href="/register"
                        className="inline-flex items-center justify-center rounded-lg bg-[#0ECB81] px-3 py-2 text-center text-[11px] font-extrabold text-[#0B0E11] transition-colors hover:bg-[#0ECB81]/90"
                      >
                        Crear Cuenta
                      </Link>
                      <Link
                        href="/login"
                        className="inline-flex items-center justify-center rounded-lg border border-[#2B3139] bg-[#1E2329] px-3 py-2 text-center text-[11px] font-bold text-[#EAECEF] transition-colors hover:border-[#FCD535]/50"
                      >
                        Iniciar Sesión
                      </Link>
                    </div>
                  </div>
                )}

                <p className="text-center text-[11px] leading-relaxed text-[#848E9C]">
                  Privacidad de cobro: no mostramos datos bancarios públicos en
                  la plataforma.{" "}
                  <Link
                    href="/login"
                    className="font-bold text-[#FCD535] hover:underline"
                  >
                    Ir al inicio de sesión
                  </Link>
                </p>
              </div>
            </div>

            {/* Tarjeta Fija de Soporte Directo WhatsApp + Demo Interactiva */}
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#2B3139] bg-[#181A20] p-5 shadow-lg">
              <div className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#25D366]/35 bg-[#25D366]/15 text-[#25D366]">
                  <Headphones className="h-5 w-5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-extrabold text-[#EAECEF]">
                    Soporte Directo &amp; Activación
                  </span>
                  <span className="font-mono text-xs font-bold text-[#25D366]">
                    +58 {SUPPORT_WHATSAPP_NUMBER_DISPLAY}
                  </span>
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-[#848E9C]">
                ¿Tienes dudas, quieres activar tu cuenta o necesitas ayuda con
                tu API Key de Binance? Escríbenos directo por WhatsApp.
              </p>

              <a
                href={buildWhatsAppUrl(
                  "Hola, vengo desde Bot P2P Venezuela y necesito soporte / información de planes."
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-xs font-extrabold text-[#0B0E11] shadow-sm transition-all hover:bg-[#22c35e] active:scale-[0.99]"
              >
                <Phone className="h-3.5 w-3.5" />
                <span>WhatsApp {SUPPORT_WHATSAPP_NUMBER_DISPLAY}</span>
              </a>

              <Link
                href="/demo"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[#0ECB81]/40 bg-[#0ECB81]/10 px-4 py-2.5 text-xs font-extrabold text-[#0ECB81] transition-all hover:bg-[#0ECB81]/20"
              >
                <PlayCircle className="h-4 w-4" />
                <span>Probar Demo Interactiva Gratis</span>
              </Link>
            </div>
          </aside>
        </div>
      </main>

      {/* Footer Limpio */}
      <footer className="border-t border-[#2B3139] bg-[#0B0E11] px-4 py-6 sm:px-6">
        <div className="mx-auto flex w-full max-w-[1380px] flex-wrap items-center justify-between gap-3 text-xs text-[#848E9C]">
          <span>
            &copy; 2026 Bot P2P Venezuela &bull; Uso Privado Autorizado
          </span>
          <span>
            Normas Contables BA VEN-NIF &bull; Zona Horaria VET (UTC-4)
          </span>
        </div>
      </footer>
    </div>
  );
}
