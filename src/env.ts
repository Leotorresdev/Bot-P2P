import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL debe ser una URL válida de Supabase"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(15, "NEXT_PUBLIC_SUPABASE_ANON_KEY es requerido"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(15, "SUPABASE_SERVICE_ROLE_KEY debe ser una llave secreta válida de Supabase")
    .optional(),
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET debe tener al menos 32 caracteres"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  MASTER_ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[0-9a-fA-F]{64}$/,
      "MASTER_ENCRYPTION_KEY debe ser una cadena hexadecimal exacta de 64 caracteres (32 bytes para AES-256-GCM)"
    ),
  CRON_SECRET: z
    .string()
    .min(16, "CRON_SECRET debe tener al menos 16 caracteres")
    .optional(),
  ALLOWED_ORIGINS: z.string().optional(),
  SENIAT_TAX_RATE: z.coerce.number().min(0).max(1).default(0.16),
  TIMEZONE: z.string().default("America/Caracas"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

function resolveDefaultAppUrl(): string {
  if (process.env.BETTER_AUTH_URL) {
    return process.env.BETTER_AUTH_URL;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "http://localhost:3000";
}

function validateServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: resolveDefaultAppUrl(),
    MASTER_ENCRYPTION_KEY: process.env.MASTER_ENCRYPTION_KEY,
    CRON_SECRET: process.env.CRON_SECRET || undefined,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || undefined,
    SENIAT_TAX_RATE: process.env.SENIAT_TAX_RATE ?? "0.16",
    TIMEZONE: process.env.TIMEZONE ?? "America/Caracas",
  });

  if (!parsed.success) {
    console.error(
      "❌ Error crítico de validación de variables de entorno:",
      parsed.error.flatten().fieldErrors
    );
    throw new Error(
      "Configuración de variables de entorno inválida. Revisa tu archivo .env o las variables en Vercel."
    );
  }

  return parsed.data;
}

export const env = validateServerEnv();
