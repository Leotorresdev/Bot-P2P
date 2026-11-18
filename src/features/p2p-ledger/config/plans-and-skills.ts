import Decimal from "decimal.js";

export type PlanFeatureIconKey =
  | "charts"
  | "spreads"
  | "results"
  | "history"
  | "accountant"
  | "excel";

export interface PlanIncludedFeature {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly badge: string;
  readonly icon: PlanFeatureIconKey;
}

export type BotSkillIconKey = "alerts" | "team" | "reconcile";

export interface BotSkillDefinition {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly monthlyPriceUsd: string;
  readonly status: "PREVIEW" | "ACTIVE";
  readonly statusLabel: string;
  readonly highlights: readonly string[];
  readonly icon: BotSkillIconKey;
}

export interface BasePlanDefinition {
  readonly id: string;
  readonly name: string;
  readonly subtitle: string;
  readonly monthlyPriceUsd: string;
  readonly billingLabel: string;
  readonly badgeLabel: string;
  readonly features: readonly PlanIncludedFeature[];
}

export const BASE_PLAN: BasePlanDefinition = {
  id: "basic-suite",
  name: "Plan Básico",
  subtitle:
    "Todas las herramientas actuales de Bot P2P en una sola suscripción mensual, sin límites ocultos.",
  monthlyPriceUsd: "30",
  billingLabel: "por mes",
  badgeLabel: "PLAN BASE · SUITE COMPLETA",
  features: [
    {
      id: "charts",
      title: "Visualización de Gráficas",
      badge: "24/7 UTC-4",
      description:
        "Gráficas horarias interactivas estilo TradingView en hora Venezuela por cada banco nacional.",
      icon: "charts",
    },
    {
      id: "spreads",
      title: "Visualización de Brechas",
      badge: "7 Bancos VE",
      description:
        "Monitor en vivo de tasas y spread % de comerciantes verificados en Banesco, Pago Móvil, Mercantil, BBVA, BDV, Bancamiga y BNC.",
      icon: "spreads",
    },
    {
      id: "results",
      title: "Acceso a Resultados",
      badge: "P&L Real",
      description:
        "Ganancias netas libres, comisiones Binance (0.163% / Insignias), lotes FIFO/WAC y capital de trabajo.",
      icon: "results",
    },
    {
      id: "history",
      title: "Acceso al Historial",
      badge: "Espejo P2P",
      description:
        "Historial completo sincronizado con Binance P2P con filtros por fecha, banco, tipo y búsqueda rápida.",
      icon: "history",
    },
    {
      id: "accountant",
      title: "Modo Contador",
      badge: "SENIAT 16%",
      description:
        "Portal fiscal protegido por contraseña para tu contador público, cálculo del IVA (16%) BA VEN-NIF y actas de cierre 11:59 PM.",
      icon: "accountant",
    },
    {
      id: "excel",
      title: "Acceso a los Excel",
      badge: ".XLSX / .PDF",
      description:
        "Descarga de reportes diarios y mensuales en Excel, PDF y CSV para auditar todo lo operado y conciliado.",
      icon: "excel",
    },
  ],
};

/**
 * Catálogo modular de Skills.
 * Por ahora no hay Skills publicadas (se encuentran en desarrollo).
 * Cada nueva funcionalidad que se implemente en el bot se agregará aquí con su precio
 * mensual para sumarse automáticamente sobre el Plan Básico ($30/mes).
 */
export const BOT_SKILLS: readonly BotSkillDefinition[] = [];

export interface PlanPricingBreakdown {
  readonly baseUsd: string;
  readonly skillsUsd: string;
  readonly totalUsd: string;
}

export function calculatePlanPricingBreakdown(
  baseMonthlyUsd: string,
  selectedSkills: readonly BotSkillDefinition[]
): PlanPricingBreakdown {
  const base = new Decimal(baseMonthlyUsd);
  const skillsTotal = selectedSkills.reduce(
    (acc, skill) => acc.plus(new Decimal(skill.monthlyPriceUsd)),
    new Decimal(0)
  );
  const total = base.plus(skillsTotal);

  return {
    baseUsd: base.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
    skillsUsd: skillsTotal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
    totalUsd: total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
  };
}

export function formatShortUsd(rawUsd: string): string {
  const d = new Decimal(rawUsd).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return d.mod(1).isZero() ? `$${d.toFixed(0)}` : `$${d.toFixed(2)}`;
}
