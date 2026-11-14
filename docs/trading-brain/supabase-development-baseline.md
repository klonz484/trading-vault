# Supabase development baseline

**Environment:** Supabase project `TradingVault-Development` (`eu-west-1`).  
**Scope:** development only. The changes below were applied to this project after read-only inspection and SQL review. Production was not touched.

## Existing MT5 ingestion foundation

The project retains its existing migrations and service-owned tables:

- `mt5_connector_credentials`
- `mt5_ingest_batches`
- `mt5_ingest_rate_limits`
- private `scanner_rate_limits`

RLS is enabled on the ingestion tables. Their lack of authenticated-user policies is intentional: they remain service-side ingestion resources. Do not add broad browser CRUD policies to these tables.

The private scanner rate-limit implementation uses a private `SECURITY DEFINER` function, checks `auth.uid()`, rejects a null caller, uses an empty search path, and grants execution only to authenticated callers.

## Private Trader workspace — applied

The following tables now exist:

| Table | Purpose |
| --- | --- |
| `trader_profiles` | User-owned preferences and profile metadata |
| `trader_evidence_bundles` | Versioned private evidence bundles |
| `trader_reasoning_reports` | Private reasoning snapshots linked to evidence |
| `trader_scenarios` | Private current-market and upcoming-session scenarios |
| `trader_experiments` | Private experiment definitions and states |
| `trader_journal_entries` | Private journal records |

Every private table has RLS enabled and forced. Authenticated users have table privileges, but policies constrain all reads and writes to `auth.uid()`. Private experiments are restricted to research/recommendation states; database constraints force `requires_owner_approval_for_release = true` and prohibit private users from setting `approved_for_release`, `released`, or `rolled_back`. The profile policy uses `user_id = auth.uid()`; the other five use `owner_id = auth.uid()`. Both `USING` and `WITH CHECK` are present, so a user cannot reassign a row to another owner. Anonymous table access is revoked.

Evidence/report/scenario relationships use composite foreign keys containing `owner_id` as well as the referenced row ID. This prevents a record owned by one trader from linking to another trader's evidence or report even if an internal UUID is known. Cascading deletion preserves account-data cleanup.

A private-schema trigger helper maintains `updated_at` for profiles, scenarios, experiments, and journal entries. It has no direct execute grant to browser roles.

## Private chart storage — applied

A non-public Storage bucket named `trader-charts` now exists:

- Maximum object size: 15 MiB
- Accepted MIME types: JPEG, PNG, WebP
- Object path must begin with the authenticated user's UUID, e.g. `<user-uuid>/<chart-id>.webp`
- Separate SELECT, INSERT, UPDATE, and DELETE policies enforce ownership using the first folder segment

Do not store chart images in a public bucket or use predictable cross-user paths.

## Verification performed

- Supabase confirmed the new migration records.
- All six Trader tables are present with both RLS enabled and RLS forced.
- Authenticated has SELECT privileges; anon does not.
- Six owner-only table policies exist, each with matching `USING` and `WITH CHECK`.
- Four chart-object policies exist and the bucket is confirmed private with the expected size/MIME limits.
- Composite tenant-scoped foreign keys are present.
- A follow-up index migration removed the advisor's unindexed-FK findings for these new relationships.
- A private-schema timestamp trigger migration was applied.
- A read-only SQL catalog assertion script passed against the development database, including the RLS, grants, Storage policies, helper-function privileges, and private experiment release-boundary constraints.

The security advisor still reports four pre-existing RLS-enabled/no-policy informational findings on service-owned ingestion/rate-limit tables, plus leaked-password protection disabled. The latter should be enabled in development Auth settings before public registration is opened. No Auth settings were changed here.

The performance advisor currently reports unused indexes on the early-stage development tables. This is expected before representative workload exists; do not remove indexes until query patterns and production-like load are measured.

## Not yet implemented

- A password sign-in screen exists at `/sign-in`; it has no public sign-up flow. Account creation remains owner-provisioned until Auth security configuration and explicit launch readiness.
- Browser/server Supabase clients, a Next.js session-refresh proxy, verified JWT user scoping, typed private Trader insert/list/update/delete helpers, and user-scoped chart signed-upload/read/delete helpers now exist in code. They are scaffolding only until Development runtime variables are supplied and an authenticated session is available.
- The `.env.example` file contains placeholders only; no project keys or service-role secrets are committed.
- The Journal screen now attempts authenticated cloud loading and uses the private journal API for create/delete when a valid session is available. When unauthenticated or when the cloud is unavailable, it falls back to browser localStorage. Existing local records are preserved and are not automatically imported into the cloud. The Scanner still uses browser localStorage.
- Automated two-user RLS denial tests using real test identities.
- Chart upload UI now uses a short-lived user-scoped signed upload token from `/api/trader/charts`, uploads through the browser Supabase client to the private bucket, saves only the private object path in the Journal payload, and loads short-lived signed previews on demand. Replacing a chart cleans up the previous object after the journal save; deleting a trade attempts private object cleanup. End-to-end authenticated runtime verification is still pending.
- Shared Core release and owner-approval tables/workflow.
- Edge Functions or live market-data ingestion into Trading Brain persistence.

The MT5 ingestion tables remain separate from private trader records. The Shared Core is not allowed to ingest private trader journal, scan, or experiment data by default.

## Next implementation sequence

1. Configure Development-only Supabase public URL and publishable key in the runtime; no service-role key is required for user-scoped access.
2. Configure Development-only Supabase public URL and publishable key, then exercise sign-in and journal create/list/delete with a dedicated test identity.
3. Add isolated test identities and prove cross-user SELECT/INSERT/UPDATE/DELETE denial, including ownership reassignment and Storage object path attacks.
4. Define and test an explicit local-journal export/import flow before offering any migration of existing browser records.
5. Build chart upload and signed-read UI against the private bucket.
6. Keep Shared Core writes behind a controlled server-side release path and explicit owner approval.

## Safety boundary

This is the development project only. It does not authorize production changes, public registration, or a Shared Core release. Keep service-role credentials server-side and never expose them through a `NEXT_PUBLIC_` variable.


## Repository migration ledger alignment

The repository migration filenames now match the version/name pairs recorded by the Development database:

- `20261114060304_private_trader_workspace`
- `20261114060335_index_trader_foreign_keys`
- `20261114060402_trader_updated_at_triggers`
- `20261114060958_lock_private_experiment_release_boundary`
- `20261114061151_guard_private_scenario_lifecycle`

This was a repository-only filename reconciliation; it did not apply, re-run, or modify any database migration. Before any future schema deployment, compare the local migration ledger with the Development project's recorded migration list and review SQL drift. Do not run a blind migration push.

## Trading Brain evidence scoring note

Evidence direction is the source engine's observed market direction. The `supporting` / `contrary` role describes its relationship to a hypothesis and must never reverse the source event's direction. The scorer now preserves the raw direction; any future hypothesis-relative score must receive an explicit target direction. The aggregate balance is not a probability, win rate, or trade recommendation.


## Private Trader API and Journal integration — implemented, runtime verification pending

The development branch now includes:

- `/api/trader/journal`: authenticated list, create, and delete operations. The server derives owner identity from verified Supabase JWT claims; request bodies cannot assign ownership. Payloads and request sizes are bounded.
- `/api/trader/charts`: authenticated signed-upload target creation, signed-read URL creation, and deletion. Uploads are limited to JPEG/PNG/WebP up to 15 MiB. Chart paths must match the current user's UUID and a generated UUID filename. Mutating requests reject a mismatched Origin header when one is supplied.
- The APIs use the public publishable key plus the user's session and database/storage RLS. No service-role key is required or exposed.

These endpoints and the Journal cloud integration require Development runtime environment variables and an authenticated user session before they can be exercised end to end. The Journal UI now uses the private API when signed in and falls back to local storage otherwise. Private chart attachments are available only in authenticated cloud mode; local mode does not store image data URLs. The two stores remain separate: no local record is automatically copied, overwritten, or deleted. The chart upload UI and actual browser upload completion flow are not yet connected. No user data has been migrated or deleted.


A password sign-in screen now exists at `/sign-in`. It deliberately contains no public sign-up flow. Account creation remains an owner-provisioned operation until leaked-password protection, rate limits, email verification, and registration policy are reviewed. This screen requires the Development Supabase public URL and publishable key at runtime; it has not yet been exercised with a real authenticated browser session.
