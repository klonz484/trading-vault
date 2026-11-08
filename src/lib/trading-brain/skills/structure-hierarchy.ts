import {
  assessMarketStructure,
  type MarketStructureAssessment,
  type MarketStructureInput,
  type MarketStructurePolicy,
} from "./market-structure";

export interface HierarchicalStructurePolicy {
  minimumSwingDistanceBars: number;
  breakBuffer: number;
  equalExtremePolicy: MarketStructurePolicy["equalExtremePolicy"];
}

export interface HierarchicalStructureAssessment {
  internal: MarketStructureAssessment;
  external: MarketStructureAssessment;
  internalStatus: "COMPLETE" | "INCOMPLETE" | "UNAVAILABLE" | "REJECTED";
  externalStatus: "COMPLETE" | "INCOMPLETE" | "UNAVAILABLE" | "REJECTED";
  externalBias: "BULLISH" | "BEARISH" | "RANGE_OR_UNCLEAR";
  internalBias: "BULLISH" | "BEARISH" | "RANGE_OR_UNCLEAR";
  conflict: boolean;
  lowerHierarchyChallengesExternal: boolean;
  reversalAuthority: "EXTERNAL_ONLY" | "NONE";
  findings: string[];
  ruleSetVersion: "structure-hierarchy/0.1.0";
}

const empty: MarketStructureAssessment = {
  bias: "RANGE_OR_UNCLEAR",
  swings: [],
  latestBreak: null,
};

/**
 * Resolve internal and external structure without allowing internal structure
 * to reverse the external trend. The two assessments remain independently
 * visible; disagreement is preserved rather than averaged away.
 */
export function resolveStructureHierarchy(
  internal: MarketStructureAssessment,
  external: MarketStructureAssessment,
): Pick<
  HierarchicalStructureAssessment,
  | "internal"
  | "external"
  | "internalBias"
  | "externalBias"
  | "conflict"
  | "lowerHierarchyChallengesExternal"
  | "reversalAuthority"
  | "findings"
> {
  const internalDirectional = internal.bias !== "RANGE_OR_UNCLEAR";
  const externalDirectional = external.bias !== "RANGE_OR_UNCLEAR";
  const conflict = internalDirectional && externalDirectional && internal.bias !== external.bias;
  const lowerHierarchyChallengesExternal =
    internalDirectional && (!externalDirectional || conflict);

  const findings: string[] = [];
  if (conflict) {
    findings.push(
      "Internal and external structure disagree; preserve both states and do not average them.",
    );
  } else if (lowerHierarchyChallengesExternal) {
    findings.push(
      "Internal structure is directional while external structure is unclear; this is not an external trend reversal.",
    );
  }
  if (external.latestBreak?.context === "REVERSAL_CANDIDATE") {
    findings.push(
      "A closed-candle break challenges external structure; reversal remains a candidate pending the full methodology gates.",
    );
  }

  return {
    internal,
    external,
    internalBias: internal.bias,
    externalBias: external.bias,
    conflict,
    lowerHierarchyChallengesExternal,
    reversalAuthority: external.latestBreak?.context === "REVERSAL_CANDIDATE"
      ? "EXTERNAL_ONLY"
      : "NONE",
    findings,
  };
}

/**
 * Runs the approved 2-left/2-right internal and 5-left/5-right external swing
 * windows. Other calibration values remain mandatory caller inputs because
 * their approved numeric values have not yet been established.
 */
export function assessHierarchicalStructure(
  input: MarketStructureInput,
  policy?: HierarchicalStructurePolicy,
): HierarchicalStructureAssessment & {
  status: "COMPLETE" | "INCOMPLETE" | "UNAVAILABLE" | "REJECTED";
} {
  if (
    !policy ||
    !Number.isInteger(policy.minimumSwingDistanceBars) ||
    policy.minimumSwingDistanceBars < 1 ||
    !Number.isFinite(policy.breakBuffer) ||
    policy.breakBuffer < 0 ||
    !["REJECT", "FIRST", "LAST"].includes(policy.equalExtremePolicy)
  ) {
    return {
      ...resolveStructureHierarchy(empty, empty),
      internalStatus: "INCOMPLETE",
      externalStatus: "INCOMPLETE",
      status: "INCOMPLETE",
      reversalAuthority: "NONE",
      ruleSetVersion: "structure-hierarchy/0.1.0",
      findings: [
        "An explicit hierarchy policy is required. Unapproved distance, break-buffer and equal-extreme parameters are never guessed.",
      ],
    };
  }

  const common = {
    minimumSwingDistanceBars: policy.minimumSwingDistanceBars,
    breakBuffer: policy.breakBuffer,
    equalExtremePolicy: policy.equalExtremePolicy,
    requireClosedCandleForConfirmation: true as const,
  };

  const internal = assessMarketStructure(input, {
    ...common,
    leftBars: 2,
    rightBars: 2,
  });
  const external = assessMarketStructure(input, {
    ...common,
    leftBars: 5,
    rightBars: 5,
  });

  const resolved = resolveStructureHierarchy(
    internal.assessment,
    external.assessment,
  );
  const statuses = [internal.status, external.status];
  const status = statuses.includes("REJECTED") ? "REJECTED"
    : statuses.every((value) => value === "COMPLETE") ? "COMPLETE"
    : "INCOMPLETE";

  return {
    ...resolved,
    internalStatus: internal.status,
    externalStatus: external.status,
    status,
    ruleSetVersion: "structure-hierarchy/0.1.0",
    findings: [
      ...resolved.findings,
      ...internal.findings.map((item) => `Internal: ${item.message}`),
      ...external.findings.map((item) => `External: ${item.message}`),
    ],
  };
}
