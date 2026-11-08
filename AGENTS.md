# Guía y Directrices para Agentes — Bot P2P Venezuela

> **Propósito**: Este archivo contiene las directrices de arquitectura, principios de dominio financiero, reglas fiscales venezolanas (SENIAT 16% / BA VEN-NIF), estándares criptográficos y flujo de trabajo para cualquier agente de IA o desarrollador que trabaje en este repositorio.

---

## 1. Visión General del Proyecto

**Bot P2P** es una suite contable, fiscal y de monitoreo de liquidez en tiempo real para comerciantes profesionales (*merchants* / cajeros) de **Binance P2P en Venezuela** (par `USDT / VES`).

El sistema resuelve tres grandes problemas del ecosistema cripto-fiat venezolano:
1. **Control de Márgenes y Ganancia Libre**: Cruza automáticamente cada venta contra el inventario de compra por lote (FIFO / Costo Promedio WAC), deduciendo comisiones de Binance y separando la ganancia neta.
2. **Cumplimiento Tributario SENIAT (Norma BA VEN-NIF)**: En Venezuela, el capital rotado en compra de criptoactivos es **exento de IVA** (costo de adquisición). La provisión impositiva del **16%** se aplica de forma estricta **únicamente sobre el margen bruto comercial realizado**, evitando que los comerciantes paguen impuestos sobre su propio capital.
3. **Monitoreo de Brechas Bancarias en Vivo**: Conexión directa a la API de Binance C2C para comparar en vivo el 2do anuncio de compra y el 2do anuncio de venta según el monto en Bolívares para **Banesco, Pago Móvil, Mercantil, BBVA Provincial, Banco de Venezuela, Bancamiga y BNC**.

---

## 2. Reglas del Dominio Financiero y Contable

### A. Comisiones Oficiales Binance Maker (0.163%)
En los anuncios publicados por el comerciante (rol **MAKER**), **a cada anuncio sea de compra o de venta se le resta el 0.163%**:
* **Tasa de Comisión Maker**: `0.163%` (`0.00163` en factor decimal).
* **Anuncio de Compra (`BUY`)**:
  - Monto bruto acordado: `amountUsdt`.
  - Comisión deducida por Binance: `commissionUsdt = amountUsdt * 0.00163`.
  - USDT netos acreditados en billetera: `netBuyUsdt = amountUsdt - commissionUsdt` (se le resta la comisión).
  - Bolívares pagados al vendedor: `totalPriceVes = amountUsdt * unitPriceVes`.
  - **Costo base real por USDT**: `unitCostBasisRateVes = totalPriceVes / netBuyUsdt`.
* **Anuncio de Venta (`SELL`)**:
  - Monto vendido al comprador: `amountUsdt`.
  - Comisión deducida por Binance: `commissionUsdt = amountUsdt * 0.00163` (se le resta al comercio).
  - Bolívares recibidos en cuenta bancaria: `totalPriceVes = amountUsdt * unitPriceVes`.
  - Costo de adquisición del lote: `exemptCapitalVes = amountUsdt * costBasisRateVes`.
  - Comisión Binance en Bs.: `feeInVes = commissionUsdt * unitPriceVes`.
  - Utilidad bruta en Bs.: `grossProfitVes = max(0, (totalPriceVes - exemptCapitalVes) - feeInVes)`.
  - **Provisión IVA 16% SENIAT**: `seniatTax16Ves = grossProfitVes * 0.16`.
  - **Ganancia Neta Libre**: `netFreeProfitVes = grossProfitVes - seniatTax16Ves` (84% restante para el comerciante).

### B. Definición de Capital de Trabajo (Volumen Diario)
* El **Capital de Trabajo** de la jornada corresponde al **volumen total de dinero que se movió en el día** (la suma del volumen de compras y ventas liquidadas):
  $$\text{Capital de Trabajo (USDT)} = \sum \text{amountUsdt}(\text{Compras}) + \sum \text{amountUsdt}(\text{Ventas})$$
  $$\text{Capital de Trabajo (VES)} = \sum \text{totalPriceVes}(\text{Compras}) + \sum \text{totalPriceVes}(\text{Ventas})$$
* Este valor refleja la liquidez viva rotada y sirve de base para el cálculo de rotación de inventario diario.

### C. Cierres Diarios y Seguridad Probatoria (11:59 PM VET)
* Todos los días a las **23:59:00 hora de Venezuela (VET / UTC-4)** el sistema genera un **Acta de Cierre Diario Inmutable**.
* Cada acta se sella mediante un hash criptográfico **SHA-256** generado a partir del `userId`, fecha ISO, órdenes conciliadas, ganancia bruta, IVA y ganancia neta. Esto garantiza que el libro contable no pueda ser alterado retroactivamente.

---

## 3. Modelo SaaS y Restricción de Acceso (Paywall de Suscripción)

El bot se distribuye bajo modelo privado / SaaS con **cobro de mensualidad**:
1. **Flujo de Registro (`/register`)**:
   - Registro de cuenta para nuevos operadores mediante Better Auth / endpoint seguro con hashing **Argon2id**.
   - Permite crear una cuenta desde cero con Nombre Comercial, Correo y Contraseña.
2. **Control de Membresía y Bloqueo Total**:
   - Estados: `TRIAL`, `ACTIVE`, `EXPIRED`, `SUSPENDED`.
   - **Regla Estricta**: Cuando la mensualidad de un usuario venza, **queda bloqueado TODO el perfil, incluyendo el rol del contador**. Ninguna herramienta ni consulta de historial está disponible hasta regularizar la mensualidad.
   - **Privacidad de Cobro**: **No se muestran datos bancarios personales en la interfaz**. La cobranza y métodos de pago se gestionan de forma privada/externa con el cliente, mostrando en la interfaz un mensaje para contactar al administrador.
3. **Roles de Usuario (RBAC Zero-Trust)**:
   - `OPERATOR` (Dueño / Operador): Acceso total, gestión de API Keys, monitor de brechas y libros de ganancias. Responsable de la cuenta.
   - `AUDITOR_SENIAT` (Contador Público CPC): Acceso restringido de solo lectura para descargar actas de las 11:59 PM y libros fiscales del 16%. **Jamás ve claves API de Binance ni herramientas operativas**.

---

## 4. Arquitectura y Stack Tecnológico

| Capa | Tecnología | Propósito |
| :--- | :--- | :--- |
| **Framework** | Next.js 15 (App Router) + React 19 | Frontend reactivo y Server Components |
| **Estilos & UI** | Tailwind CSS + Lucide React | Interfaz moderna con paleta esmeralda / fintech |
| **API Backend** | Hono RPC (`/api/*`) | Endpoints ultrarrápidos con tipado end-to-end |
| **Base de Datos** | Supabase PostgreSQL + Prisma ORM | Modelado relacional y persistencia auditable |
| **Autenticación** | Better Auth + 2FA TOTP | Sesiones seguras HttpOnly y RBAC |
| **Cálculo Numérico** | `Decimal.js` (precisión 28) | Operaciones financieras sin errores de redondeo IEEE 754 |
| **Seguridad API** | AES-256-GCM + HMAC-SHA256 | Cifrado en reposo para credenciales de Binance |
| **Estado Cliente** | TanStack Query v5 + Zustand | Sincronización en tiempo real y caché |

---

## 5. Directrices Estrictas de Código y Seguridad

1. **Precisión Financiera Obligatoria**:
   - **NUNCA** utilices operaciones primitivas de JavaScript (`+`, `-`, `*`, `/`) con dinero o criptoactivos. Usa siempre `Decimal.js` con redondeo `Decimal.ROUND_HALF_UP`.
2. **Zero-Trust en Claves API**:
   - Las llaves secretas de Binance (`apiSecret`) se cifran en el servidor con **AES-256-GCM** antes de tocar la base de datos.
   - **Jamás** devuelvas el `apiSecret` al frontend en ningún JSON ni log.
   - Antes de conectar una API Key, verifica que tenga permiso de **Solo Lectura (`Read-Only`)** y que los retiros y trading spot estén desactivados.
3. **TypeScript Estricto**:
   - `strict: true`, `noUncheckedIndexedAccess: true`. Prohibido el uso de `any`.
4. **Respeto a la Identidad y Formatos**:
   - La moneda fiduciaria es `VES` (Bolívares) y la cripto principal es `USDT`.
   - La zona horaria contable es siempre `America/Caracas` (VET / UTC-4).
   - Formatear siempre los Bolívares con separadores de miles legibles (`1,029.80 Bs.`).
