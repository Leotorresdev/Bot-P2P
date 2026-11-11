-- =========================================================================
-- Esquema SQL Oficial — Bot P2P Venezuela (Supabase PostgreSQL)
-- Copia y ejecuta este script en el "SQL Editor" de tu proyecto Supabase:
-- https://supabase.com/dashboard/project/knwgldaoewqljjcnsjrs/sql/new
-- =========================================================================

-- 1. Tabla de Operadores (Usuarios del Bot)
CREATE TABLE IF NOT EXISTS public.p2p_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  totp_secret TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'OPERATOR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabla de Bóveda de Claves API de Binance (Cifradas con AES-256-GCM)
CREATE TABLE IF NOT EXISTS public.api_credentials (
  user_id TEXT PRIMARY KEY REFERENCES public.p2p_users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT 'Binance P2P Principal',
  api_key_masked TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  api_secret_encrypted TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  is_read_only_verified BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tabla de Órdenes P2P Conciliadas
CREATE TABLE IF NOT EXISTS public.p2p_orders (
  order_number TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.p2p_users(id) ON DELETE CASCADE,
  time_vet_label TEXT NOT NULL,
  trade_type TEXT NOT NULL CHECK (trade_type IN ('BUY', 'SELL')),
  advertisement_role TEXT NOT NULL DEFAULT 'MAKER',
  pay_method_name TEXT NOT NULL,
  counter_part_nick_name TEXT NOT NULL,
  amount_usdt TEXT NOT NULL,
  commission_usdt TEXT NOT NULL,
  unit_price_ves TEXT NOT NULL,
  cost_basis_rate_ves TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Tabla de Actas de Cierre Diario (11:59 PM VET)
CREATE TABLE IF NOT EXISTS public.daily_closings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES public.p2p_users(id) ON DELETE CASCADE,
  closing_date_label TEXT NOT NULL,
  closing_iso_date TEXT NOT NULL,
  executed_at_vet TEXT NOT NULL DEFAULT '23:59:00 VET',
  reconciled_orders INTEGER NOT NULL DEFAULT 0,
  total_volume_usdt TEXT NOT NULL,
  gross_profit_usdt TEXT NOT NULL,
  gross_profit_ves TEXT NOT NULL,
  seniat_tax_16_usdt TEXT NOT NULL,
  seniat_tax_16_ves TEXT NOT NULL,
  net_free_profit_usdt TEXT NOT NULL,
  net_free_profit_ves TEXT NOT NULL,
  integrity_hash_sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, closing_iso_date)
);

-- 5. Configuración Fiscal Personalizada por Operador
CREATE TABLE IF NOT EXISTS public.p2p_tax_config (
  user_id TEXT PRIMARY KEY REFERENCES public.p2p_users(id) ON DELETE CASCADE,
  seniat_tax_percent DOUBLE PRECISION NOT NULL DEFAULT 16,
  maker_fee_percent DOUBLE PRECISION NOT NULL DEFAULT 0.163,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Velas Horarias 24/7 (1 Vela por cada Hora exacta - Hora Venezuela UTC-4)
CREATE TABLE IF NOT EXISTS public.p2p_hourly_candles (
  bank_name TEXT NOT NULL,
  hour_bucket_utc BIGINT NOT NULL,
  hour_label_vet TEXT NOT NULL,
  open DOUBLE PRECISION NOT NULL,
  high DOUBLE PRECISION NOT NULL,
  low DOUBLE PRECISION NOT NULL,
  close DOUBLE PRECISION NOT NULL,
  buy_open DOUBLE PRECISION NOT NULL,
  buy_close DOUBLE PRECISION NOT NULL,
  samples_count INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bank_name, hour_bucket_utc)
);

CREATE INDEX IF NOT EXISTS idx_p2p_hourly_candles_bank_bucket
  ON public.p2p_hourly_candles (bank_name, hour_bucket_utc DESC);

-- 7. Permisos y Políticas de Acceso (RLS)
ALTER TABLE public.p2p_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p2p_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p2p_tax_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.p2p_hourly_candles ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para la API Backend
DROP POLICY IF EXISTS "Allow Backend MVP Access Users" ON public.p2p_users;
CREATE POLICY "Allow Backend MVP Access Users" ON public.p2p_users FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow Backend MVP Access Credentials" ON public.api_credentials;
CREATE POLICY "Allow Backend MVP Access Credentials" ON public.api_credentials FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow Backend MVP Access Orders" ON public.p2p_orders;
CREATE POLICY "Allow Backend MVP Access Orders" ON public.p2p_orders FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow Backend MVP Access Closings" ON public.daily_closings;
CREATE POLICY "Allow Backend MVP Access Closings" ON public.daily_closings FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow Backend MVP Access TaxConfig" ON public.p2p_tax_config;
CREATE POLICY "Allow Backend MVP Access TaxConfig" ON public.p2p_tax_config FOR ALL TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow Backend MVP Access HourlyCandles" ON public.p2p_hourly_candles;
CREATE POLICY "Allow Backend MVP Access HourlyCandles" ON public.p2p_hourly_candles FOR ALL TO public USING (true) WITH CHECK (true);

GRANT ALL ON TABLE public.p2p_users TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.api_credentials TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.p2p_orders TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.daily_closings TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.p2p_tax_config TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.p2p_hourly_candles TO anon, authenticated, service_role;

-- 8. Recolección 24/7 Automática en la Nube (Opcional con pg_cron + pg_net en Supabase)
-- Activa las extensiones pg_cron y pg_net en Dashboard -> Database -> Extensions y ejecuta:
-- SELECT cron.schedule(
--   'collect-p2p-hourly-candles-24-7',
--   '*/5 * * * *',
--   $$ SELECT net.http_get(url := 'https://bot-p2-p.vercel.app/api/p2p/collect-candles'); $$
-- );

-- 9. Insertar tu cuenta registrada para que puedas iniciar sesión de inmediato
INSERT INTO public.p2p_users (
  id,
  email,
  full_name,
  password_hash,
  password_salt,
  totp_secret,
  role,
  created_at
) VALUES (
  'usr_d4e833cc-84c',
  'leofersontp0912@gmail.com',
  'leoferson torres',
  '31c26b97f3e5a6fa583db4bd9708d0048b4a50df651d3aae1c4fdbcf356c438345357a663916ea1f29fbf367d39d193a8daa62d2fac492aba60302ba002d29cc',
  'a9a48a69e269e9f2c31039079f5e66b3',
  'LV2X56HYBEHVIWNI',
  'OPERATOR',
  NOW()
) ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  password_salt = EXCLUDED.password_salt,
  totp_secret = EXCLUDED.totp_secret;
