-- Trading Vault: private MT5 connector credentials and durable ingest batches.
-- This migration is intentionally staged in Git only; it must be reviewed and
-- applied separately before the endpoint can accept live collector traffic.

BEGIN;

CREATE TABLE IF NOT EXISTS public.mt5_connector_credentials (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker_id text NOT NULL CHECK (broker_id IN ('RCG_MARKETS', 'VAULT_MARKETS')),
  terminal_instance_id text NOT NULL CHECK (pg_catalog.length(terminal_instance_id) BETWEEN 1 AND 128),
  token_hash text NOT NULL UNIQUE CHECK (pg_catalog.length(token_hash) = 64),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS mt5_connector_credentials_active_terminal_idx
  ON public.mt5_connector_credentials (broker_id, terminal_instance_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS mt5_connector_credentials_owner_idx
  ON public.mt5_connector_credentials (user_id, broker_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.mt5_connector_credentials ENABLE ROW LEVEL SECURITY;
-- No client-facing policies: credential records are server-only.

CREATE TABLE IF NOT EXISTS public.mt5_ingest_batches (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  broker_id text NOT NULL CHECK (broker_id IN ('RCG_MARKETS', 'VAULT_MARKETS')),
  batch_id text NOT NULL CHECK (pg_catalog.length(batch_id) BETWEEN 1 AND 128),
  terminal_instance_id text NOT NULL CHECK (pg_catalog.length(terminal_instance_id) BETWEEN 1 AND 128),
  payload_hash text NOT NULL CHECK (pg_catalog.length(payload_hash) = 64),
  sent_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  candle_count integer NOT NULL CHECK (candle_count >= 0),
  tick_count integer NOT NULL CHECK (tick_count >= 0),
  candles jsonb NOT NULL,
  ticks jsonb NOT NULL,
  CONSTRAINT mt5_ingest_batches_broker_batch_unique UNIQUE (broker_id, batch_id)
);

CREATE INDEX IF NOT EXISTS mt5_ingest_batches_received_idx
  ON public.mt5_ingest_batches (broker_id, received_at DESC);

ALTER TABLE public.mt5_ingest_batches ENABLE ROW LEVEL SECURITY;
-- No client-facing policies: raw broker observations remain server-only.

REVOKE ALL PRIVILEGES ON TABLE public.mt5_connector_credentials FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.mt5_ingest_batches FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.mt5_connector_credentials TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.mt5_ingest_batches TO service_role;

COMMIT;
