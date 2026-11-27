# Guía y Directrices para Agentes — Bot P2P Venezuela

> **Propósito**: Este archivo contiene las directrices de arquitectura, reglas del dominio financiero vigentes, estándares fiscales venezolanos (SENIAT / BA VEN-NIF), reglas de alto volumen, arquitectura PWA/sesiones y el flujo obligatorio de verificación *end-to-end* para cualquier agente de IA o desarrollador que trabaje en este repositorio.

---

## 1. Visión General del Proyecto

**Bot P2P** es una suite contable, fiscal y de monitoreo de liquidez en tiempo real para comerciantes profesionales (*merchants* / cajeros) de **Binance P2P en Venezuela** (par `USDT / VES`).

El sistema resuelve cuatro grandes necesidades del ecosistema cripto-fiat venezolano:
1. **Control de Márgenes y Ganancia Real ("Motor por Vuelta" + Insignias)**: Calcula la ganancia neta real cruzando el volumen de vuelta (`min(Vendido, Comprado)`), la brecha ponderada real (`Prom. Venta - Prom. Compra`) y la comisión por insignia verificada (Bronce/Plata/Oro) sobre el volumen total movido.
2. **Cumplimiento Tributario SENIAT (Norma BA VEN-NIF)**: Provisión impositiva configurable por el dueño (por defecto `16%`) aplicada únicamente sobre la ganancia neta positiva, visible exclusivamente en **Modo Contador** y en el **Libro Fiscal Excel (.XLSX)**.
3. **Monitoreo de Brechas Bancarias en Vivo + Alertas Sonoras**: Conexión directa a la API pública de Binance C2C para comparar en vivo el 2do anuncio de compra y el 2do anuncio de venta **exclusivamente de comerciantes verificados (`publisherType: 'merchant'`)** según monto en Bolívares para **Banesco, Pago Móvil, Mercantil, BBVA Provincial, Banco de Venezuela, Bancamiga y BNC**, con gráfica 5m (`Curva 5m` / `Velas 5m`) y alertas sonoras de mejora de brecha.
4. **Jornadas 100% Manuales + Reportes Excel Auditables de Alto Volumen**: Control de jornadas con inicio/cierre manual (sin límite de días ni auto-cierre nocturno), independiente de la contabilidad calendario diaria/mensual optimizada para cuentas de **400–500+ órdenes/día (~15,000 órdenes/mes)**.

---

## 2. Reglas del Dominio Financiero y Contable (Vigentes)

### A. Filtro Estricto de Órdenes Elegibles (`evaluateOrderCalculationEligibility`)
**Únicamente** las órdenes que cumplan las **3 condiciones simultáneas** entran al cálculo de volúmenes, promedios y ganancias:
1. Estado estrictamente **`COMPLETED`** (doble validación `statusCategory` + `orderStatus`; se excluyen `CANCELLED`, `CANCELLED_BY_SYSTEM`, `EXPIRED`, `IN_APPEAL` e `IN_PROGRESS`).
2. Moneda fiduciaria estrictamente **`VES`** (se descartan `USD`/Zinli, `COP`, etc.).
3. Criptoactivo estrictamente **`USDT`** (se descartan compras/ventas de `BTC`, `ETH`, `BNB`, `USDC`, `FDUSD`, etc. aunque sean en `VES`).

### B. Motor de Ganancias por "Vuelta" y Comisiones Reales de Binance (`calculateVueltaSummary`)
Todas las operaciones usan `Decimal.js` (precisión 28, redondeo `ROUND_HALF_UP`):
- **Volúmenes Visibles en USDT (Exactos a la App Móvil de Binance — `getBinanceAppOrderUsdtDecimal`)**:
  - En **COMPRA (`BUY`)**: `amount - commission` (*Cantidad recibida* en Binance).
  - En **VENTA (`SELL`)**: `amount + commission` (*Cantidad total* en Binance).
  - En Supabase (`p2p_orders`) se conserva `amount_usdt` crudo y `commission_usdt` crudo sin mutar para auditoría e idempotencia.
- **Precios Promedio Ponderados Limpios (SIN comisión y SIN truncado de 2 decimales de Binance)**:
  - Peso exacto sin comisión por orden: `exactUsdtNoComm = totalPriceVes / unitPriceVes`
  - `activeAvgSell = totalSoldVes / exactSoldUsdtForAvg`
  - `activeAvgBuy = totalBoughtVes / exactBoughtUsdtForAvg`
- **Brecha de Puntos Pura** (solo si ambos lados tienen volumen completado `> 0`):
  - `brechaPoints = activeAvgSell - activeAvgBuy`
- **Volumen de la Vuelta y Pendiente**:
  - `vueltaVolumeUsdt = min(totalSoldUsdt, totalBoughtUsdt)` (en USDT exactos de billetera/app Binance)
  - El diferencial (`|totalSoldUsdt - totalBoughtUsdt|`) queda como *Pendiente por recomprar* o *Pendiente por vender*.
- **Ganancia Bruta Exacta**:
  - `grossProfitBs = exactBoughtUsdtForAvg * brechaPoints`
  - `grossProfitUsdt = grossProfitBs / activeAvgBuy`
- **Comisión Real de Binance (restada UNA sola vez)**:
  - `volumeCommissionUsdt = Σ commissionUsdt` (suma real exacta de las comisiones reportadas por Binance SAPI en cada orden completada `USDT/VES`; elimina desvíos por redondeos a centavos o cambios de insignia).
  - `volumeCommissionBs = volumeCommissionUsdt * (activeAvgBuy > 0 ? activeAvgBuy : activeAvgSell)`
- **Ganancia Neta Real Operativa**:
  - `netProfitUsdt = grossProfitUsdt - volumeCommissionUsdt`
  - `netProfitBs = grossProfitBs - volumeCommissionBs`
- **Provisión SENIAT** (solo lectura fiscal en Modo Contador y Excel; **no** se descuenta de `netProfit` operativo):
  - `seniatTax = max(0, netProfit) * (seniatTaxPercent / 100)` (porcentaje configurable por el dueño; bloqueado `403` para `AUDITOR_SENIAT`).

### C. Agregación Mensual Exacta (Suma Día por Día — Anti Falso Negativo)
- En el **Resumen Mensual** (`buildClosingReport(scope: "MONTH")` y `getSummary(period: "MONTH")`), la ganancia y los volúmenes del mes **siempre** se calculan como la **suma exacta de los resultados de cada día calendario VET** (`buildDailyBreakdownAndMonthlySummary` → `buildAggregatedSummaryFromClosures`).
- **Jamás** mezclar todo un mes en un único promedio ponderado global: en Venezuela la variación cambiaria del Bolívar entre el inicio y fin de mes distorsiona los promedios y produce ganancias negativas falsas.
- El archivo Excel `.xlsx` se genera en **3 hojas auditables**:
  1. `Resumen y Cierre` (valores numéricos reales + tabla Día por Día con `=SUM(...)`).
  2. `Completadas USDT-VES` (solo órdenes elegibles con `=SUMIF`/`=SUM`).
  3. `Espejo Completo Binance` (todas las órdenes con `Activo`, `Fiat`, `Comisión Binance` y `¿Incluida en Cálculo?`).

### D. Control de Jornadas (100% Manual y Multi-Día)
- Una jornada se abre con **Iniciar Jornada** y permanece abierta indefinidamente (horas, 1 día, 2+ días) hasta que el operador pulse **Cerrar Jornada**.
- **No existe auto-cierre nocturno a las 23:59 VET**.
- Mientras hay una jornada abierta, la app mantiene monitoreo activo en segundo plano (**Screen Wake Lock** + **Web Worker** + polling en segundo plano + alertas sonoras).

---

## 3. Modelo SaaS, Seguridad y Sesiones

1. **Sesiones Persistentes Deslizantes (`bot_p2p_session`)**:
   - Cookie `HttpOnly; SameSite=Lax; Secure` firmada con HMAC-SHA256 con vigencia de **365 días** (`Max-Age=31536000`, dentro del límite de 400 días de Chrome) y **renovación deslizante automática** (si pasan >24h desde su emisión se extiende nuevamente a 365 días). Solo se cierra al pulsar **Salir** (`POST /api/p2p/logout`).
   - En `src/middleware.ts`, la decodificación `base64url` debe soportar UTF-8 (nombres con acentos/ñ).
2. **Roles y Separación Operativa (RBAC Zero-Trust)**:
   - **Gráficas y Brechas (`MARKET_LIVE`)**: accesible para trabajadores/operadores (gráfica 5m, 7 bancos, Iniciar/Cerrar Jornada, alertas de brecha). **Nunca** muestra el botón *Modo Contador* ni ganancias privadas.
   - **Resultados (`RESULTS`)**: protegido con contraseña (`ResultsLockScreen`). Contiene KPIs, Espejo P2P, Conexión con Binance, Cierres y acceso a **Modo Contador**.
   - **Modo Contador (`AUDITOR_SENIAT`)**: solo lectura fiscal (Libro Fiscal Mensual Excel + Provisión SENIAT + tabla de comprobantes). Jamás ve API Keys ni herramientas operativas.
3. **Privacidad de Cobro**:
   - **No se muestran datos bancarios personales en la interfaz**. En `/planes` solo se ofrece contacto directo por WhatsApp oficial (`0424-7807851` / `wa.me/584247807851`) y demo interactiva (`/demo`).
4. **PWA Instalable**:
   - `public/manifest.webmanifest`, 5 íconos PNG en `public/icons/` (`192`, `512`, `maskable`, `apple-touch-icon` 180), `public/sw.js` (jamás cachea `/api/*` ni HTML autenticado) y `public/offline.html`.

---

## 4. Arquitectura, Alto Volumen y Base de Datos (Supabase)

| Capa | Tecnología | Notas Críticas de Operación |
| :--- | :--- | :--- |
| **Framework** | Next.js 15 (App Router) + React 19 | `maxDuration = 60` en `/api/[[...route]]/route.ts` |
| **Estilos & UI** | Tailwind CSS 3.4 + Lucide React + `sonner` | Tema oscuro Binance Pro (`#0B0E11` / `#181A20` / `#FCD535`) |
| **API Backend** | Hono RPC (`/api/*`) | Tipado end-to-end, rate-limit, headers `no-store` |
| **Base de Datos** | Supabase PostgreSQL | PK compuesta `(user_id, order_number)` en `p2p_orders`, cobertura diaria `p2p_sync_day_coverage`, lock `p2p_sync_state` |
| **Cálculo Numérico** | `Decimal.js` (precisión 28) | Obligatorio para todo dinero/cripto (`ROUND_HALF_UP`) |
| **Seguridad API** | AES-256-GCM + HMAC-SHA256 | Claves Binance Read-Only cifradas en servidor; nunca expuestas al frontend |
| **Estado Cliente** | TanStack Query v5 + Zustand | Debounce en inputs de brechas; caché incremental en backend |

### Límites Operativos y Monitoreo de Espacio en BD
- **Binance C2C SAPI**: tope real `rows = 50` por página; sincronización incremental por cursor (`última orden - 30 min`) y sincronización día por día (`ensureRangeCompletelySynced`) para reportes diarios/mensuales (evita truncados en cuentas de 400–500+ órdenes/día).
- **Paginación Supabase**: usar siempre desempate determinista `.order("create_time_ms", { ascending: false }).order("order_number", { ascending: false })` en páginas de 1,000 filas.
- **Capacidad PostgreSQL**: ~1 KB/orden en `p2p_orders` (100,000 órdenes ≈ 100 MB). Monitorear en Supabase `pg_database_size(current_database())` y `pg_total_relation_size`: alerta en **350–400 MB** para Plan Free (500 MB) o migrar a Plan Pro (8 GB).

---

## 5. Flujo Obligatorio de Revisión y Directrices Estrictas de Código

1. **Regla de Verificación Punta a Punta (Obligatoria)**:
   - Antes de afirmar cómo se comporta una función o cerrar un bug, trazar **toda la cadena**: `Binance SAPI → Supabase (incluyendo defaults/fallbacks legacy) → Servicio → Exportación/UI`.
   - Toda modificación debe validarse con `npm test`, `npx tsc --noEmit`, `npm run build` y pruebas unitarias en `tests/` cuando toque lógica financiera, auth o exportaciones.
   - Arquitectura modular del núcleo: los dominios viven en `src/server/db/vault/*` y `src/server/services/p2p-accounting/*`, expuestos mediante fachadas compatibles en `supabase-vault.repository.ts` y `p2p-accounting.service.ts`.
2. **Regla de Oro — No Alterar Fórmulas Sin Aprobación Explícita**:
   - No modificar fórmulas de Vuelta, promedios ponderados, comisiones por insignia ni SENIAT salvo solicitud explícita del dueño.
3. **Precisión Financiera Obligatoria**:
   - **NUNCA** usar operadores nativos JS (`+`, `-`, `*`, `/`) con montos de dinero o criptoactivos. Usar siempre `Decimal.js`.
4. **TypeScript Estricto**:
   - `strict: true`, `noUncheckedIndexedAccess: true`. Prohibido el uso de `any`.
5. **Identidad, Formatos y Memoria**:
   - Moneda fiduciaria `VES`, cripto `USDT`, zona horaria `America/Caracas` (`VET / UTC-4`), Bolívares con separadores de miles (`1,029.80 Bs.`).
   - Mantener actualizado `AGENTS.md` y `MEMORY.md` cada vez que cambien reglas de negocio, métricas clave o arquitectura.
