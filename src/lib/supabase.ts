import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://knwgldaoewqljjcnsjrs.supabase.co";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_atUc71tYjYWvT2tOSc18HQ_3bt2ypo2";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
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
