# Intermarket relationship evidence v0.1

## Purpose
Calculates descriptive Pearson correlation between timestamp-aligned closed-candle return series for a target instrument and one explicitly selected comparator.

## Requirements
- Explicit target and comparator instruments on the same timeframe.
- Verified READY series, ordered unique UTC candle-close timestamps and closed observations.
- Caller-defined freshness limits, timestamp matching tolerance, minimum sample count and minimum absolute correlation.
- Caller-pre-registered expected relationship: positive, negative or any.

## Outcomes
- `READY`: correlation is defined and meets the explicit threshold/expected relationship.
- `CONFLICTING`: measured relationship opposes the caller's pre-registered expectation.
- `STALE`: either series exceeds its explicit freshness limit.
- `INCOMPLETE`: insufficient aligned samples, unready series or zero variance.
- `INVALID`: malformed values, timestamps, identities or configuration.

## Limitations
Correlation is descriptive and does not imply causation, stability, hedge effectiveness or predictive power. The module does not infer which instruments should be compared, select expected relationships, calculate betas, or create a directional signal. Provider differences are surfaced as warnings; upstream data validation remains required.
