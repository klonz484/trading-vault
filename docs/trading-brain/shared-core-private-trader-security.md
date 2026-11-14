# Trading Brain — Shared Core and Private Trader Isolation

Status: Architecture and security specification
Scope: Multi-tenant data ownership, shared analytical capabilities, and learning boundaries

## 1. Security objective

Trading Vault has a shared, versioned analytical Core and private trader workspaces. Shared code and curated knowledge may serve multiple users; private scans, journals, experiments, settings, and performance histories belong to one authenticated trader and must not be visible to other traders.

The application must enforce isolation at the database boundary, not merely by hiding UI elements or filtering client-side queries.

## 2. Data domains

### Shared Core domain

Examples:
- released engine and strategy definitions;
- versioned rule/configuration catalogues;
- curated public market reference data with documented provenance;
- approved shared experiment results and release metadata;
- non-user-specific operational health and compatibility metadata.

Shared Core records are read-only to ordinary traders. Only explicitly authorized owner/admin workflows may propose or approve shared releases.

### Private Trader domain

Examples:
- user profile and preferences;
- uploaded chart images and scanner results;
- private reasoning reports and scenarios;
- journal entries, trades entered by the user, and performance history;
- private strategy enablement and experiments;
- notifications and personal watchlists.

Every private row is associated with the authenticated user's stable auth subject ID. Private storage paths are similarly tenant-scoped.

## 3. Identity and authorization

- Supabase Auth is the identity provider.
- Email/password registration and email verification are the planned authentication flow.
- The database derives the effective user identity from the verified JWT subject (auth.uid()); clients cannot choose another owner ID.
- Owner/admin privileges are granted through server-controlled authorization metadata or a dedicated role table, never a client-editable profile field.
- Service-role credentials remain server-only and are never included in browser bundles.
- Every privileged operation is audited with actor, action, target, timestamp, and reason.

## 4. Row-level security requirements

Enable RLS on every private table before the table is exposed to application clients.

For private tables:
- SELECT: authenticated user may read rows where user_id = auth.uid().
- INSERT: authenticated user may insert only rows whose user_id = auth.uid().
- UPDATE: user may update only rows they own; both USING and WITH CHECK enforce ownership.
- DELETE: user may delete only rows they own, subject to retention policy.
- Storage objects: bucket policies constrain object paths to the authenticated user's tenant prefix.

For shared Core tables:
- ordinary authenticated users receive SELECT only on released/public records;
- write policies are absent for ordinary users;
- owner/admin writes go through narrowly scoped server-side operations with explicit role checks and audit events;
- drafts and pending releases are not visible to ordinary users.

Never rely on a UI filter as an authorization boundary. Test cross-tenant access with two distinct authenticated test users.

## 5. Scanner and Brain independence

Scanner and Brain records remain distinct:
- Scanner records describe image-derived observations and their model/version provenance.
- Brain records describe market-data-derived evidence, hypotheses, and scenarios.
- Cross-reference IDs permit collaboration without overwriting either record.
- Each system owns its schema and lifecycle.
- A combined view is a derived read model; it does not merge or mutate source records.

## 6. Learning boundaries

Private Trader Learning:
- reads only the owner's authorized private records;
- produces private experiment records and private recommendations;
- cannot publish into Shared Core;
- may submit a candidate for owner review, preserving explicit consent and provenance.

Shared Core Learning:
- uses curated/approved datasets and registered experiments;
- cannot ingest private journals or scans by default;
- requires review, regression evidence, exact candidate hash, and explicit owner approval before release.

A routine authorization to develop or test code is not release approval.

## 7. Suggested initial schema

- profiles: one row per auth user; non-sensitive display/preferences metadata.
- private_scans: user-owned scanner result metadata; image bytes in a private Storage bucket.
- private_journal_entries: user-owned journal records.
- private_reasoning_reports: immutable user-owned reports.
- private_scenarios: user-owned scenario definitions and snapshots.
- private_experiments: user-owned experiments and runs.
- core_engine_versions: released engine artifacts and compatibility metadata.
- core_strategy_definitions: versioned shared strategy catalogue.
- core_experiment_reviews: reviewed candidate/release decisions.
- audit_events: append-only security and administrative event records.

Use UUID primary keys, created_at/updated_at, explicit schema versions, and foreign keys. Avoid storing secrets, broker passwords, or API keys in these tables.

## 8. Storage and retention

Chart images are private by default. Use a private bucket and short-lived signed URLs generated only after server-side ownership checks. Store object paths, hashes, MIME type, dimensions, upload time, and retention state in the database. Deletion/retention workflows must account for derived scans and audit obligations.

## 9. Required security tests

- unauthenticated users cannot read private records;
- user A cannot read, update, or delete user B's rows;
- user A cannot insert rows with user B's user_id;
- Storage signed URL issuance rejects cross-tenant paths;
- ordinary users cannot write Shared Core tables;
- non-admin users cannot access drafts or pending releases;
- a client cannot self-assign owner/admin role;
- service-role keys are absent from client bundles and public environment variables;
- Scanner and Brain source records remain independently owned;
- private experiments never enter shared training/research datasets without explicit reviewed contribution.

## 10. Implementation sequence

1. Establish schema migrations and auth identity mapping.
2. Create private tables with RLS enabled in the same migration.
3. Create private Storage bucket and tenant path policies.
4. Add server-side owner/admin authorization checks.
5. Add two-user integration tests for every private table and bucket.
6. Add shared Core read-only policies and release approval records.
7. Add audit events and retention rules.
8. Integrate UI only after policy tests pass.

## 11. Current implementation status

This document defines the required target architecture. The current repository's localStorage-based workspace helpers are not a secure multi-user persistence layer. Do not treat the current UI as enforcing Supabase tenant isolation until Auth, database migrations, RLS policies, Storage policies, and cross-tenant tests are implemented and verified.
