# Prop-firm compliance engine v0.2

## Improvements
- Daily loss projection offsets proposed risk against verified current-day net PnL and compares it with the exact configured start-of-day equity limit.
- Overall drawdown now distinguishes static rules (initial balance reference) from trailing rules (high-watermark reference). The rule mode and reference value must be verified; neither is guessed.
- Position limits validate integer counts.
- Consistency checks calculate best-day profit as a percentage of total profit and block when it exceeds the exact firm rule. A non-positive profit denominator remains REVIEW.
- Minimum trading-day progress is reported without treating an incomplete challenge as a breach.
- Challenge profit-target progress is calculated from verified initial balance, target percentage and total profit. Progress is informational; it is not a claim that the challenge has passed.
- Invalid rule percentages and invalid proposed risk are blocked.

## Required source data
Firm-specific rule values and account snapshots must be verified. Static drawdown requires initial balance; trailing drawdown requires high-watermark equity. Unknown values remain REVIEW. Different firms may define daily reset, equity/balance basis, floating-loss treatment, consistency and trailing drawdown differently; the caller must normalize and verify the firm's actual terms before evaluation.

## Safety boundary
This module is a pre-trade compliance aid, not a guarantee of prop-firm acceptance. It does not submit, modify or close orders. Manual review is required whenever firm terms or account values are missing or ambiguous.

## Additional validation hardening
- Non-finite or negative account equity/balance/reference/profit fields are flagged for manual review; PnL fields may be negative but must be finite.
- Current open-position and completed-day counts must be non-negative integers.
- Negative best-day profit cannot be used to satisfy a consistency calculation.
- Experiment period boundaries must be explicit UTC ISO timestamps ending in Z. Local timestamps and numeric offsets are rejected to prevent timezone ambiguity.
- Experiment guardrails must be supplied as an array, even when intentionally empty.

- Daily and overall drawdown now explicitly return REVIEW when required positive equity references or finite PnL/risk inputs are absent, rather than silently omitting a calculation.
- Challenge pacing rejects negative total profit as unverified/invalid input instead of reporting negative progress as a passing calculation.
- Drawdown boundaries are conservative: projected loss equal to the configured limit is BLOCK.
