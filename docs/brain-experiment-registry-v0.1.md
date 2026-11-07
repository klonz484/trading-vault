# Controlled experiment registry v0.1

## Purpose
Evaluates a pre-registered candidate against a baseline using explicit out-of-sample evidence. This is a decision-support gate for controlled learning, not an automatic model-training or deployment system.

## Protocol requirements
- Owner-approved protocol, explicit hypothesis, strategy and Brain versions.
- Verified dataset with a stable hexadecimal content hash.
- Chronological, non-overlapping training and out-of-sample test windows in UTC.
- Pre-registered minimum sample count.
- One primary metric with direction and minimum required improvement.
- Guardrail metrics with explicit maximum permitted degradation.

## Outcomes
- `INVALID`: malformed identity, provenance, periods, sample definitions or metric definitions.
- `INCOMPLETE`: protocol approval is missing or out-of-sample sample count is below threshold.
- `REJECTED`: primary metric threshold is missed or any guardrail exceeds its registered degradation.
- `ELIGIBLE_FOR_OWNER_REVIEW`: all registered criteria pass. This is not approval to merge or activate.

## Limitations
The evaluator does not calculate statistical significance, correct for multiple comparisons, detect data leakage, validate the dataset hash against an external store, or guarantee representative market regimes. Those require separate independent validation. Results must be reviewed for costs, spread, slippage, execution assumptions, survivorship/look-ahead bias and regime coverage.

## Governance
Every result explicitly returns `sharedBrainChangeAuthorized: false` and `productionActivationAuthorized: false`. Shared Core Brain improvements require a separate owner approval after review. The experiment engine never changes live rules automatically.
