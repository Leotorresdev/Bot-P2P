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
  SENIAT_TAX_RATE: z.coerce.number().min(0).max(1).default(0.16),
  TIMEZONE: z.string().default("America/Caracas"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

function validateServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      "https://knwgldaoewqljjcnsjrs.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
      "sb_publishable_atUc71tYjYWvT2tOSc18HQ_3bt2ypo2",
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET ??
      "8c4e9b2a7f1d6e3c5a0b9f8e7d2c4b6a1e3f5d7c9b0a2e4f6d8c1b3a5e7f9d0c",
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    MASTER_ENCRYPTION_KEY:
      process.env.MASTER_ENCRYPTION_KEY ??
      "4a9f2e7c1b8d3f6a5e0c9b4d2f7a1e8c3b6d9f0a4e2c7b5d1f8a3e6c9b2d4f7a",
    SENIAT_TAX_RATE: process.env.SENIAT_TAX_RATE ?? "0.16",
    TIMEZONE: process.env.TIMEZONE ?? "America/Caracas",
  });

  if (!parsed.success) {
    console.error(
      "❌ Error crítico de validación de variables de entorno:",
      parsed.error.flatten().fieldErrors
    );
    throw new Error("Configuración de variables de entorno inválida.");
  }

  return parsed.data;
}

export const env = validateServerEnv();
