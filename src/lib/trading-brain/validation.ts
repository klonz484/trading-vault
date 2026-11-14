import type {
  EvidenceBundle,
  EvidenceReference,
  ScenarioState,
  TradingScenario,
} from "./contracts";

export interface ValidationIssue {
  code: string;
  message: string;
  evidenceId?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

function isNonEmpty(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

/**
 * Validates an evidence record without changing or promoting its state.
 * A confirmed event must have valid quality and an explicit confirmation time.
 */
export function validateEvidence(record: EvidenceReference): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const required: Array<[string, string]> = [
    ["evidenceId", record.evidenceId],
    ["sourceEngine", record.sourceEngine],
    ["sourceRecordId", record.sourceRecordId],
    ["sourceSchemaVersion", record.sourceSchemaVersion],
    ["instrument", record.instrument],
    ["timeframe", record.timeframe],
  ];

  for (const [field, value] of required) {
    if (!isNonEmpty(value)) {
      issues.push({
        code: "EVIDENCE_REQUIRED_FIELD_MISSING",
        message: `Evidence field "${field}" must be a non-empty string.`,
        evidenceId: record.evidenceId,
      });
    }
  }

  if (!isValidDate(record.observedAt) || !isValidDate(record.detectedAt)) {
    issues.push({
      code: "EVIDENCE_TIMESTAMP_INVALID",
      message: "Evidence observedAt and detectedAt must be valid timestamps.",
      evidenceId: record.evidenceId,
    });
  }

  if (record.state === "confirmed") {
    if (!isNonEmpty(record.confirmedAt) || !isValidDate(record.confirmedAt)) {
      issues.push({
        code: "CONFIRMATION_TIMESTAMP_REQUIRED",
        message: "Confirmed evidence requires a valid confirmedAt timestamp.",
        evidenceId: record.evidenceId,
      });
    }
    if (record.quality !== "valid") {
      issues.push({
        code: "CONFIRMED_EVIDENCE_QUALITY_INVALID",
        message: "Only valid-quality evidence may be marked confirmed.",
        evidenceId: record.evidenceId,
      });
    }
  }

  if (record.state === "provisional" && record.confirmedAt) {
    issues.push({
      code: "PROVISIONAL_HAS_CONFIRMATION_TIME",
      message: "Provisional evidence cannot carry a confirmedAt timestamp.",
      evidenceId: record.evidenceId,
    });
  }

  if (record.quality === "stale" || record.quality === "rejected") {
    if (record.state === "confirmed") {
      issues.push({
        code: "UNTRUSTED_EVIDENCE_CANNOT_CONFIRM",
        message: "Stale or rejected evidence cannot satisfy a confirmed event.",
        evidenceId: record.evidenceId,
      });
    }
  }

  return issues;
}

/** Validates a bundle and rejects duplicate IDs rather than double-counting them. */
export function validateEvidenceBundle(bundle: EvidenceBundle): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (!isNonEmpty(bundle.bundleId) || !isNonEmpty(bundle.bundleVersion)) {
    issues.push({
      code: "BUNDLE_IDENTITY_MISSING",
      message: "Evidence bundle requires bundleId and bundleVersion.",
    });
  }

  if (!isNonEmpty(bundle.instrument) || !isValidDate(bundle.createdAt)) {
    issues.push({
      code: "BUNDLE_METADATA_INVALID",
      message: "Evidence bundle requires an instrument and valid createdAt timestamp.",
    });
  }

  const seen = new Set<string>();
  for (const evidence of bundle.evidence) {
    if (seen.has(evidence.evidenceId)) {
      issues.push({
        code: "DUPLICATE_EVIDENCE_ID",
        message: "Evidence IDs must be unique within a bundle.",
        evidenceId: evidence.evidenceId,
      });
      continue;
    }
    seen.add(evidence.evidenceId);
    issues.push(...validateEvidence(evidence));
  }

  return { valid: issues.length === 0, issues };
}

const ALLOWED_SCENARIO_TRANSITIONS: Record<ScenarioState, readonly ScenarioState[]> = {
  candidate: ["waiting_for_trigger", "suspended", "cancelled", "superseded", "expired"],
  waiting_for_trigger: ["trigger_observed_provisional", "confirmed", "invalidated", "suspended", "cancelled", "superseded", "expired"],
  trigger_observed_provisional: ["waiting_for_trigger", "confirmed", "invalidated", "suspended", "cancelled", "superseded", "expired"],
  confirmed: ["invalidated", "expired", "cancelled", "superseded", "suspended"],
  invalidated: [],
  expired: [],
  cancelled: [],
  suspended: ["waiting_for_trigger", "trigger_observed_provisional", "confirmed", "invalidated", "cancelled", "superseded", "expired"],
  superseded: [],
};

/** Pure transition guard. It does not persist or mutate a scenario. */
export function canTransitionScenario(
  from: ScenarioState,
  to: ScenarioState,
): boolean {
  return ALLOWED_SCENARIO_TRANSITIONS[from].includes(to);
}

/**
 * A scenario must have explicit identity, scope, and well-formed conditions.
 * Confirmed-only conditions cannot be driven by a forming candle.
 */
export function validateScenario(scenario: TradingScenario): ValidationResult {
  const issues: ValidationIssue[] = [];

  if (
    !isNonEmpty(scenario.scenarioId) ||
    !isNonEmpty(scenario.scenarioVersion) ||
    !isNonEmpty(scenario.instrument) ||
    !isNonEmpty(scenario.timeframe) ||
    !isNonEmpty(scenario.evidenceBundleId)
  ) {
    issues.push({
      code: "SCENARIO_REQUIRED_FIELD_MISSING",
      message: "Scenario identity, instrument, timeframe, and evidence bundle are required.",
    });
  }

  if (scenario.scope === "private_trader" && !isNonEmpty(scenario.ownerId)) {
    issues.push({
      code: "PRIVATE_SCENARIO_OWNER_REQUIRED",
      message: "Private trader scenarios require an ownerId.",
    });
  }

  if (scenario.scope === "shared_core" && scenario.ownerId) {
    issues.push({
      code: "SHARED_SCENARIO_OWNER_SCOPE_MISMATCH",
      message: "Shared Core scenarios must not carry a private trader ownerId.",
    });
  }

  if (!isValidDate(scenario.createdAt)) {
    issues.push({
      code: "SCENARIO_CREATED_AT_INVALID",
      message: "Scenario createdAt must be a valid timestamp.",
    });
  }

  if (scenario.expiresAt) {
    if (!isValidDate(scenario.expiresAt)) {
      issues.push({
        code: "SCENARIO_EXPIRY_INVALID",
        message: "Scenario expiresAt must be a valid timestamp when supplied.",
      });
    } else if (isValidDate(scenario.createdAt) && Date.parse(scenario.expiresAt) <= Date.parse(scenario.createdAt)) {
      issues.push({
        code: "SCENARIO_EXPIRY_NOT_AFTER_CREATION",
        message: "Scenario expiresAt must be later than createdAt.",
      });
    }
  }

  if (scenario.triggerConditions.length === 0) {
    issues.push({
      code: "SCENARIO_TRIGGER_REQUIRED",
      message: "A scenario requires at least one explicit trigger condition.",
    });
  }

  const conditionIds = new Set<string>();
  const conditionGroups = [
    ["trigger", scenario.triggerConditions],
    ["confirmation", scenario.confirmationConditions],
    ["invalidation", scenario.invalidationConditions],
  ] as const;

  for (const [groupName, conditions] of conditionGroups) {
    for (const condition of conditions) {
      if (
        !isNonEmpty(condition.conditionId) ||
        !isNonEmpty(condition.description) ||
        !isNonEmpty(condition.sourceEngine) ||
        !isNonEmpty(condition.sourceEventType) ||
        !isNonEmpty(condition.instrument) ||
        !isNonEmpty(condition.timeframe)
      ) {
        issues.push({
          code: "SCENARIO_CONDITION_REQUIRED_FIELD_MISSING",
          message: `Every ${groupName} condition requires an ID, description, source, instrument, and timeframe.`,
        });
      }

      if (conditionIds.has(condition.conditionId)) {
        issues.push({
          code: "SCENARIO_CONDITION_ID_DUPLICATE",
          message: "Condition IDs must be unique across a scenario.",
        });
      }
      conditionIds.add(condition.conditionId);

      if (condition.comparator && (condition.threshold === undefined || !Number.isFinite(condition.threshold))) {
        issues.push({
          code: "SCENARIO_CONDITION_THRESHOLD_INVALID",
          message: "A numeric finite threshold is required when a comparator is supplied.",
        });
      }

      if (
        condition.requiredState === "confirmed" &&
        condition.candleRequirement === "forming_allowed"
      ) {
        issues.push({
          code: "CONFIRMED_CONDITION_ALLOWS_FORMING_CANDLE",
          message: "A confirmed condition cannot rely on a forming candle.",
        });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}
