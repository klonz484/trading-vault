# Trading Brain Foundation — Scanner Collaboration Contract v0.1

**Status:** Foundation specification; implementation and production readiness are not implied.  
**Branch:** `feat/trading-brain-foundation`  
**Scope:** Define the first safe Scanner–Brain boundary before enabling live collaboration.

## 1. Product rules

- Scanner and Trading Brain are independent analytical systems. Neither may silently overwrite the other's findings.
- They collaborate through a versioned, inspectable evidence contract.
- The collaborative decision is produced only after both independent assessments are available, or an explicit degraded result is recorded when one is unavailable.
- Final authority is collaborative: preserve each system's decision, rationale, evidence, uncertainty and disagreement.
- Evidence quality, analytical confidence and setup quality are separate concepts. No numerical confidence is displayed until a calibrated method has been validated.
- Manual MT5 execution only. This contract cannot place, modify or close orders.
- Initial instrument scope is EURUSD and XAUUSD; broader approved coverage is introduced only after instrument validation.
- Private scans, Brain experiments, journals and performance history remain user-isolated. Shared Core Brain changes require controlled experiments and owner approval.

## 2. Responsibility boundaries

### Scanner
- Reads the submitted chart image and trader context.
- Returns a structured current-state decision, visible observations, interpretations, proposed levels and uncertainty.
- Must distinguish current actionable setups from conditional future scenarios.
- Must not claim that image-derived levels are verified market data.
- Must not receive or impersonate Brain conclusions as its own independent analysis.

### Trading Brain
- Receives the Scanner result as one evidence source, not as ground truth.
- Independently evaluates structure, methodology rules, multi-timeframe context, risk geometry, invalidation and contradictory evidence when the required evidence is available.
- May return BUY, SELL, NO TRADE, or INSUFFICIENT_EVIDENCE.
- Must explain missing inputs and disagreements; it must not manufacture prices, candles, indicators or market context.
- Learning is experiment-based. User outcomes remain private; shared Core Brain changes require controlled testing and owner approval.

### Collaborative decision
- Preserves Scanner and Brain outputs separately.
- Resolves to BUY or SELL only when the required evidence and safety checks pass.
- Resolves to NO TRADE when either system identifies a material unresolved safety conflict, a required trigger is absent, or the evidence is insufficient.
- Records disagreements explicitly rather than averaging opinions or hiding conflicts.
- A Brain outage or missing data must never be represented as Brain approval.

## 3. Versioned contract

Contract identifier: `trading-vault.scanner-brain`  
Initial contract version: `1.0.0`

Every request/response must carry:
- `contractVersion`
- `analysisId` and `userId` (server-derived identity; never trusted from a browser payload)
- `instrument` and `timeframe`
- `createdAt` in canonical UTC ISO-8601
- `sourceReferences` identifying the Scanner result and any market-data snapshot versions
- `evidenceReadiness` and explicit limitations

Each independent assessment must carry:
- `system`: `SCANNER` or `BRAIN`
- `status`: `COMPLETE`, `INCOMPLETE`, `UNAVAILABLE`, or `REJECTED`
- `decision`: `BUY`, `SELL`, `NO_TRADE`, or `INSUFFICIENT_EVIDENCE`
- `orderType`: `MARKET`, `PENDING`, or `NONE`
- structured entry type and levels, when genuinely supported
- observations, interpretations, supporting evidence and contrary evidence
- trigger, invalidation, assumptions and uncertainty
- methodology/rule-set version and model/provider provenance

The collaborative result must carry:
- both independent assessments unchanged
- `decision` and `decisionStatus`
- `agreementState`: `AGREED`, `DISAGREED`, `SCANNER_ONLY`, `BRAIN_ONLY`, or `INSUFFICIENT_EVIDENCE`
- explicit conflict list and resolution rationale
- risk/level validation status
- no uncalibrated percentage score

## 4. Market-data gate

The existing Market Data Engine foundation is on-demand and has not been certified for production. Provider entitlement and licence states remain unverified; freshness thresholds are not calibrated; persistence, durable correction history, background polling and provider fallback are not implemented.

Therefore:
- Do not label a snapshot `READY` unless the validator actually returns `READY` under approved thresholds and the relevant provider entitlement/licence gates have been closed.
- `DEGRADED`, `STALE`, `INCOMPLETE`, `CONFLICTED` and `UNAVAILABLE` evidence must be surfaced and must restrict claims.
- Preserve provider disagreements; never silently average sources.
- OHLC candles are not executable bid/ask quotes.
- Provisional/forming candles remain distinct from confirmed closed candles.
- If no eligible market data is available, the Brain may provide a clearly labelled chart-only assessment only if the contract marks it as such; it must not claim multi-timeframe or live-data validation.

## 5. Initial implementation phases

1. **Contract and types:** versioned TypeScript types, runtime validation and deterministic tests. No model call or database write.
2. **Independent Brain assessment boundary:** a server-only service interface with a deterministic, non-trading stub. No provider key or paid service required.
3. **Collaboration orchestrator:** preserve Scanner and Brain outputs; implement conservative conflict handling and explicit degraded states.
4. **Preview API/UI:** authenticated, user-scoped preview that clearly distinguishes independent assessments from the collaborative outcome.
5. **Evidence and persistence design:** propose schema, RLS, retention and audit requirements separately for review before any database changes.
6. **Controlled evaluation:** replay known chart cases, compare independent outputs, inspect false positives/negatives and failure behavior. No production activation until acceptance evidence is complete.

## 6. Non-goals for this foundation

- No automated trade execution or broker write access.
- No live provider activation, paid upgrade or new external service.
- No database migration, table/policy/storage change or production deployment.
- No automatic learning from all users or cross-user sharing of private trading records.
- No calibrated confidence score or claim that the Brain is already trained.
- No signal generation from missing or fabricated market data.

## 7. Acceptance gates

The foundation is acceptable only when:
- contract validation rejects malformed or unsupported versions;
- Scanner and Brain assessments remain independently inspectable;
- missing Brain/data dependencies produce explicit degraded states;
- material disagreements cannot silently become BUY/SELL;
- incomplete or provisional evidence is labelled;
- user identity is derived server-side and all reads/writes are scoped to that user;
- deterministic tests cover agreement, disagreement, missing inputs, invalid levels, stale/conflicted data and unavailable Brain;
- lint, typecheck and production build pass on Preview;
- no production, billing, provider, or database changes occur without their separate approval.

**Current status:** Specification committed as the starting point. No Brain model, market-data provider, database or production integration is active.
