import * as React from "react";
import { cn } from "@/lib/utils";

interface FinanceLogoProps extends React.SVGProps<SVGSVGElement> {
  readonly variant?: "finance" | "accountant";
  readonly size?: number;
}

export function FinanceLogo({
  className,
  variant = "finance",
  size = 40,
  ...props
}: FinanceLogoProps) {
  const isAccountant = variant === "accountant";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0 select-none", className)}
      aria-label="Bot P2P Finance Logo"
      {...props}
    >
      <defs>
        {/* Degradado Principal de Bóveda: Esmeralda o Ámbar */}
        <linearGradient
          id={isAccountant ? "logoBgAmber" : "logoBgEmerald"}
          x1="0"
          y1="0"
          x2="64"
          y2="64"
          gradientUnits="userSpaceOnUse"
        >
          {isAccountant ? (
            <>
              <stop offset="0%" stopColor="#F59E0B" />
              <stop offset="50%" stopColor="#D97706" />
              <stop offset="100%" stopColor="#92400E" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#10B981" />
              <stop offset="50%" stopColor="#059669" />
              <stop offset="100%" stopColor="#064E3B" />
            </>
          )}
        </linearGradient>

        {/* Flecha Dorada de Crecimiento */}
        <linearGradient
          id={isAccountant ? "logoArrowAmber" : "logoArrowEmerald"}
          x1="14"
          y1="34"
          x2="50"
          y2="14"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FEF08A" />
          <stop offset="100%" stopColor="#FACC15" />
        </linearGradient>

        {/* Sombra Suave */}
        <filter
          id={isAccountant ? "logoShadowAmber" : "logoShadowEmerald"}
          x="-15%"
          y="-15%"
          width="130%"
          height="130%"
        >
          <feDropShadow
            dx="0"
            dy="2"
            stdDeviation="2"
            floodColor={isAccountant ? "#451a03" : "#022c22"}
            floodOpacity="0.35"
          />
        </filter>
      </defs>

      {/* Contenedor Cuadrado Redondeado (Squircle Moderno) */}
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="16"
        fill={`url(#${isAccountant ? "logoBgAmber" : "logoBgEmerald"})`}
      />
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="16"
        stroke={isAccountant ? "#FDE68A" : "#6EE7B7"}
        strokeWidth="1.5"
        strokeOpacity="0.45"
      />

      {/* Barras de Volumen / Contabilidad (Crecimiento P&L) */}
      <rect
        x="15"
        y="36"
        width="7"
        height="14"
        rx="2.5"
        fill="#FFFFFF"
        fillOpacity="0.5"
      />
      <rect
        x="25"
        y="28"
        width="7"
        height="22"
        rx="2.5"
        fill="#FFFFFF"
        fillOpacity="0.75"
      />
      <rect
        x="35"
        y="20"
        width="7"
        height="30"
        rx="2.5"
        fill="#FFFFFF"
        fillOpacity="0.95"
      />

      {/* Línea de Tendencia y Flecha de Margen / Brecha en Oro Brillante */}
      <path
        d="M14 33 L25 24 L35 27 L48 14"
        stroke={`url(#${isAccountant ? "logoArrowAmber" : "logoArrowEmerald"})`}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${isAccountant ? "logoShadowAmber" : "logoShadowEmerald"})`}
      />
      <path
        d="M40 14 H48 V22"
        stroke={`url(#${isAccountant ? "logoArrowAmber" : "logoArrowEmerald"})`}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${isAccountant ? "logoShadowAmber" : "logoShadowEmerald"})`}
      />

      {/* Destello de Rendimiento */}
      <circle cx="48" cy="14" r="2" fill="#FFFFFF" />
    </svg>
  );
}
