# Investigación y Arquitectura: Bot de Registro Contable y Cálculo de Ganancias para Binance P2P

> **Propósito del documento**: Base de conocimiento técnica y de negocio para el desarrollo de un sistema/bot propio que registre automáticamente todas las operaciones diarias de Binance P2P, controle el inventario de criptoactivos (USDT, BTC, FDUSD, etc.), descuente comisiones reales (de Binance y bancarias) y calcule la ganancia exacta por operación, por día y por mes para fines operativos y contables/legales.

---

## 1. ¿Qué usan actualmente los comerciantes ("Merchants" / Cajeros) de Binance P2P?

En el ecosistema profesional de Binance P2P (especialmente quienes operan de forma constituida con contadores, abogados, empresas LLC/SAS y múltiples cuentas bancarias), las herramientas se dividen en **dos categorías**:

### A. Plataformas Comerciales (SaaS) de Contabilidad y Gestión P2P
Sí existen softwares comerciales en el mercado, aunque suelen cobrar suscripciones mensuales altas (entre `\$30` y `\$250+` USD/mes según volumen) o requieren entregar tus API Keys a servidores de terceros:

1. **Bitlya (`bitlya.com`)**:
   - **Qué hace**: Es actualmente uno de los softwares contables más conocidos para merchants de Binance P2P.
   - **Funciones**: Se conecta por API de solo lectura a Binance, descarga las órdenes de compra (`BUY`) y venta (`SELL`), calcula la ganancia usando **Costo Promedio Ponderado (WAC)** o **FIFO**, controla el saldo de múltiples cuentas bancarias (conciliación Fiat), descuenta impuestos bancarios (como el `4x1000` en Colombia, `ITF` en Perú, `IGTF`/comisiones en Venezuela o comisiones de transferencias en México/Argentina/España) y genera reportes para contadores.
2. **P2P.Army (`p2p.army`)**:
   - **Qué hace**: Enfocado en análisis de mercado, monitoreo de spreads (brecha entre compra y venta) y bots de posicionamiento automático de anuncios (*Auto-pricing*).
   - **Limitación**: Está más enfocado en cambiar el precio del anuncio automáticamente que en llevar la contabilidad fiscal detallada de ganancias netas por orden.
3. **Sistemas ERP Locales para Cajeros (Koyn, CriptoContable, P2PControl)**:
   - **Qué hacen**: Usados por mesas de dinero P2P que tienen operadores/cajeros por turnos. Sincronizan las órdenes de Binance con los extractos bancarios para evitar desfases de caja y detectar pagos de terceros.
4. **Hojas de Google Sheets Automatizadas (con Google Apps Script)**:
   - Muchos comerciantes medianos pagan por plantillas de Excel/Google Sheets conectadas a la API de Binance mediante scripts.
   - **Problema**: Cuando el comerciante supera las 50–100 órdenes diarias, Google Sheets se vuelve lento, falla cuando Binance pagina los resultados, o se rompe la fórmula del inventario si se opera con varios métodos de pago o monedas Fiat a la vez.

### B. ¿Por qué construir tu propio Bot es una ventaja competitiva enorme?
1. **Privacidad y Seguridad Total**: Tus API Keys y tu volumen financiero (cuánto ganas, con qué bancos trabajas y tus clientes frecuentes) se quedan en tu propia base de datos local o servidor privado, sin exponer tu contabilidad a terceros.
2. **Ahorro de Suscripciones**: Cero pagos mensuales de por vida.
3. **Reglas Contables a tu Medida**: Puedes programar exactamente las comisiones de tus bancos locales, tus gastos operativos, transferencias externas (por ejemplo, si compras USDT por fuera o por Spot y los vendes en P2P) y exportar el Excel/CSV con las columnas exactas que te pide tu contador.
4. **Alertas Instantáneas en Telegram**: Cada vez que se completa una venta en Binance, el bot te envía al celular un mensaje con la ganancia exacta en moneda local y en USDT de esa orden específica.

---

## 2. Cómo funciona la API Oficial de Binance para P2P (Nivel Técnico)

Para el bot que quieres crear **NO necesitas pagar ni tener la API especial de Merchant para cambiar anuncios**, sino que funciona con **cualquier cuenta verificada de Binance** usando una **API Key estándar de Solo Lectura (`Enable Reading`)**.

> **Seguridad clave**: Como la API Key solo tiene permiso de **Lectura (`Read-Only`)**, es 100% imposible que el bot mueva fondos, haga retiros o abra operaciones por error. Es completamente segura.

### Endpoint Oficial de Historial de Órdenes P2P (C2C)
* **Método y Ruta**: `GET /sapi/v1/c2c/orderMatch/listUserOrderHistory`
* **URL Base**: `https://api.binance.com`
* **Autenticación**: Header `X-MBX-APIKEY` + firma criptográfica `HMAC-SHA256` con tu `API Secret`.

### Qué datos exactos nos entrega Binance por cada orden
Cada vez que el bot consulta ese endpoint, Binance devuelve un JSON con todas tus órdenes recientes. Aquí tienes un ejemplo real de los campos que recibiremos y guardaremos:

```json
{
  "orderNumber": "20593847561928374656",
  "advNo": "11482938475619283744",
  "tradeType": "SELL",
  "asset": "USDT",
  "fiat": "COP",
  "fiatSymbol": "$",
  "amount": "500.00000000",
  "totalPrice": "2100000.00000000",
  "unitPrice": "4200.00000000",
  "orderStatus": "COMPLETED",
  "createTime": 1730678400000,
  "commission": "0.75000000",
  "takerCommission": "0",
  "takerAmount": "500.00000000",
  "counterPartNickName": "JuanPerez99",
  "payMethodName": "Bancolombia",
  "advertisementRole": "MAKER"
}
```

### Campos clave que nuestro Bot analizará automáticamente:
| Campo de la API | Significado | Cómo lo usará nuestro Bot |
| :--- | :--- | :--- |
| `orderNumber` | ID único de la orden en Binance | Evita registrar dos veces la misma orden (llave primaria en base de datos). |
| `tradeType` | `BUY` (Compra) o `SELL` (Venta) | Define si entra inventario de cripto (`BUY`) o si sale inventario y se realiza ganancia (`SELL`). |
| `advertisementRole` | `MAKER` (tu propio anuncio) o `TAKER` (tomaste anuncio ajeno) | Determina cómo se aplica la comisión de Binance. |
| `asset` y `fiat` | Ej. `USDT` y `VES` / `COP` / `USD` / `ARS` / `MXN` / `EUR` | Permite llevar cajas e inventarios separados si operas en más de una moneda o cripto. |
| `amount` | Cantidad de cripto (ej. `500.00 USDT`) | Cantidad bruta de la operación. |
| `unitPrice` | Tasa o precio al que compraste o vendiste | Permite calcular el *spread* (brecha de ganancia) entre tu tasa de compra y tu tasa de venta. |
| `totalPrice` | Total en dinero Fiat recibido o enviado | Monto exacto que entró o salió de tu cuenta bancaria. |
| `commission` | Comisión cobrada por Binance en USDT | **Vital para no calcular ganancias falsas**: Si vendes `500 USDT` como Maker y la comisión es `0.75 USDT`, de tu cuenta salieron realmente `500.75 USDT`. |
| `orderStatus` | `COMPLETED`, `CANCELLED`, `TRADING`, `APPEALING` | El bot solo sumará al libro contable las órdenes con estado `COMPLETED`. |
| `payMethodName` | Nombre del banco o método de pago | Permite saber cuánto moviste por cada banco y aplicar comisiones bancarias específicas por banco. |
| `createTime` | Fecha y hora exacta en milisegundos | Permite agrupar ganancias por día, semana, mes y turno horario. |

---

## 3. Cómo debe calcular las ganancias el Bot (Lógica Financiera Real)

Un error muy común de quienes intentan hacer esto en un Excel básico es restar simplemente "Precio de Venta menos Precio de Compra". En la vida real del P2P, tú puedes hacer **5 compras de distintos montos y tasas** (`100 USDT a 40.00`, `250 USDT a 40.20`, `50 USDT a 40.10`) y luego hacer **8 ventas de montos distintos**.

Por eso, nuestro bot debe implementar los **2 métodos contables oficiales** (tú podrás elegir o ver ambos simultáneamente):

### Método 1: Costo Promedio Ponderado (WAC - *Weighted Average Cost*) — Recomendado para el día a día
El bot mantiene una "Bóveda Virtual / Inventario" en tiempo real:
1. **Cuando COMPRAS (`BUY`)**:
   - El bot suma los USDT netos que entraron a tu inventario y recalcula automáticamente a qué **tasa promedio real** te están costando todos los USDT que tienes en cartera (incluyendo la comisión que te cobró Binance y cualquier comisión bancaria).
2. **Cuando VENDES (`SELL`)**:
   - El bot toma los USDT vendidos (más la comisión de Binance), los multiplica por tu **Costo Promedio Actual** y lo compara contra el dinero Fiat que recibiste en el banco:
   $$\text{Ganancia Neta (Fiat)} = \text{Total Fiat Recibido} - \text{Impuesto Bancario} - (\text{USDT Total Descontado} \times \text{Tasa Costo Promedio})$$
   $$\text{Ganancia en USDT} = \frac{\text{Ganancia Neta (Fiat)}}{\text{Tasa de Venta}}$$

### Método 2: FIFO (*First-In, First-Out* / Primero en Entrar, Primero en Salir) — Ideal para Contadores e Impuestos
- Cada compra crea un "lote" con su tasa exacta.
- Cada vez que vendes, el bot descuenta los USDT de la compra más vieja que aún tenga saldo disponible y calcula la ganancia exacta contra ese lote específico. Es el método estándar exigido por la mayoría de las legislaciones fiscales y contadores.

---

## 4. Herramientas Modernas de Programación Seleccionadas (Stack Definitivo Confirmado)

> **Decisión de Arquitectura**: Sistema Full-Stack 100% en **TypeScript** con arquitectura moderna de alto rendimiento y tipado de extremo a extremo (End-to-End Type Safety).

### El Stack Definitivo del Proyecto (2026)

1. **Lenguaje Principal**: **`TypeScript 5+`** (Node.js v24+)
2. **Frontend (Dentro de Next.js App Router)**:
   - **`Next.js 15+` (App Router)**: Renderizado híbrido y servidor unificado.
   - **`Tailwind CSS v4` + `shadcn/ui`**: Sistema de diseño institucional basado en los prototipos de **Paper** (`Alpine` palette: `#F6F8F7`, `#FFFFFF`, `#0B1714`, `#059669`, `#D97706`).
   - **`TanStack Query v5` (`@tanstack/react-query`)**: Sincronización en tiempo real del libro de órdenes P2P, tasas multibancos en vivo (`Banesco`, `Pago Móvil`, `Mercantil`, `BBVA`) e invalidación automática de caché.
   - **`Zustand v5`**: Estado global ligero para filtros de período (`HOY` | `7 DÍAS` | `30 DÍAS`), método contable (`FIFO` | `WAC`), filtro de tipo de orden (`ALL` | `SELL` | `BUY`) y vista activa.
3. **Backend (Integrado dentro de Next.js en `src/app/api/[[...route]]/route.ts`)**:
   - **`Hono` (`hono` + `hono/vercel`)**: Router de API ultrarrápido con RPC tipado (`hc`) montado directamente dentro de Next.js para gestionar:
     - `/api/p2p/summary` (Cálculo de P&L por Lote y provisión del 16% SENIAT).
     - `/api/p2p/orders` (Libro diario de operaciones conciliadas + sincronización con Binance SAPI `/sapi/v1/c2c/orderMatch/listUserOrderHistory`).
     - `/api/p2p/banks` (Monitor Multibancos en Vivo para Venezuela).
     - `/api/p2p/closings` (Actas de Cierre Diario Inmutables a las `11:59 PM VET`).
     - `/api/p2p/vault` (Bóveda `AES-256-GCM` para llaves API de Binance con verificador estricto *Read-Only*).
     - `/api/p2p/export` (Generador de libros contables `.CSV` y `.XLSX` formato SENIAT 16%).
   - **`Better Auth` (`better-auth` + plugin `twoFactor`)**: Autenticación moderna en TypeScript con soporte nativo para **2FA (TOTP 6 dígitos)**, sesiones seguras `HttpOnly` y separación de roles (**`OPERATOR`** vs. **`AUDITOR_SENIAT`**).
   - **`Prisma ORM` + `Supabase` (PostgreSQL)**: Esquema relacional para usuarios, sesiones, bóveda API encriptada, órdenes P2P, lotes de inventario FIFO/WAC, actas de cierre de las 11:59 PM y bitácora de auditoría (`AuditLog`).
   - **`decimal.js`**: Matemática financiera exacta a 8 decimales para evitar errores de punto flotante en tasas, comisiones de Binance y cálculo del 16% de impuesto.

---

## 5. ¿Para qué sirve el Bot de Telegram y es obligatorio?

> **Respuesta corta**: **NO es obligatorio**. Si tú prefieres ver y controlar todo desde **tu propia interfaz web (en Next.js)**, el Dashboard Web será el corazón del proyecto.

### ¿Por qué algunos operadores le agregan Telegram como complemento?
El Bot de Telegram no reemplaza a tu interfaz web; funciona solo como un **"buscapersonas" o sistema de notificaciones en el bolsillo**:
1. **Alertas al celular sin abrir la web**: Si estás operando desde la app de Binance en el teléfono fuera de casa, cuando liberas una orden te salta una notificación de Telegram diciendo: *"Venta #2059 completada: Ganaste +$15.40 (1.8% de margen)"*.
2. **Consultas rápidas en 1 segundo**: Enviar un comando rápido desde el teléfono para ver a qué precio promedio tienes comprados tus USDT actuales antes de publicar un anuncio nuevo.

**Nuestra estrategia**: Construiremos **primero tu aplicación Web en Next.js + TypeScript** con su propia interfaz completa donde veas el margen de ganancia de cada operación. El módulo de Telegram (con la librería **`grammY`** para TypeScript) quedará como un extra opcional por si en el futuro quieres recibir notificaciones en el teléfono.

---

## 6. Reglas Operativas y Módulos Confirmados del Sistema (Benchmark: Crypto Edge Group Venezuela)

Tomando como referencia directa la suite contable **Crypto Edge Group (`cryptoedgegroup.com`)** y la captura de pantalla de sus módulos, estas son las **4 funcionalidades centrales** que construiremos en tu propio software (descartando por completo el módulo de *Calculadora de Arbitraje y Radar*):

### Módulo 1: Cálculo Automático de P&L (Ganancias y Pérdidas) por Lote (`EN VIVO`)
* **Qué hace**: El motor analiza cada orden de compra (`BUY`) y venta (`SELL`) en Binance P2P en tiempo real, deduce las comisiones de Binance (Maker/Taker) y calcula el **margen neto realizado** por lote.
* **Vista en tu Interfaz**:
  * Indicador `● EN VIVO`.
  * Selector rápido de período: **`HOY`**, **`7 DÍAS`**, **`30 DÍAS`** (más filtro por fechas personalizadas).
  * **Ganancia Neta Realizada** (en `USDT` y en `Bs. / VES`, ej. `+$142.50`).
  * **Spread Promedio** en porcentaje (ej. `+0.52%` o `+1.80%`).
  * **Contador de órdenes conciliadas** (ej. `482 órdenes concil.`).
  * **Tabla detallada de cada operación** donde ves exactamente cuánto ganaste en cada orden individual.

### Módulo 2: Monitor Multibancos en Vivo (Banca Venezolana)
* **Qué hace**: Muestra las tasas P2P actualizadas en vivo y el desglose de tu volumen/operaciones por cada método de pago de Venezuela:
  * **Banesco**
  * **Pago Móvil**
  * **Mercantil**
  * **BBVA Provincial**
  * *(Y cualquier otro banco que uses como Banco de Venezuela / Bancamiga).*
* **Cómo se conecta**: Además de clasificar tus órdenes históricas según el campo `payMethodName` que devuelve la API de Binance, consulta el endpoint público de anuncios de Binance P2P para mostrarte en vivo cómo se están moviendo las tasas de compra/venta en cada uno de esos bancos en Venezuela.

### Módulo 3: Cierres Diarios Automáticos a las 11:59 PM (Hora de Venezuela `UTC-4`)
* **Qué hace**: Generación automática del **Balance Diario Consolidado** en tu panel cada medianoche (`11:59 PM VET`) sin retrasos (**Conciliación Automática**).
* **Qué guarda cada Cierre Diario (`11:59 PM`)**:
  * Total USDT comprados y vendidos en el día.
  * Total Bolívares (`VES`) movilizados por banco.
  * Tasa promedio de compra vs. Tasa promedio de venta del día.
  * Total comisiones cobradas por Binance en el día.
  * **Utilidad Bruta del Día** (Ganancia antes de impuestos).
  * **Provisión de Impuestos (16% Venezuela)** del día.
  * **Utilidad Neta Libre del Día** (Lo que realmente te queda libre después de apartar el 16%).

### Módulo 4: Contabilidad de Impuestos (16% Venezuela) y Exportación Contable SENIAT
* **El problema legal/contable en Venezuela**: Cuando operas en P2P, por tus cuentas bancarias (Banesco, Mercantil, BBVA, Pago Móvil) entran y salen millones de Bolívares todos los días. Ante un contador o ante el **SENIAT**, **NO se paga impuesto sobre el total de Bolívares que entraron al banco** (porque eso es tu capital rotando una y otra vez), sino únicamente sobre el **margen o ganancia realizada** en cada operación.
* **Cómo lo resuelve nuestro Bot**:
  1. Separa matemáticamente en cada venta:
     - **Reembolso de Capital / Costo Base (No gravable)**: Lo que te costó comprar esos USDT.
     - **Ganancia / Utilidad Bruta de la Operación (Base Imponible)**: La diferencia positiva que ganaste en la operación.
  2. Calcula automáticamente el **16% de Impuesto** sobre la ganancia para que veas en todo momento en tu pantalla:
     - **Ganancia Bruta del Día**
     - **Impuesto Estimado (16%): `-Bs. X / -$Y USDT`**
     - **Ganancia Neta Libre (Después de Impuestos)**
  3. **Exportación Contable SENIAT (`.xlsx` y `.csv`)**: Un botón para descargar los libros contables depurados con las columnas exactas que necesita tu Contador Público en Venezuela (Fecha, N° Orden Binance, Banco, Monto USDT, Tasa Compra Base, Tasa Venta, Costo Base en Bs, Ingreso Bruto en Bs, Utilidad Neta Gravable en Bs, Impuesto 16% y Utilidad Libre).

*(Nota de alcance: Se elimina el módulo de "Calculadora de Arbitraje y Radar" que aparecía en la página de referencia, ya que no lo necesitamos).*

---

## 7. Arquitectura de Seguridad Bancaria y Control de Acceso (Login, 2FA, API Vault y Roles)

Al tratarse de un software contable real que maneja tu información financiera y fiscal ante el **SENIAT**, el sistema se diseña bajo una arquitectura **Zero-Custody (Cero Custodia)** con **5 capas de seguridad en TypeScript / Next.js**:

### Capa 1: Autenticación Fuerte + Segundo Factor (2FA TOTP)
* **Hash de Contraseñas con `Argon2id`**: Las contraseñas jamás se guardan en texto plano; se procesan con el algoritmo ganador del estándar criptográfico moderno (`Argon2id`, superior a `bcrypt`).
* **Código 2FA Obligatorio (TOTP de 6 dígitos)**: Compatible con **Google Authenticator / Authy / 1Password** mediante la librería `otplib` o `Better-Auth`. Aunque alguien conociera tu correo y contraseña, no puede entrar sin el código dinámico de 6 dígitos de tu teléfono.
* **Sesiones blindadas (`HttpOnly` + `Secure` + `SameSite=Strict`)**: El token de sesión viaja en cookies firmadas que el JavaScript del navegador no puede robar (inmune a ataques XSS), con expiración automática tras 8 horas o por inactividad.

### Capa 2: Bóveda Cifrada `AES-256-GCM` para tus API Keys de Binance
* **Cifrado en Reposo (Encryption at Rest)**: Cuando guardas tu `API Key` y tu `API Secret` de Binance en el sistema, el backend de Node.js utiliza el módulo nativo `node:crypto` con el algoritmo **`AES-256-GCM`** (usando una llave maestra de entorno `MASTER_ENCRYPTION_KEY` + vector de inicialización `IV` único y `AuthTag`).
* **Jamás viajan al Frontend**: Tu `API Secret` se desencripta **únicamente durante el milisegundo en memoria RAM del servidor** cuando el backend de Next.js firma la consulta hacia `https://api.binance.com/sapi/v1/c2c/orderMatch/listUserOrderHistory`. El navegador jamás recibe la llave secreta.

### Capa 3: Guardia de Permisos "Solo Lectura" (`Read-Only Enforcer`)
* En el momento en que conectas una API Key de Binance, nuestro sistema consulta primero el endpoint de permisos de la llave (`GET /sapi/v1/account/apiRestrictions`):
  * **Permitido (`✓`)**: `enableReading: true` (Lectura del historial C2C/P2P).
  * **Bloqueado (`×`)**: Si el sistema detecta que la API Key tiene activado `enableWithdrawals: true` (Retiros) o `enableSpotAndMarginTrading: true`, **rechaza la llave automáticamente** y te pide que desactives esos permisos en Binance. Así es matemáticamente imposible que el software mueva fondos.

### Capa 4: Separación de Roles (RBAC) — Operador vs. Contador / Auditor SENIAT
El Login incluye dos perfiles de acceso distintos:
1. **Rol `Operador / Dueño (Admin)`**: Tiene acceso al Dashboard P&L en vivo, configuración de la Bóveda API de Binance, gestión de usuarios y cierres diarios.
2. **Rol `Contador / Auditor SENIAT (Solo Lectura Contable)`**: Puedes darle un usuario a tu Contador Público Colegiado (CPC) para que entre directamente a descargar las **Actas de Cierre de las 11:59 PM** y los **Libros Excel/CSV del 16% SENIAT**, sin poder ver ni tocar tu configuración de API de Binance.

### Capa 5: Inmutabilidad de Actas (11:59 PM) y Bitácora de Auditoría (`Audit Log`)
* Cada cierre automático de las **11:59 PM VET** genera una firma `SHA-256` sobre los totales del día (Utilidad Bruta, Impuesto 16% SENIAT, Capital Rotado Exento y Utilidad Libre) para garantizar que el libro contable no sea alterado retroactivamente.
* Cada inicio de sesión, intento fallido o descarga de libros `.XLSX` queda registrado con fecha, hora VET y dirección IP en el **Audit Log en Vivo**.

---

## 8. Pantallas Diseñadas en Paper (`Welcome to Paper`)

1. **`01 — Login & Autenticación 2FA (LedgerP2P)`**:
   - Pantalla dividida de seguridad bancaria con selector de rol (**Operador / Dueño** vs. **Contador / Auditor SENIAT**), correo corporativo, contraseña `Argon2id` y entrada de 6 dígitos para **Authenticator 2FA (TOTP)**.
2. **`P2P Accounting Suite — Venezuela SENIAT (Desktop)` (Dashboard Principal en Vivo)**:
   - Los 4 módulos centrales (Cálculo Automático P&L por Lote con desglose de **Impuesto 16% SENIAT**, Monitor Multibancos Venezuela en vivo para Banesco/Pago Móvil/Mercantil/BBVA, Cierres Diarios 11:59 PM y Exportación Contable SENIAT) + Tabla detallada del **Libro Diario de Operaciones y Margen por Lote**.
3. **`03 — Seguridad API, Roles & Cierres 11:59 PM (LedgerP2P)`**:
   - Centro de mando donde administras tu **Bóveda Binance SAPI (`AES-256-GCM`)** con el semáforo de permisos (`Permitido: Solo Lectura C2C` / `Bloqueado: Retiros y Spot`), el panel de **Control de Roles (RBAC)** para invitar a tu contador, el historial de **Actas Inmutables de las 11:59 PM VET** y la barra inferior de **Audit Log en Vivo**.

---

## 9. Hoja de Ruta de Desarrollo (Next.js + TypeScript)

1. **Fase 1: Inicialización del Proyecto Full-Stack (Next.js + TypeScript + Tailwind + shadcn/ui)**
   - Crear la estructura del proyecto en `c:\Users\LEOFERSON\Desktop\bot`.
   - Configurar base de datos con **Prisma / Drizzle + SQLite** para guardar órdenes, lotes P&L y los cierres automáticos de las 11:59 PM.
2. **Fase 2: Conector API de Binance P2P en TypeScript**
   - Crear el servicio en Node.js/TypeScript que se autentica con tu API Key (Solo Lectura) en `GET /sapi/v1/c2c/orderMatch/listUserOrderHistory` y consulta tasas en vivo para Banesco, Pago Móvil, Mercantil y BBVA.
3. **Fase 3: Motor Contable de P&L por Lote + Impuesto 16% (`decimal.js`) + Cron 11:59 PM**
   - Programar el algoritmo de cálculo por lote (`HOY`, `7 DÍAS`, `30 DÍAS`), deducción de comisiones de Binance, cálculo del **16% de impuesto (Venezuela)** y el programador automático (`node-cron` en zona horaria `America/Caracas`) para el **Cierre Diario a las 11:59 PM**.
4. **Fase 4: Tu Propia Interfaz Web (Inspirada en los 4 Módulos Seleccionados) + Exportador SENIAT**
   - Construir el Dashboard con las 4 secciones clave (Cálculo P&L por Lote en Vivo, Monitor Multibancos Venezuela, Historial de Cierres 11:59 PM y Exportación Contable SENIAT en Excel/CSV + Tabla detallada de operaciones con su margen individual).
