# Zone evidence: FVG and order-block candidates v0.1

## Fair-value gaps
A bullish three-candle gap is recorded when candle 3 low is strictly above candle 1 high. A bearish gap is recorded when candle 3 high is strictly below candle 1 low. Boundaries are explicit and no pip-size or minimum-gap threshold is inferred.

## Order-block candidates
An order-block candidate is emitted only when a supplied closed-candle displacement and a same-direction BOS, CHoCH, or MSS share the same candle index. The zone is the last opposing candle within the caller-supplied lookback. This is a reproducible chart-pattern definition, not proof of institutional orders or order flow. The module does not infer that a block is valid merely because it exists.

## Lifecycle
- `OPEN`: no later closed candle has entered the zone.
- `TOUCHED`: a later candle has entered the zone.
- `FILLED`: a later wick has traversed the far boundary.
- `INVALIDATED`: a later candle closes beyond the far boundary.

The first mitigation index and last status-change index are retained. Only supplied closed candles are considered.

## Safety boundary
The module creates descriptive evidence zones only. It does not calculate entries, stops, targets, probability, confidence, trade direction, or order instructions. Downstream logic must assess context, source quality, freshness, invalidation, confluence and risk.
