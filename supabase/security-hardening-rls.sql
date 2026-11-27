-- =========================================================================
-- Hardening de Seguridad P0 (RLS) — Bot P2P Venezuela (Supabase PostgreSQL)
--
-- Script 100% idempotente y defensivo:
-- Solo aplica RLS y revoca permisos sobre las tablas que REALMENTE existen
-- en tu base de datos (no falla si alguna tabla opcional aún no fue creada).
--
-- IMPORTANTE: Ejecútalo en Supabase -> SQL Editor -> + New query -> Run.
-- =========================================================================

DO $$
DECLARE
  tbl TEXT;
  pol RECORD;
  target_tables TEXT[] := ARRAY[
    'p2p_users',
    'api_credentials',
    'p2p_orders',
    'daily_closings',
    'p2p_tax_config',
    'p2p_hourly_candles',
    'p2p_active_shifts',
    'p2p_shift_closures',
    'p2p_daily_total_closures',
    'p2p_sync_state',
    'p2p_sync_day_coverage'
  ];
BEGIN
  FOREACH tbl IN ARRAY target_tables
  LOOP
    IF to_regclass(format('public.%I', tbl)) IS NOT NULL THEN
      -- 1. Activar RLS en la tabla
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);

      -- 2. Eliminar cualquier política abierta existente sobre esta tabla
      FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = tbl
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, tbl);
      END LOOP;

      -- 3. Revocar todo acceso directo a roles públicos (anon / authenticated)
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated;', tbl);

      -- 4. Mantener acceso exclusivo al backend (service_role)
      EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role;', tbl);
    END IF;
  END LOOP;
END $$;
