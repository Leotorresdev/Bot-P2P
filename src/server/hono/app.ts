import "server-only";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { secureHeaders } from "hono/secure-headers";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import crypto from "node:crypto";
import { env } from "@/env";
import { auth } from "@/server/auth/better-auth";
import {
  GetBanksQuerySchema,
  GetChartDataQuerySchema,
  GetOrdersQuerySchema,
  GetSummaryQuerySchema,
  LoginCredentialsSchema,
  RegisterUserSchema,
  SaveBinanceVaultBodySchema,
  UpdateTaxConfigSchema,
  VerifyPasswordSchema,
  type LoginVaultResponseDto,
  type RegisterUserResponseDto,
  type UserRoleType,
} from "@/features/p2p-ledger/schemas/p2p.schemas";
import {
  SESSION_COOKIE_NAME,
  createSignedSessionToken,
  generateTotpSecret,
  hashPassword,
  verifyPasswordHash,
  verifySignedSessionToken,
  verifyTotpCode,
} from "@/server/security/crypto-vault";
import { SupabaseVaultRepository } from "@/server/db/supabase-vault.repository";
import { P2PAccountingService } from "@/server/services/p2p-accounting.service";
import { BinanceP2PLiveService } from "@/server/services/binance-p2p-live.service";

export interface AuthenticatedUserContext {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: UserRoleType;
}

type HonoEnv = {
  Variables: {
    requestId: string;
    user: AuthenticatedUserContext | null;
  };
};

// Rate Limiter ligero en memoria por IP (Protección Anti-Abuso / Brute-Force)
const ipRateLimitStore = new Map<
  string,
  { count: number; windowResetAt: number }
>();

const loginBruteForceStore = new Map<
  string,
  { attempts: number; resetAt: number }
>();

const baseApp = new Hono<HonoEnv>().basePath("/api");

// 1. Middlewares Globales de Endurecimiento (OWASP)
baseApp.use("*", secureHeaders());
baseApp.use(
  "*",
  cors({
    origin: env.BETTER_AUTH_URL,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Ledger-Role"],
    credentials: true,
  })
);
baseApp.use("*", csrf({ origin: env.BETTER_AUTH_URL }));

// 2. RequestId + Rate Limiting + Resolución Estricta de Sesión (Sin usuarios falsos por defecto)
baseApp.use("*", async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set("requestId", requestId);
  c.header("X-Request-Id", requestId);

  const clientIp =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
  const now = Date.now();
  const currentRecord = ipRateLimitStore.get(clientIp);

  if (!currentRecord || now > currentRecord.windowResetAt) {
    ipRateLimitStore.set(clientIp, {
      count: 1,
      windowResetAt: now + 60_000,
    });
  } else {
    currentRecord.count += 1;
    if (currentRecord.count > 120) {
      return c.json(
        {
          error: "Demasiadas solicitudes. Por favor espera 60 segundos.",
          requestId,
        },
        429
      );
    }
  }

  let resolvedUser: AuthenticatedUserContext | null = null;
  const sessionToken = getCookie(c, SESSION_COOKIE_NAME);
  const verifiedPayload = verifySignedSessionToken(sessionToken);

  if (verifiedPayload) {
    const roleHeader = c.req.header("x-ledger-role");
    const effectiveRole: UserRoleType =
      roleHeader === "AUDITOR_SENIAT" ? "AUDITOR_SENIAT" : "OPERATOR";
    resolvedUser = {
      id: verifiedPayload.userId,
      email: verifiedPayload.email,
      name: verifiedPayload.name,
      role: effectiveRole,
    };
  }

  c.set("user", resolvedUser);
  await next();
});

// 3. Manejador Global de Excepciones
baseApp.onError((err, c) => {
  const requestId = c.get("requestId") ?? "req_unknown";
  console.error(`[Hono Error][RequestId: ${requestId}]`, err);

  return c.json(
    {
      error:
        env.NODE_ENV === "production"
          ? "Error interno procesando la operación contable."
          : err.message,
      requestId,
    },
    500
  );
});

// 4. Montaje de Rutas de Better Auth (`/api/auth/*`)
baseApp.on(["GET", "POST"], "/auth/**", (c) => {
  return auth.handler(c.req.raw);
});

// 5. Rutas Encadenadas de Hono RPC (`export type AppType = typeof routes`)
export const routes = baseApp
  .post(
    "/p2p/register",
    zValidator("json", RegisterUserSchema),
    async (c) => {
      const payload = c.req.valid("json");
      const existing = await SupabaseVaultRepository.findUserByEmail(
        payload.email
      );

      if (existing) {
        return c.json(
          {
            error:
              "Este correo electrónico ya está registrado. Por favor inicia sesión.",
          },
          409
        );
      }

      const { passwordHash, passwordSalt } = hashPassword(payload.password);
      const totpSecret = generateTotpSecret(16);
      const newUserId = `usr_${crypto.randomUUID().slice(0, 12)}`;

      const createdUser = await SupabaseVaultRepository.createUser({
        id: newUserId,
        email: payload.email.trim().toLowerCase(),
        fullName: payload.fullName.trim(),
        passwordHash,
        passwordSalt,
        totpSecret,
        role: "OPERATOR",
        createdAt: new Date().toISOString(),
      });

      const sessionToken = createSignedSessionToken({
        id: createdUser.id,
        email: createdUser.email,
        name: createdUser.fullName,
      });

      setCookie(c, SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        path: "/",
        sameSite: "Lax",
        secure: env.NODE_ENV === "production",
        maxAge: 8 * 60 * 60,
      });

      const otpauthUrl = `otpauth://totp/BotP2P:${encodeURIComponent(
        createdUser.email
      )}?secret=${totpSecret}&issuer=BotP2P`;

      const responseData: RegisterUserResponseDto = {
        success: true,
        userId: createdUser.id,
        email: createdUser.email,
        fullName: createdUser.fullName,
        role: "OPERATOR",
        totpSecret,
        otpauthUrl,
        message: "Cuenta creada con éxito en Bot P2P.",
      };

      return c.json(
        {
          message: "Tu cuenta ha sido creada exitosamente.",
          data: responseData,
        },
        201
      );
    }
  )
  .post(
    "/p2p/login-vault",
    zValidator("json", LoginCredentialsSchema),
    async (c) => {
      const clientIp =
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
      const now = Date.now();
      const bruteRecord = loginBruteForceStore.get(clientIp);

      if (bruteRecord && now < bruteRecord.resetAt) {
        if (bruteRecord.attempts >= 10) {
          return c.json(
            {
              error:
                "Demasiados intentos fallidos. Por seguridad espera 60 segundos.",
            },
            429
          );
        }
        bruteRecord.attempts += 1;
      } else {
        loginBruteForceStore.set(clientIp, {
          attempts: 1,
          resetAt: now + 60_000,
        });
      }

      const payload = c.req.valid("json");
      const userRecord = await SupabaseVaultRepository.findUserByEmail(
        payload.email
      );

      if (!userRecord) {
        return c.json(
          {
            error: "Correo electrónico o contraseña incorrectos.",
          },
          401
        );
      }

      const isPasswordValid = verifyPasswordHash(
        payload.password,
        userRecord.passwordHash,
        userRecord.passwordSalt
      );

      if (!isPasswordValid) {
        return c.json(
          {
            error: "Correo electrónico o contraseña incorrectos.",
          },
          401
        );
      }

      const isTotpValid = verifyTotpCode(
        userRecord.totpSecret,
        payload.totpCode
      );

      if (!isTotpValid) {
        return c.json(
          {
            error:
              "El código de 6 dígitos de Google Authenticator es incorrecto o ha expirado.",
          },
          401
        );
      }

      // Login exitoso: Reiniciar contador de fuerza bruta y emitir cookie HttpOnly
      loginBruteForceStore.delete(clientIp);

      const sessionToken = createSignedSessionToken({
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.fullName,
      });

      setCookie(c, SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        path: "/",
        sameSite: "Lax",
        secure: env.NODE_ENV === "production",
        maxAge: 8 * 60 * 60,
      });

      const responseData: LoginVaultResponseDto = {
        sessionId: `ses_${crypto.randomUUID().slice(0, 12)}`,
        role: "OPERATOR",
        email: userRecord.email,
        authorizedIp: "Conectado",
        maxSessionHours: 8,
        redirectTo: "/",
      };

      return c.json(
        {
          message: "Sesión iniciada con éxito.",
          data: responseData,
        },
        200
      );
    }
  )
  .post("/p2p/logout", async (c) => {
    deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
    return c.json(
      {
        message: "Sesión cerrada exitosamente.",
      },
      200
    );
  })
  .post(
    "/p2p/verify-password",
    zValidator("json", VerifyPasswordSchema),
    async (c) => {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "Sesión no autorizada." }, 401);
      }

      const { password } = c.req.valid("json");
      const userRecord = await SupabaseVaultRepository.findUserById(user.id);

      if (!userRecord) {
        return c.json({ error: "Usuario no encontrado." }, 401);
      }

      const isValid = verifyPasswordHash(
        password,
        userRecord.passwordHash,
        userRecord.passwordSalt
      );

      if (!isValid) {
        return c.json(
          {
            error:
              "Contraseña incorrecta. Ingresa la contraseña de tu cuenta de operador.",
          },
          401
        );
      }

      return c.json({ verified: true }, 200);
    }
  )
  .get("/p2p/me", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "No autenticado" }, 401);
    }
    if (!user.name) {
      const userRecord = await SupabaseVaultRepository.findUserById(user.id);
      if (userRecord?.fullName) {
        return c.json({ data: { ...user, name: userRecord.fullName } }, 200);
      }
    }
    return c.json({ data: user }, 200);
  })
  .get(
    "/p2p/summary",
    zValidator("query", GetSummaryQuerySchema),
    async (c) => {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "No autenticado. Inicia sesión en /login" }, 401);
      }
      const { period, method } = c.req.valid("query");
      const summary = await P2PAccountingService.getSummary(
        user.id,
        period,
        method
      );
      return c.json({ data: summary }, 200);
    }
  )
  .get(
    "/p2p/banks",
    zValidator("query", GetBanksQuerySchema),
    async (c) => {
      const { amount, buyAmount, sellAmount } = c.req.valid("query");
      const effectiveBuyAmount = buyAmount ?? amount ?? 100_000;
      const effectiveSellAmount = sellAmount ?? amount ?? 100_000;
      const banks = await BinanceP2PLiveService.getLiveBrechas(
        effectiveBuyAmount,
        effectiveSellAmount
      );
      return c.json({ data: banks }, 200);
    }
  )
  .get(
    "/p2p/chart-data",
    zValidator("query", GetChartDataQuerySchema),
    async (c) => {
      const { bank, timeframe } = c.req.valid("query");
      const chartData = await BinanceP2PLiveService.getBankChartData(
        bank,
        timeframe
      );
      return c.json({ data: chartData }, 200);
    }
  )
  .get("/p2p/collect-candles", async (c) => {
    const result = await BinanceP2PLiveService.collectHourlyCandlesSnapshot();
    return c.json({ data: result }, 200);
  })
  .post("/p2p/sync-binance", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "No autenticado. Inicia sesión en /login" }, 401);
    }

    const orders = await P2PAccountingService.getUserOrdersFromVaultOrBinance(
      user.id
    );
    return c.json(
      {
        message: `Sincronización completada. Se encontraron ${orders.length} órdenes conciliadas.`,
        data: { count: orders.length },
      },
      200
    );
  })
  .post("/p2p/test-binance", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "No autenticado. Inicia sesión en /login" }, 401);
    }

    const result = await P2PAccountingService.testBinanceConnection(user.id);
    if (!result.success) {
      return c.json({ error: result.message, data: result }, 400);
    }
    return c.json({ message: result.message, data: result }, 200);
  })
  .get(
    "/p2p/orders",
    zValidator("query", GetOrdersQuerySchema),
    async (c) => {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "No autenticado. Inicia sesión en /login" }, 401);
      }
      const { tradeType, bank, date, page, limit } = c.req.valid("query");
      const result = await P2PAccountingService.getPaginatedOrders({
        userId: user.id,
        tradeType,
        bank,
        date,
        page,
        limit,
      });
      return c.json({ data: result }, 200);
    }
  )
  .get("/p2p/closings", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "No autenticado. Inicia sesión en /login" }, 401);
    }
    let userName = user.name;
    if (!userName) {
      const userRecord = await SupabaseVaultRepository.findUserById(user.id);
      userName = userRecord?.fullName || "Dueño Principal";
    }
    const closingsData = await P2PAccountingService.getDailyClosings(user.id);
    return c.json(
      {
        data: {
          ...closingsData,
          userName,
        },
      },
      200
    );
  })
  .post(
    "/p2p/vault",
    zValidator("json", SaveBinanceVaultBodySchema),
    async (c) => {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "No autenticado. Inicia sesión en /login" }, 401);
      }

      if (user.role === "AUDITOR_SENIAT") {
        return c.json(
          {
            error:
              "Acceso denegado: El Modo Contador no tiene permisos sobre la Bóveda API de Binance.",
          },
          403
        );
      }

      const payload = c.req.valid("json");
      const savedVault = await P2PAccountingService.saveBinanceVaultCredentials({
        userId: user.id,
        label: payload.label,
        apiKey: payload.apiKey,
        apiSecret: payload.apiSecret,
      });

      return c.json(
        {
          message:
            "Llave de Solo Lectura cifrada con AES-256-GCM y guardada exitosamente.",
          data: savedVault,
        },
        201
      );
    }
  )
  .get("/p2p/tax-config", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ error: "No autenticado. Inicia sesión en /login" }, 401);
    }
    const config = await P2PAccountingService.getUserTaxConfig(user.id);
    return c.json({ data: config }, 200);
  })
  .post(
    "/p2p/tax-config",
    zValidator("json", UpdateTaxConfigSchema),
    async (c) => {
      const user = c.get("user");
      if (!user) {
        return c.json({ error: "No autenticado. Inicia sesión en /login" }, 401);
      }
      if (user.role === "AUDITOR_SENIAT") {
        return c.json(
          {
            error:
              "Acceso denegado: El Modo Contador no tiene permisos para modificar la configuración fiscal.",
          },
          403
        );
      }
      const payload = c.req.valid("json");
      const updated = await P2PAccountingService.updateUserTaxConfig(
        user.id,
        payload
      );
      return c.json(
        {
          message: `Tasas actualizadas exitosamente: SENIAT ${updated.seniatTaxPercent}% y Comisión ${updated.makerFeePercent}%.`,
          data: updated,
        },
        200
      );
    }
  )
  .get("/p2p/export-csv", async (c) => {
    const user = c.get("user");
    if (!user) {
      return c.redirect("/login");
    }

    const dateParam = c.req.query("date") || undefined;
    const [ordersResult, taxConfig] = await Promise.all([
      P2PAccountingService.getPaginatedOrders({
        userId: user.id,
        tradeType: "ALL",
        date: dateParam,
        page: 1,
        limit: 5000,
      }),
      P2PAccountingService.getUserTaxConfig(user.id),
    ]);

    const items = ordersResult.items;
    const seniatVesHeader = `Impuesto_SENIAT_${taxConfig.seniatTaxPercent}_VES`;
    const seniatUsdtHeader = `Impuesto_SENIAT_${taxConfig.seniatTaxPercent}_USDT`;

    const csvHeader = [
      "Orden_Binance",
      "Fecha_Hora_VET",
      "Tipo",
      "Rol",
      "Banco_Nacional",
      "Contraparte",
      "Monto_USDT",
      "Comision_Binance_USDT",
      "Tasa_Operacion_VES",
      "Tasa_Costo_Base_VES",
      "Total_Banco_VES",
      "Capital_Rotado_Exento_VES",
      seniatVesHeader,
      seniatUsdtHeader,
      "Ganancia_Neta_Libre_VES",
      "Ganancia_Neta_Libre_USDT",
      "Margen_Porcentaje",
    ].join(",");

    const csvRows = items.map((row) =>
      [
        row.orderNumber,
        `"${row.timeVetLabel}"`,
        row.tradeType,
        row.advertisementRole,
        `"${row.payMethodName}"`,
        `"${row.counterPartNickName}"`,
        row.amountUsdt,
        row.commissionUsdt,
        row.unitPriceVes,
        row.costBasisRateVes,
        row.totalPriceVes,
        row.exemptCapitalVes,
        row.seniatTax16Ves,
        row.seniatTax16Usdt,
        row.netFreeProfitVes,
        row.netFreeProfitUsdt,
        `${row.marginPercent}%`,
      ].join(",")
    );

    const csvString = [csvHeader, ...csvRows].join("\n");
    const filenameDate = (dateParam && dateParam !== "ALL")
      ? dateParam.replace(/\//g, "-")
      : new Date().toISOString().slice(0, 10);

    return new Response(csvString, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="Registro_Diario_24H_SENIAT_${taxConfig.seniatTaxPercent}_P2P_${filenameDate}.csv"`,
      },
    });
  });

export type AppType = typeof routes;
export { baseApp as honoApp };
