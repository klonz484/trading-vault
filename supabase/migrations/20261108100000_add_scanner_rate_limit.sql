-- Trading Vault: enforce a per-user scanner request limit across serverless instances.
-- The table is private; authenticated users can only invoke the atomic RPC for themselves.

BEGIN;

CREATE TABLE IF NOT EXISTS public.scanner_rate_limits (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.scanner_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.scanner_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_scanner_rate_limit(
  p_window_seconds integer DEFAULT 60,
  p_max_requests integer DEFAULT 5
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_request_count integer;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_window_seconds < 1 OR p_window_seconds > 3600
     OR p_max_requests < 1 OR p_max_requests > 100 THEN
    RAISE EXCEPTION 'Invalid scanner rate-limit parameters';
  END IF;

  INSERT INTO public.scanner_rate_limits AS limits (
    user_id, window_started_at, request_count, updated_at
  )
  VALUES (v_user_id, pg_catalog.now(), 1, pg_catalog.now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    window_started_at = CASE
      WHEN limits.window_started_at <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
      THEN pg_catalog.now()
      ELSE limits.window_started_at
    END,
    request_count = CASE
      WHEN limits.window_started_at <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
      THEN 1
      ELSE limits.request_count + 1
    END,
    updated_at = pg_catalog.now()
  RETURNING request_count INTO v_request_count;

  RETURN v_request_count <= p_max_requests;
END;
$function$;

REVOKE ALL PRIVILEGES ON FUNCTION public.consume_scanner_rate_limit(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_scanner_rate_limit(integer, integer) TO authenticated;

COMMIT;
