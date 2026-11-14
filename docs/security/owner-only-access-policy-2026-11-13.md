# Trading Vault access policy — owner-only phase

**Decision recorded: 2026-11-13**

## Current access model

Trading Vault is a private, owner-only platform during its current phase. The owner is the only intended account holder.

- Do not enable public registration or expose a public sign-up route.
- Keep authentication private and require email verification for the owner's account.
- Protect all private scans, chart images, journal entries, trades, experiments, performance records and Brain data behind authenticated access and owner-scoped authorization.
- Keep service credentials and MT5 ingestion endpoints server-side. Never expose service-role credentials to the browser.
- Do not create additional user accounts, invitations or shared workspaces as part of the current release.

## Future expansion

The underlying data model may remain compatible with future multi-user isolation, but that is an architectural allowance only. It does not authorize public registration, invitations, or access for another person. Revisit the access model and licensing/security requirements before granting anyone else access.

## Account security requirements

- Email/password authentication remains private to the owner.
- Email verification must remain required.
- Enable leaked-password protection before treating authentication as launch-ready.
- Keep MFA available/enforced according to the owner's approved security posture.
- Use least-privilege database grants and row-level security for user-owned application data.
- Server-only ingestion tables remain inaccessible to `anon` and `authenticated` client roles.

## Release boundaries

This policy is a product/security decision record only. It does not change Supabase Auth settings, database schema, grants, Production, Vercel deployment, credentials, MT5 configuration, broker-data transmission, or trading behavior.

Public registration and multi-user access require a new explicit owner decision.
