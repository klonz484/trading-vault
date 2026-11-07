import type { BrainSkillResult, SkillSourceReference } from "./types";

export type MacroItemKind = "SCHEDULED_EVENT" | "RELEASED_DATA" | "CENTRAL_BANK_COMMUNICATION" | "MACRO_COMMENTARY";
export type MacroImpactLabel = "LOW" | "MEDIUM" | "HIGH" | "UNSPECIFIED";

export interface MacroNewsItem {
  id: string;
  kind: MacroItemKind;
  headline: string;
  summary?: string;
  publishedAt: string;
  updatedAt?: string;
  eventAt?: string;
  currencies: string[];
  impact: MacroImpactLabel;
  actual?: string;
  forecast?: string;
  previous?: string;
  unit?: string;
  sourceReferences: SkillSourceReference[];
}

export interface FundamentalNewsInput {
  instrument: string;
  instrumentCurrencies: string[];
  asOf: string;
  items: MacroNewsItem[];
  sourceReferences: SkillSourceReference[];
}

export interface FundamentalNewsPolicy {
  maximumPublicationAgeSeconds: number;
  maximumFutureEventHorizonSeconds: number;
  requireItemProvenance: boolean;
  requireInstrumentSourceIdentity: boolean;
}

export interface MacroContextItem {
  id: string;
  kind: MacroItemKind;
  headline: string;
  summary: string | null;
  publishedAt: string;
  updatedAt: string | null;
  eventAt: string | null;
  matchedCurrencies: string[];
  impact: MacroImpactLabel;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  unit: string | null;
  ageSeconds: number;
  sourceProviderIds: string[];
}

export interface FundamentalNewsAssessment {
  instrument: string;
  instrumentCurrencies: string[];
  relevantItems: MacroContextItem[];
  itemCount: number;
  scheduledEventCount: number;
  releasedDataCount: number;
  centralBankCommunicationCount: number;
  macroCommentaryCount: number;
}

export interface FundamentalNewsFinding {
  code:
    | "POLICY_MISSING"
    | "INVALID_POLICY"
    | "INSTRUMENT_CURRENCIES_MISSING"
    | "SOURCE_PROVENANCE_MISSING"
    | "SOURCE_IDENTITY_MISMATCH"
    | "SOURCE_TIMESTAMP_INVALID"
    | "SOURCE_TIMESTAMP_IN_FUTURE"
    | "ITEMS_MISSING"
    | "INVALID_ITEM"
    | "INVALID_PUBLICATION_TIMESTAMP"
    | "PUBLICATION_IN_FUTURE"
    | "ITEM_STALE"
    | "ITEM_PROVENANCE_MISSING"
    | "ITEM_SOURCE_IDENTITY_MISMATCH"
    | "INVALID_EVENT_TIMESTAMP"
    | "EVENT_OUTSIDE_HORIZON";
  message: string;
}

const SKILL_VERSION = "0.1.0";
const RULE_SET_VERSION = "fundamental-news-evidence/0.1.0";
const ITEM_KINDS: MacroItemKind[] = [
  "SCHEDULED_EVENT",
  "RELEASED_DATA",
  "CENTRAL_BANK_COMMUNICATION",
  "MACRO_COMMENTARY",
];
const IMPACT_LABELS: MacroImpactLabel[] = ["LOW", "MEDIUM", "HIGH", "UNSPECIFIED"];

function parseAbsoluteTimestamp(value: string): number {
  if (typeof value !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return Number.NaN;
  return Date.parse(value);
}

function validateSourceTimestamps(
  references: SkillSourceReference[],
  asOf: number,
): FundamentalNewsFinding[] {
  const findings: FundamentalNewsFinding[] = [];
  for (const reference of references) {
    const observedAt = parseAbsoluteTimestamp(reference.observedAt);
    const receivedAt = parseAbsoluteTimestamp(reference.receivedAt);
    if (!Number.isFinite(observedAt) || !Number.isFinite(receivedAt)) {
      findings.push({ code: "SOURCE_TIMESTAMP_INVALID", message: "Source observed/received timestamps must be absolute timestamps with timezone information." });
      continue;
    }
    if (observedAt > asOf || receivedAt > asOf) {
      findings.push({ code: "SOURCE_TIMESTAMP_IN_FUTURE", message: "Source observed/received timestamps cannot be later than evaluation time." });
    }
  }
  return findings;
}

function emptyAssessment(instrument: string, currencies: string[]): FundamentalNewsAssessment {
  return {
    instrument,
    instrumentCurrencies: currencies,
    relevantItems: [],
    itemCount: 0,
    scheduledEventCount: 0,
    releasedDataCount: 0,
    centralBankCommunicationCount: 0,
    macroCommentaryCount: 0,
  };
}

function buildResult(
  input: FundamentalNewsInput,
  findings: FundamentalNewsFinding[],
  assessment: FundamentalNewsAssessment,
  status: BrainSkillResult<FundamentalNewsFinding>["status"],
  readiness: BrainSkillResult<FundamentalNewsFinding>["evidenceReadiness"],
): BrainSkillResult<FundamentalNewsFinding> & { assessment: FundamentalNewsAssessment } {
  return {
    skillId: "fundamental-news",
    skillVersion: SKILL_VERSION,
    status,
    evidenceReadiness: readiness,
    findings,
    observations: assessment.relevantItems.map((item) =>
      `${item.kind}: ${item.headline} [${item.matchedCurrencies.join(", ")}; ${item.impact}]`
    ),
    interpretations: [],
    supportingEvidence: [],
    contraryEvidence: [],
    uncertainties: [
      "This module organizes sourced macro information; it does not independently verify the truth or completeness of provider content.",
      "Provider impact labels are preserved as supplied and are not recalculated as expected market volatility or directional impact.",
      "Actual, forecast and previous values are preserved verbatim; no surprise, beat/miss, or price reaction is inferred.",
      "An empty item list does not prove that no relevant news or economic event exists.",
    ],
    sourceReferences: input.sourceReferences,
    limitations: [
      "Items must be supplied by a provider or caller with valid provenance and permitted usage rights.",
      "No headlines, publication times, event outcomes, central-bank positions or macroeconomic facts are fetched or invented.",
      "This module does not forecast price direction, issue BUY/SELL signals, or authorize trade execution.",
      "Provider licensing, attribution and redistribution permissions must be verified outside this calculation.",
    ],
    ruleSetVersion: RULE_SET_VERSION,
    assessment,
  };
}

/** Validate and organize caller-supplied, sourced macro/news items without inventing interpretation. */
export function assessFundamentalNews(
  input: FundamentalNewsInput,
  policy?: FundamentalNewsPolicy,
): BrainSkillResult<FundamentalNewsFinding> & { assessment: FundamentalNewsAssessment } {
  if (!policy) {
    return buildResult(input, [{ code: "POLICY_MISSING", message: "Explicit publication-age, event-horizon and provenance policies are required." }], emptyAssessment(input.instrument, input.instrumentCurrencies), "INCOMPLETE", "INCOMPLETE");
  }
  if (
    !Number.isFinite(policy.maximumPublicationAgeSeconds) ||
    policy.maximumPublicationAgeSeconds <= 0 ||
    !Number.isFinite(policy.maximumFutureEventHorizonSeconds) ||
    policy.maximumFutureEventHorizonSeconds < 0 ||
    typeof policy.requireItemProvenance !== "boolean" ||
    typeof policy.requireInstrumentSourceIdentity !== "boolean"
  ) {
    return buildResult(input, [{ code: "INVALID_POLICY", message: "Publication age, future event horizon and provenance requirements must be explicit valid values." }], emptyAssessment(input.instrument, input.instrumentCurrencies), "REJECTED", "INCOMPLETE");
  }
  if (
    !Array.isArray(input.instrumentCurrencies) ||
    input.instrumentCurrencies.length === 0 ||
    input.instrumentCurrencies.some((currency) => typeof currency !== "string" || currency.trim().length === 0)
  ) {
    return buildResult(input, [{ code: "INSTRUMENT_CURRENCIES_MISSING", message: "Explicit non-empty instrument currency relevance is required; it is never inferred from the symbol." }], emptyAssessment(input.instrument, []), "INCOMPLETE", "INCOMPLETE");
  }

  const asOf = parseAbsoluteTimestamp(input.asOf);
  if (!Number.isFinite(asOf)) {
    return buildResult(input, [{ code: "INVALID_PUBLICATION_TIMESTAMP", message: "Evaluation time must be an absolute timestamp with a timezone." }], emptyAssessment(input.instrument, input.instrumentCurrencies), "REJECTED", "INCOMPLETE");
  }
  const findings: FundamentalNewsFinding[] = [];
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return buildResult(input, [{ code: "ITEMS_MISSING", message: "No macro/news items were supplied; absence of input cannot establish that the calendar or news feed is clear." }], emptyAssessment(input.instrument, input.instrumentCurrencies), "INCOMPLETE", "INCOMPLETE");
  }
  if (!Array.isArray(input.sourceReferences) || input.sourceReferences.length === 0) {
    findings.push({ code: "SOURCE_PROVENANCE_MISSING", message: "At least one top-level source reference is required." });
  } else {
    if (policy.requireInstrumentSourceIdentity && input.sourceReferences.some((reference) =>
      reference.instrument !== input.instrument ||
      !reference.sourceId ||
      !reference.providerId
    )) {
      findings.push({ code: "SOURCE_IDENTITY_MISMATCH", message: "Top-level source references must identify this instrument and a source/provider." });
    }
    findings.push(...validateSourceTimestamps(input.sourceReferences, asOf));
  }

  const currencies = [...new Set(input.instrumentCurrencies.map((currency) => currency.trim().toUpperCase()))];
  const relevantItems: MacroContextItem[] = [];
  for (const item of input.items) {
    if (
      !item.id ||
      !item.headline ||
      !ITEM_KINDS.includes(item.kind) ||
      !IMPACT_LABELS.includes(item.impact) ||
      !Array.isArray(item.currencies) ||
      item.currencies.length === 0 ||
      item.currencies.some((currency) => typeof currency !== "string" || currency.trim().length === 0)
    ) {
      findings.push({ code: "INVALID_ITEM", message: "Every item needs an ID, headline, supported kind/impact label and explicit currency relevance." });
      continue;
    }

    const publishedAt = parseAbsoluteTimestamp(item.publishedAt);
    if (!Number.isFinite(publishedAt)) {
      findings.push({ code: "INVALID_PUBLICATION_TIMESTAMP", message: `Item ${item.id} has an invalid or timezone-less publication timestamp.` });
      continue;
    }
    if (publishedAt > asOf) {
      findings.push({ code: "PUBLICATION_IN_FUTURE", message: `Item ${item.id} is marked as published after the evaluation time.` });
      continue;
    }
    if (item.updatedAt) {
      const updatedAt = parseAbsoluteTimestamp(item.updatedAt);
      if (!Number.isFinite(updatedAt)) {
        findings.push({ code: "INVALID_PUBLICATION_TIMESTAMP", message: `Item ${item.id} has an invalid or timezone-less update timestamp.` });
        continue;
      }
      if (updatedAt > asOf) {
        findings.push({ code: "PUBLICATION_IN_FUTURE", message: `Item ${item.id} has an update timestamp later than the evaluation time.` });
        continue;
      }
    }
    const ageSeconds = (asOf - publishedAt) / 1000;
    if (ageSeconds > policy.maximumPublicationAgeSeconds) {
      findings.push({ code: "ITEM_STALE", message: `Item ${item.id} exceeds the configured publication-age limit.` });
      continue;
    }

    const eventAt: string | null = item.eventAt ?? null;
    if (item.eventAt) {
      const eventTimestamp = parseAbsoluteTimestamp(item.eventAt);
      if (!Number.isFinite(eventTimestamp)) {
        findings.push({ code: "INVALID_EVENT_TIMESTAMP", message: `Item ${item.id} has an invalid or timezone-less event timestamp.` });
        continue;
      }
      if (eventTimestamp > asOf && eventTimestamp - asOf > policy.maximumFutureEventHorizonSeconds * 1000) {
        findings.push({ code: "EVENT_OUTSIDE_HORIZON", message: `Item ${item.id} falls outside the configured future event horizon.` });
        continue;
      }
    } else if (item.kind === "SCHEDULED_EVENT") {
      findings.push({ code: "INVALID_EVENT_TIMESTAMP", message: `Scheduled event ${item.id} requires an explicit event timestamp.` });
      continue;
    }

    const itemSources = Array.isArray(item.sourceReferences) ? item.sourceReferences : [];
    if (policy.requireItemProvenance && itemSources.length === 0) {
      findings.push({ code: "ITEM_PROVENANCE_MISSING", message: `Item ${item.id} has no source reference.` });
      continue;
    }
    if (policy.requireInstrumentSourceIdentity && itemSources.some((reference) =>
      !reference.sourceId ||
      !reference.providerId ||
      reference.instrument !== input.instrument
    )) {
      findings.push({ code: "ITEM_SOURCE_IDENTITY_MISMATCH", message: `Item ${item.id} has a source reference with missing or mismatched instrument identity.` });
      continue;
    }
    const sourceTimestampFindings = validateSourceTimestamps(itemSources, asOf);
    if (sourceTimestampFindings.length > 0) {
      findings.push(...sourceTimestampFindings);
      continue;
    }

    const matchedCurrencies = [...new Set(item.currencies.map((currency) => currency.trim().toUpperCase()))]
      .filter((currency) => currencies.includes(currency));
    if (matchedCurrencies.length === 0) continue;

    relevantItems.push({
      id: item.id,
      kind: item.kind,
      headline: item.headline,
      summary: item.summary ?? null,
      publishedAt: item.publishedAt,
      updatedAt: item.updatedAt ?? null,
      eventAt,
      matchedCurrencies,
      impact: item.impact,
      actual: item.actual ?? null,
      forecast: item.forecast ?? null,
      previous: item.previous ?? null,
      unit: item.unit ?? null,
      ageSeconds,
      sourceProviderIds: itemSources.map((reference) => reference.providerId),
    });
  }

  const assessment: FundamentalNewsAssessment = {
    instrument: input.instrument,
    instrumentCurrencies: currencies,
    relevantItems: relevantItems.sort((a, b) => {
      const aTime = a.eventAt ? parseAbsoluteTimestamp(a.eventAt) : parseAbsoluteTimestamp(a.publishedAt);
      const bTime = b.eventAt ? parseAbsoluteTimestamp(b.eventAt) : parseAbsoluteTimestamp(b.publishedAt);
      return aTime - bTime;
    }),
    itemCount: relevantItems.length,
    scheduledEventCount: relevantItems.filter((item) => item.kind === "SCHEDULED_EVENT").length,
    releasedDataCount: relevantItems.filter((item) => item.kind === "RELEASED_DATA").length,
    centralBankCommunicationCount: relevantItems.filter((item) => item.kind === "CENTRAL_BANK_COMMUNICATION").length,
    macroCommentaryCount: relevantItems.filter((item) => item.kind === "MACRO_COMMENTARY").length,
  };
  const blockingCodes: string[] = [
    "INVALID_POLICY",
    "INSTRUMENT_CURRENCIES_MISSING",
    "SOURCE_IDENTITY_MISMATCH",
    "SOURCE_TIMESTAMP_INVALID",
    "SOURCE_TIMESTAMP_IN_FUTURE",
    "ITEMS_MISSING",
    "INVALID_ITEM",
    "INVALID_PUBLICATION_TIMESTAMP",
    "PUBLICATION_IN_FUTURE",
    "ITEM_PROVENANCE_MISSING",
    "ITEM_SOURCE_IDENTITY_MISMATCH",
    "INVALID_EVENT_TIMESTAMP",
    "EVENT_OUTSIDE_HORIZON",
  ];
  const blocked = findings.some((finding) => blockingCodes.includes(finding.code));
  const incomplete = findings.length > 0;
  return buildResult(
    input,
    findings,
    assessment,
    blocked ? "REJECTED" : incomplete ? "INCOMPLETE" : "COMPLETE",
    blocked || incomplete ? "INCOMPLETE" : "READY",
  );
}
