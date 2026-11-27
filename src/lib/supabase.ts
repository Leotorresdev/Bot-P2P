import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/env";

const supabaseKey =
  env.SUPABASE_SERVICE_ROLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "⚠️ [Supabase] SUPABASE_SERVICE_ROLE_KEY no está configurada. " +
      "Configúrala en .env y Vercel antes de cerrar las políticas RLS para 'anon'."
  );
}

/**
 * Cliente privilegiado de Supabase exclusivamente para el servidor (`server-only`).
 * Usa `SUPABASE_SERVICE_ROLE_KEY` para operar detrás de Hono con RLS cerrado a `anon`.
 */
export const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    fetch: (url, options = {}) => {
      const headers = new Headers(options.headers);
      headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
      return fetch(url, {
        ...options,
        cache: "no-store",
        headers,
      });
    },
  },
});
