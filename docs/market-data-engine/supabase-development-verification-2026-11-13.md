# Trading Vault Development Supabase verification — 2026-11-13

## Project isolation

Read-only Supabase project inventory confirmed:

- Development: `TradingVault-Development`, project ref `uahimfyknsxckfatxccd`, region `eu-west-1`, status `ACTIVE_HEALTHY`, PostgreSQL 17.11.
- Production: `vilakazibayanda286-del's Project`, project ref `ykzddoeqpnosnwzwhsko`, region `eu-west-2`, status `ACTIVE_HEALTHY`, PostgreSQL 17.11.
- Development and Production are separate Supabase projects with distinct project refs and database hosts.
- Development branch inventory is empty; the Development project itself is a separate project, not a database branch.
- No data or schema was copied from Production as part of this verification.

## Development migration and schema state

Development migration history currently contains:

- `20261113085338` — `add_private_mt5_ingestion`
- `20261113085351` — `mt5_ingestion_transport`
- `20261113100657` — `add_scanner_rate_limit_rpc`

The Development database contains the MT5 ingestion tables:

- `public.mt5_connector_credentials`
- `public.mt5_ingest_batches`
- `public.mt5_ingest_rate_limits`

All three have RLS enabled and zero rows. The credential table binds a token hash to a user, broker and terminal instance. Batch records retain the original JSON payload and payload hash. Rate limits are credential-scoped.

No migration was applied during this verification.

## Least-privilege verification

Read-only SQL checks confirmed:

- No direct table grants to `anon` or `authenticated` on the three MT5 ingestion tables.
- `service_role` has the required server-side table privileges.
- `consume_mt5_ingest_rate_limit(uuid, integer, integer)` is SECURITY INVOKER with an empty search_path.
- The rate-limit function is executable by `service_role`; `anon` and `authenticated` cannot execute it.
- No RLS policies exist on the three MT5 tables. This is intentional for server-only tables because public client roles have no table grants; RLS remains enabled as defense in depth. Do not add user-facing policies to these tables.

The Supabase Security Advisor reports an informational `rls_enabled_no_policy` finding for the three MT5 tables and the private scanner rate-limit table. These are server-only tables and are not intended for direct client access. The absence of policies is intentional, not a request to expose them.

## Security finding still requiring attention

The Development project's Supabase Security Advisor reports:

- **Warning: leaked password protection disabled.**

Enable leaked-password protection before enabling broad/public registration or treating account security as launch-ready. No Auth configuration was changed during this read-only check.

## Data API exposure

Supabase's October 30, 2026 platform change requires explicit grants for newly created public tables to be reachable through the Data API. The MT5 tables have explicit server-role grants only, which is the intended design for this server-only ingestion path. Do not grant `anon` or `authenticated` access merely to silence an advisor or make the endpoint work.

Reference: https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically

## Endpoint integration caveat

The current v1 Next.js ingestion route uses the Supabase Data API through a server-side secret key. Before any Preview test, verify the Development project's Data API endpoint can resolve these explicitly granted service-role tables and the RPC function. A failure must be fixed with narrowly scoped server-role grants or correct project configuration, never by exposing tables to public client roles.

The route's current v1 payload contract interprets candle `sourceTime` and tick `sourceTimeMs` as UTC for future-time checks. This is not yet proven for native RCG MT5 timestamps. Keep all real MT5 transmission disabled until the RCG timezone/DST evidence and timestamp v2 contract gates are complete.

## Safety and scope

- This document records read-only inspection only.
- No SQL write, migration, synthetic row, credential, token, Auth setting, or secret was created or changed.
- No MT5 queue/cursor or terminal setting was changed.
- No broker data was transmitted.
- Production remains untouched.
