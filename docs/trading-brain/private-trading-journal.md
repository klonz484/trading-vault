# Private Trading Journal

## Purpose

The Journal is the trader's private record of plans, decisions, execution and outcomes. It is not a signal generator, broker terminal, or substitute for the Trading Brain. It gives the trader and their private learning workflow an auditable record of what was intended, what was done, and what was learned.

## Product boundaries

- Manual MT5 execution only. Journal records are descriptive; saving a trade never places, modifies, or closes a broker order.
- The Scanner and Trading Brain may provide context for a journal entry, but the Journal remains independently editable and does not silently rewrite an analysis or scenario.
- Journal records belong to one authenticated trader and remain private under row-level security.
- Private journal content is not automatically contributed to Shared Core. Any future contribution must use a separately reviewed, privacy-preserving experiment and the existing owner-approval boundary.
- Browser-local records and cloud records remain separate until an explicit export/import flow is designed and tested. No automatic migration or destructive cleanup is permitted.

## Journal record model

A journal trade should progressively support:

1. **Identity and context:** instrument, date/time, session, timeframe, direction, strategy, setup type, and optional linked Scanner/Brain scenario IDs.
2. **Trade plan:** entry, stop, target, planned risk, planned reward-to-risk, and the reason the setup qualified.
3. **Execution:** actual entry/exit, actual stop/target changes, position sizing, fees or spread when known, and manual MT5 execution notes.
4. **Outcome:** open, win, loss, breakeven, cancelled, or missed; realized R and monetary result when supplied by the trader.
5. **Evidence:** before/after chart screenshots, timeframe, capture time, and optional notes. Images must use the private `trader-charts` bucket and owner-scoped paths.
6. **Review:** what went well, what went wrong, rule adherence, emotional state, mistakes, and one concrete lesson.

Fields that the trader did not supply must remain unknown rather than being inferred. Planned R and realized R are distinct. A trade's win/loss status must not be inferred from a target price alone.

## Performance analysis

The Journal may calculate descriptive metrics from recorded data:

- trade count and closed-trade count;
- win/loss/breakeven distribution;
- win rate over closed trades;
- average realized R, net R, and expectancy when enough valid realized-R observations exist;
- performance grouped by instrument, timeframe, session, strategy, and setup;
- rule-adherence and mistake frequencies when the trader records those tags.

Every metric must disclose its sample size and date range. Missing or incomplete outcomes are excluded from outcome-based metrics. These descriptive statistics are historical summaries, not predictions or guarantees of future performance.

## Private learning loop

The private learning workflow may identify repeated patterns and propose experiments, for example comparing one setup's results by session or testing a stricter confirmation rule. Each experiment needs a hypothesis, baseline, candidate rule, dataset window, sample-size requirements, primary metric, and guardrails. The system must label insufficient samples and inconclusive results clearly. It must not silently change a strategy or Shared Core rule based on journal observations.

## Current implementation status

- **Implemented in code:** authenticated list/create/update/delete API using the verified user session; server-derived owner identity; bounded JSON payloads; same-origin checks for mutations; no-store API responses. Updates and deletes are filtered by both record ID and verified owner ID.
- **Implemented in UI:** Journal page attempts private cloud loading and uses the private API for create/update/delete when an authenticated Development session is available. Existing entries can be edited, including changing an open trade to its final outcome. It falls back to browser-local storage when signed out or when cloud access is unavailable; deletion requires confirmation.
- **Preservation:** local browser entries are not automatically uploaded, overwritten, or deleted. The local and cloud stores are intentionally separate.
- **Not yet verified end to end:** Development runtime variables, real sign-in session, and authenticated journal create/list/delete using a dedicated test identity.
- **Not yet implemented:** richer execution and psychology fields, chart attachment UI, export/import of old local records, automated performance breakdowns, and private learning experiments sourced from journal records.

## Acceptance and safety checks

1. An unauthenticated visitor cannot read, create, update, or delete cloud journal entries.
2. Trader A cannot read, modify, or delete Trader B's records, even when a record UUID is known.
3. A client cannot assign or change `owner_id`; the server derives identity from verified JWT claims and RLS independently enforces ownership.
4. Failed cloud saves/deletes do not silently change the visible journal state.
5. Existing local records remain untouched until the trader explicitly chooses a reviewed import/export action.
6. Private journal data is not copied to Shared Core by default.
7. No Journal operation can execute a broker order or change MT5/RCG queue state.
