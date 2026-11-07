# Session and scheduled-news context v0.2

## Session schedule
Session windows require verified source IDs and explicit ISO-8601 UTC timestamps ending in Z. No broker timezone, daylight-saving conversion or local session hours are inferred. If no verified windows are supplied, session status is UNKNOWN.

## News calendar coverage
A news event list is not evidence that the calendar is complete. Callers must supply `newsCalendarVerified`, the calendar snapshot's UTC timestamp, and an explicit maximum age. A missing, unverified, stale or future-dated calendar snapshot yields INCOMPLETE and news UNKNOWN; it never reports CLEAR. Only a fresh verified snapshot with no relevant events inside the configured window may report CLEAR.

## Event relevance
Each event requires an explicit UTC timestamp, affected currency codes, impact tier, source identifier and verification flag. The caller maps the instrument to currencies and selects impact tiers and pre/post-event windows. No calendar feed is fetched by this module.

## Safety boundary
Context only; no signal or execution. A caller's verification flag and source metadata still require independent provenance validation upstream. This does not guarantee calendar completeness or prop-firm rule coverage.
