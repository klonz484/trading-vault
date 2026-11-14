# Evidence scoring and scenario lifecycle services

## Scope

The first pure service layer is intentionally deterministic and side-effect free. It accepts typed records and returns evaluations; it does not fetch prices, write to a database, publish shared Core changes, notify traders, or place orders.

## Evidence scoring

`scoreEvidenceBundle` first validates the complete bundle. If any bundle-level or evidence validation issue exists, it fails closed and returns no directional score.

| Evidence condition | Directional weight |
| --- | ---: |
| Confirmed + valid | 1.00 |
| Provisional + valid | 0.25 |
| Provisional + degraded | 0.125 |
| Invalidated or unavailable | 0 |
| Stale or rejected | 0 |
| Neutral or contextual | 0 |

A supporting bullish record adds bullish weight; a supporting bearish record adds bearish weight. A contrary record reverses its stated direction before aggregation. Contextual records are counted for transparency but never add directional weight.

The service returns the directional balance:

`abs(bullishWeight - bearishWeight) / (bullishWeight + bearishWeight) * 100`

The descriptive bands are weak (below 40), moderate (40–69), and strong (70 or above). A perfectly balanced score, or a bundle with no directional evidence, is neutral/none.

**Important:** this is an evidence-balance index, not a calibrated probability, win rate, expected return, or trading recommendation. Thresholds are initial engineering defaults and must be assessed on versioned historical data before being used in user-facing decision support. No score alone may activate a trade.

## Scenario lifecycle

`transitionScenario` returns either an unchanged input scenario plus validation issues, or a new scenario object with the requested state. It never mutates the supplied object.

- Only transitions declared in the state machine are accepted.
- A transition requires a valid evaluation timestamp.
- Expired scenarios cannot be advanced or confirmed.
- Confirmation requires at least one confirmed, valid evidence record matching the scenario instrument and timeframe.
- Scenario conditions require stable IDs and explicit source/event/instrument/timeframe metadata.
- A condition marked as requiring confirmed state cannot accept a forming-candle requirement.
- Comparator-based conditions require a finite numeric threshold.

The lifecycle helper is a guard, not a live event monitor. The future monitoring engine must evaluate actual event lineage and confirmation rules before calling it.

## Required verification cases

- Invalid bundle and duplicate evidence IDs produce no score.
- Confirmed valid evidence outweighs an otherwise identical provisional record by 4:1.
- Stale, rejected, invalidated, unavailable, neutral, and contextual evidence add no directional weight.
- Contrary evidence contributes to the opposite direction.
- Equal bullish and bearish weights remain neutral.
- Forbidden scenario transitions are rejected.
- Confirmation without qualifying evidence is rejected.
- Evidence for another instrument or timeframe cannot confirm a scenario.
- Forming candles cannot satisfy confirmed-only conditions.
- An expired scenario cannot be confirmed.

## Next integration boundary

The source-engine adapter now converts an immutable engine event into the shared evidence contract while preserving its state exactly. It assigns the evidence role at the reasoning/confluence boundary and validates the result; it never promotes a provisional event. The next integration layer is to connect real, versioned outputs from the market intelligence, structure, and liquidity engines. Persistent storage and tenant authorization remain separate workstreams.
