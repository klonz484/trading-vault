# Session and scheduled-news context v0.1

## Purpose
Evaluates session windows and scheduled-news restrictions only from explicitly supplied, verified UTC records. It does not fetch a calendar or infer market hours.

## Session inputs
Each session window must include a label, source identifier, verification flag, and absolute UTC start/end timestamps. This avoids guessing broker timezone, daylight-saving transitions, or local-market session definitions. If no verified window is supplied, session status is UNKNOWN.

## News inputs
Each event includes an exact UTC timestamp, affected currencies, impact tier, source identifier, and verification flag. The caller explicitly maps the instrument to currencies and configures relevant impact tiers and pre/post-event windows. Only matching events inside the configured window are returned as restrictions.

## Fail-closed behavior
Malformed or unverified supplied schedule records make the result INVALID. Missing session schedule yields UNKNOWN rather than assuming a session. No calendar data is synthesized.

## Safety boundary
This is context evidence only. It does not create a signal, recommend avoiding or entering a trade, or guarantee the completeness of an external calendar. Downstream Brain logic must independently verify source quality and firm-specific restrictions.
