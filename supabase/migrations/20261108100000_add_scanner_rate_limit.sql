-- Trading Vault: enforce a per-user scanner request limit across serverless instances.
-- The RPC is SECURITY INVOKER; RLS and grants keep event rows scoped to auth.uid().

BEGIN;

CREATE TABLE IF NOT EXISTS public.scanner_rate_limit_events (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

ALTER TABLE public.scanner_rate_limit_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS scanner_rate_limit_events_user_created_idx
  ON public.scanner_rate_limit_events (user_id, created_at DESC);

CREATE POLICY "Users can read their scanner rate-limit events"
  ON public.scanner_rate_limit_events
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can record their scanner rate-limit events"
  ON public.scanner_rate_limit_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND created_at <= pg_catalog.now() + interval '1 minute'
  );

CREATE POLICY "Users can only clean up expired scanner rate-limit events"
  ON public.scanner_rate_limit_events
  FOR DELETE
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND created_at < pg_catalog.now() - interval '1 hour'
  );

REVOKE ALL PRIVILEGES ON TABLE public.scanner_rate_limit_events FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.scanner_rate_limit_events TO authenticated;

CREATE OR REPLACE FUNCTION public.consume_scanner_rate_limit(
  p_window_seconds integer DEFAULT 60,
  p_max_requests integer DEFAULT 5
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz;
  v_recent_count bigint;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_window_seconds IS NULL OR p_max_requests IS NULL
     OR p_window_seconds < 1 OR p_window_seconds > 3600
     OR p_max_requests < 1 OR p_max_requests > 100 THEN
    RAISE EXCEPTION 'Invalid scanner rate-limit parameters';
  END IF;

  -- Serialize requests for one user so concurrent requests cannot all pass
  -- the count check before any of them records its event.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  v_now := pg_catalog.clock_timestamp();

  DELETE FROM public.scanner_rate_limit_events
  WHERE user_id = v_user_id
    AND created_at < v_now - interval '1 hour';

  SELECT count(*)
    INTO v_recent_count
  FROM public.scanner_rate_limit_events
  WHERE user_id = v_user_id
    AND created_at >= v_now - pg_catalog.make_interval(secs => p_window_seconds);

  IF v_recent_count >= p_max_requests THEN
    RETURN false;
  END IF;

  INSERT INTO public.scanner_rate_limit_events (user_id, created_at)
  VALUES (v_user_id, v_now);

  RETURN true;
END;
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION public.consume_scanner_rate_limit(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_scanner_rate_limit(integer, integer) TO authenticated;

COMMIT;
