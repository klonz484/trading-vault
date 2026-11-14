# Supabase development baseline

**Environment:** Supabase project named `TradingVault-Development`  
**Purpose:** record the inspected development baseline before adding private Trader and Shared Core persistence.  
**Inspection mode:** read-only; no database, Auth, Storage, or project settings were changed during this inspection.

## Existing database objects

The development project currently has these recorded migrations:

- `add_private_mt5_ingestion`
- `mt5_ingestion_transport`
- `add_scanner_rate_limit_rpc`

The inspected public tables are:

- `mt5_connector_credentials`
- `mt5_ingest_batches`
- `mt5_ingest_rate_limits`

A private schema also contains `scanner_rate_limits`.

RLS is enabled on all four inspected tables. No row policies were found. This is currently fail-closed for ordinary browser roles; the ingestion tables have grants for the database owner and `service_role`, not direct authenticated-user CRUD. Do not add broad user policies to these service-owned ingestion tables.

The private scanner rate-limit implementation uses a private `SECURITY DEFINER` function that obtains the caller with `auth.uid()`, rejects a null user, uses an empty search path, and grants execution to authenticated callers. Keep privileged helpers in a non-exposed schema and preserve caller authorization checks.

## Not yet present

- No Trading Brain reasoning-report, scenario, or experiment persistence tables.
- No dedicated private trader journal persistence tables.
- No Storage buckets for private chart screenshots.
- No Supabase Edge Functions were returned by the project listing.
- No tenant-specific Shared Core release/approval tables.

The existing MT5 ingestion tables are not a substitute for private trader chart history, reasoning reports, or journals.

## Security advisor findings at inspection

- Informational: RLS enabled without policies on the four service-owned tables above. This is consistent with a service-only access design unless direct client access is intentionally added.
- Warning: Auth leaked-password protection is disabled. Review and enable it in the development Auth settings before enabling public registration. This inspection did not change Auth settings.
- Performance advisor reported three currently unused indexes. Do not remove them solely on this early, low-traffic development baseline; re-evaluate after representative ingestion traffic.

## Next implementation sequence

1. Add private trader persistence with explicit `owner_id`, RLS policies for `authenticated`, and matching `USING` plus `WITH CHECK` ownership rules.
2. Add a private `trader-charts` Storage bucket with a user-ID-first object path and separate SELECT, INSERT, UPDATE, and DELETE policies.
3. Keep Shared Core storage separate from private trader tables. Restrict Core writes to a controlled server-side path; release still requires owner approval.
4. Add cross-user denial tests, including attempts to reassign ownership, access another user's rows, or access another user's chart objects.
5. Run Supabase security and performance advisors after every schema migration.

## Safety boundary

This document describes the development project only. It does not authorize production changes, public registration, or a Shared Core release. Keep service-role credentials server-side and never expose them through a `NEXT_PUBLIC_` variable.
