# MEMORY.md — Memoria Técnica y Registro de Decisiones (Bot P2P Venezuela)

> **Propósito**: Registro vivo de decisiones de arquitectura, bugs históricos resueltos, métricas de rendimiento y checklists de verificación para mantener consistencia absoluta entre sesiones y evitar regresiones en producción para todos los usuarios.

---

## 1. Decisiones de Producto y Arquitectura Vigentes

| Área | Decisión Actual | Archivos Clave |
| :--- | :--- | :--- |
| **Motor de Ganancias** | `Ganancia Bruta (Bs) = totalBoughtUsdt × Brecha`; `Ganancia Neta = Ganancia Bruta - Comisión Insignia sobre Volumen Total`. Insignias: Bronce `0.20%`, Plata `0.175%`, Oro `0.125%`. | `src/server/services/p2p-accounting.service.ts` |
| **Cálculo Mensual** | **Suma exacta día por día (VET)** con `Decimal.js` tanto en Excel/PDF/CSV como en UI (`getSummary(period: "MONTH")`). Evita ganancias negativas falsas cuando cambia la tasa del Bs. durante el mes. | `p2p-accounting.service.ts` (`buildDailyBreakdownAndMonthlySummary`) |
| **Filtro de Órdenes** | Fuente única de verdad `evaluateOrderCalculationEligibility`: **solo `COMPLETED` + `USDT` + `VES`**. Descarta canceladas, expiradas, apeladas, en curso, otras fiat (`USD`, `COP`) y otros criptoactivos (`BTC`, `ETH`, `USDC`, `BNB`, `FDUSD`). | `p2p-accounting.service.ts` |
| **Excel (.XLSX)** | 3 hojas auditables: (1) `Resumen y Cierre` (valores numéricos + tabla Día por Día con `=SUM`), (2) `Completadas USDT-VES` (solo órdenes del cálculo con `=SUMIF`/`=SUM`), (3) `Espejo Completo Binance` (todas las órdenes con `Activo`, `Fiat`, `Comisión` y `¿Incluida en Cálculo?`). | `src/server/services/p2p-export.service.ts` |
| **Jornadas** | **100% manuales y multi-día** (sin auto-cierre 23:59 VET). Contabilidad diaria/semanal/mensual funciona independientemente por fecha calendario VET. | `shift-control-panel.tsx`, `p2p-accounting.service.ts` |
| **Sesiones** | Cookie `HttpOnly` firmada (`bot_p2p_session`) de **365 días** (`Max-Age=31536000`) con **renovación deslizante** (>24h). Solo cierra al pulsar **Salir**. | `crypto-vault.ts`, `app.ts`, `middleware.ts`, `better-auth.ts` |
| **PWA** | Instalable en Android Chrome, Desktop y iOS Safari: `public/manifest.webmanifest`, 5 íconos PNG en `public/icons/`, `public/sw.js` (nunca cachea `/api/*` ni HTML autenticado) y botón `InstallAppButton`. | `public/manifest.webmanifest`, `public/sw.js`, `pwa-provider.tsx` |
| **Modo Contador** | Botón visible **solo dentro de Resultados** (jamás en Gráficas y Brechas). Muestra 1 botón de Excel Mensual + 1 tarjeta `Provisión SENIAT (X%)` editable solo por el dueño + libro filtrable por fecha. | `accountant-tax-view.tsx`, `top-navigation-bar.tsx`, `bento-modules-grid.tsx` |
| **Gráfica 5m** | Intervalos exactos de 5 minutos en VET (`-4:00 UTC`), por defecto `Curva 5m` (`LineType.Curved`) + `SMA(6)` dorada de tendencia + zoom óptimo en `Velas 5m`. | `tradingview-p2p-chart.tsx` |
| **Soporte & Demo** | `/planes` incluye WhatsApp directo `0424-7807851` (`wa.me/584247807851`), botón **Soporte** en barra superior del bot hacia `/planes`, y demo interactiva pública en `/demo`. | `plans-showcase-screen.tsx`, `top-navigation-bar.tsx`, `interactive-demo-screen.tsx` |
| **Notificaciones & 2do Plano** | `sonner` + sintetizador Web Audio API + `Notification API` para mejora de brechas e inicio/cierre de jornada; `Screen Wake Lock` + Web Worker (`shift-worker.js`) + polling activo mientras hay jornada abierta. | `notification-sound.ts`, `use-alert-settings-store.ts`, `shift-background-and-alerts-provider.tsx`, `public/shift-worker.js` |

---

## 2. Bugs Críticos Históricos Resueltos (No Repetir Jamás)

1. **Órdenes canceladas leídas como `COMPLETED` desde Supabase**:
   - *Causa*: El *fallback* legacy en `saveUserOrders` omitía `order_status` (Postgres rellenaba `DEFAULT 'COMPLETED'`), mientras guardaba `CANCELLED` empaquetado en `cost_basis_rate_ves` (`v2|...`). Al leer, `row.order_status` ganaba sobre `unpacked.orderStatus`.
   - *Prevención*: Priorizar `unpacked.orderStatus` cuando `unpacked.isV2Packed` y doble-validar estado en `evaluateOrderCalculationEligibility`. Clasificar `EXPIRED` y código `8` como `CANCELLED`.
2. **Ganancia Mensual Negativa Falsa en Excel**:
   - *Causa*: Mezclar todo el mes en un solo promedio ponderado (`Prom. Venta Mes - Prom. Compra Mes`) con días desbalanceados y subida de tasa del Bs. (en prueba reproducible: `+450.38 USDT` reales salían como `-1,311.27 USDT`).
   - *Prevención*: En `MONTH`, agregar siempre la suma exacta día por día (`buildDailyBreakdownAndMonthlySummary`).
3. **Compras/Ventas de otras monedas (`BTC`, `USDC`, `BNB`) contaminando promedios Bs./USDT**:
   - *Causa*: `calculateVueltaSummary` filtraba `fiat === "VES"` pero no `asset === "USDT"`.
   - *Prevención*: `evaluateOrderCalculationEligibility` exige `asset === "USDT"` y `fiat === "VES"`.
4. **Caché parcial y cortes silenciosos en cuentas de 400–500+ órdenes/día**:
   - *Causa*: `cachedHistorical.length > 0` / `resultOrders.length === 0` omitían días faltantes; ventana de 28 días cortaba en 22s u 80 páginas ignorando `truncatedByBudget`; paginación Supabase sin desempate `order_number DESC`.
   - *Prevención*: `ensureRangeCompletelySynced` sincroniza día por día con cobertura en `p2p_sync_day_coverage`, desempate `.order("order_number", { ascending: false })`, y alerta visible `X-P2P-Sync-Warning` si Binance aplica rate-limit.
5. **Colisión multi-usuario en `p2p_orders`**:
   - *Causa*: `order_number TEXT PRIMARY KEY` sin `user_id` provocaba sobrescritura si dos usuarios del bot comerciaban entre sí.
   - *Prevención*: Migración idempotente a `PRIMARY KEY (user_id, order_number)` en `supabase/schema.sql` con `onConflict: "user_id,order_number"` y *fallback* seguro.
6. **`src/app/manifest.ts` fallando build trace (`.nft.json`) en Next.js 15**:
   - *Prevención*: Usar `public/manifest.webmanifest` estático + `metadata.manifest` + cabeceras en `next.config.ts`.

---

## 3. Métricas y Límites de Infraestructura

- **Binance C2C SAPI**: `BINANCE_C2C_PAGE_SIZE = 50` (tope real). Ventana histórica máxima: 180 días.
- **Rendimiento ExcelJS verificado**: 15,000 órdenes/mes (30 días × 500 órdenes/día) generan un `.xlsx` de 3 hojas (`~1.67 MB`) en **~4.4 segundos**.
- **Vercel Serverless**: `maxDuration = 60` segundos en `src/app/api/[[...route]]/route.ts`.
- **Supabase PostgreSQL**:
  - Plan Free = **500 MB** (alerta preventiva a los **350–400 MB**; al llenarse entra en solo lectura). Plan Pro = **8 GB**.
  - Estimación: `p2p_orders` ≈ `1 KB`/orden con índices (`100,000` órdenes ≈ `100 MB`). Vigilar también tamaño de `orders_json` en `p2p_shift_closures`.
  - Consulta rápida en SQL Editor: `pg_database_size(current_database())` y `pg_total_relation_size(c.oid)`.
- **Cookies en Chrome**: límite máximo de 400 días → se usa `365 días` (`31,536,000s`) con renovación deslizante cada >24h.

---

## 4. Checklist de Revisión Antes de Cada Despliegue

1. Verificar de punta a punta (`Binance → Supabase → Servicio → UI/Excel`) cualquier cambio en datos o auth.
2. Confirmar que **no** se modificaron fórmulas financieras sin aprobación explícita.
3. Confirmar cero uso de `any` y uso exclusivo de `Decimal.js` para montos.
4. Ejecutar `npx tsc --noEmit` (exit `0`).
5. Ejecutar `npm run build` (exit `0`, todas las rutas generadas).
6. Si hubo cambios de esquema en `supabase/schema.sql`, recordar al dueño ejecutar el bloque SQL idempotente en Supabase.
