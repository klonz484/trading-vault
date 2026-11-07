/**
 * Controlled experiment evaluation. Passing results only qualify for owner review;
 * they never change shared Brain rules or production behavior automatically.
 */
export const EXPERIMENT_ENGINE_VERSION = "0.1.0" as const;
export type MetricDirection = "HIGHER_IS_BETTER" | "LOWER_IS_BETTER";
export type ExperimentMetric = { name: string; direction: MetricDirection; baseline: number; candidate: number; minimumImprovement: number };
export type ExperimentGuardrail = { name: string; direction: MetricDirection; baseline: number; candidate: number; maximumDegradation: number };
export type ExperimentInput = {
  experimentId: string;
  hypothesis: string;
  ownerApprovedProtocol: boolean;
  strategyVersion: string;
  brainVersion: string;
  datasetHash: string;
  datasetVerified: boolean;
  trainStartUtc: string;
  trainEndUtc: string;
  testStartUtc: string;
  testEndUtc: string;
  sampleCount: number;
  minimumSampleCount: number;
  primaryMetric: ExperimentMetric;
  guardrails: ExperimentGuardrail[];
};
export type ExperimentResult = {
  engineVersion: typeof EXPERIMENT_ENGINE_VERSION;
  experimentId: string;
  status: "INVALID" | "INCOMPLETE" | "REJECTED" | "ELIGIBLE_FOR_OWNER_REVIEW";
  primaryMetric: { name: string; baseline: number; candidate: number; improvement: number; minimumRequired: number } | null;
  guardrails: Array<{ name: string; degradation: number; maximumAllowed: number; status: "PASS" | "FAIL" }>;
  warnings: string[];
  sharedBrainChangeAuthorized: false;
  productionActivationAuthorized: false;
};
const finite = (v: number) => Number.isFinite(v);
function improvement(baseline: number, candidate: number, direction: MetricDirection): number {
  return direction === "HIGHER_IS_BETTER" ? candidate - baseline : baseline - candidate;
}
export function evaluateExperiment(input: ExperimentInput): ExperimentResult {
  const errors: string[] = [];
  if (!input.experimentId?.trim() || !input.hypothesis?.trim() || !input.strategyVersion?.trim() || !input.brainVersion?.trim()) errors.push("Experiment identity, hypothesis, strategy version and Brain version are required.");
  if (!input.datasetVerified || !/^[a-fA-F0-9]{32,128}$/.test(input.datasetHash)) errors.push("A verified dataset and 32–128 character hexadecimal dataset hash are required.");
  const parseUtcTimestamp = (value: string): number | null => {
    if (typeof value !== "string") return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(value);
    if (!match) return null;
    const [, yearText, monthText, dayText, hourText, minuteText, secondText, fractionText] = match;
    const year = Number(yearText), month = Number(monthText), day = Number(dayText);
    const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText);
    if (year < 1000 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return null;
    const millis = Number((fractionText ?? "").padEnd(3, "0") || "0");
    const timestamp = Date.UTC(year, month - 1, day, hour, minute, second, millis);
    const parsed = new Date(timestamp);
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day || parsed.getUTCHours() !== hour || parsed.getUTCMinutes() !== minute || parsed.getUTCSeconds() !== second || parsed.getUTCMilliseconds() !== millis) return null;
    return timestamp;
  };
  const trainStart = parseUtcTimestamp(input.trainStartUtc), trainEnd = parseUtcTimestamp(input.trainEndUtc), testStart = parseUtcTimestamp(input.testStartUtc), testEnd = parseUtcTimestamp(input.testEndUtc);
  if ([trainStart, trainEnd, testStart, testEnd].some(value => value === null)) errors.push("All experiment period boundaries must be real calendar-valid UTC ISO timestamps ending in Z.");
  if (trainStart !== null && trainEnd !== null && testStart !== null && testEnd !== null && (trainEnd <= trainStart || testStart <= trainEnd || testEnd <= testStart)) errors.push("Training and out-of-sample test periods must be valid, ordered, non-overlapping UTC intervals.");
  if (!Number.isInteger(input.sampleCount) || input.sampleCount < 0 || !Number.isInteger(input.minimumSampleCount) || input.minimumSampleCount < 1) errors.push("Sample counts must be valid non-negative/positive integers.");
  if (!input.primaryMetric?.name?.trim() || !["HIGHER_IS_BETTER", "LOWER_IS_BETTER"].includes(input.primaryMetric.direction) || !finite(input.primaryMetric.baseline) || !finite(input.primaryMetric.candidate) || !finite(input.primaryMetric.minimumImprovement) || input.primaryMetric.minimumImprovement < 0) errors.push("Primary metric and non-negative minimum improvement must be valid.");
  if (!Array.isArray(input.guardrails)) errors.push("Guardrails must be supplied as an array, including an empty array when none are registered.");
  const guardrailNames = new Set<string>();
  for (const g of (Array.isArray(input.guardrails) ? input.guardrails : [])) {
    if (!g || typeof g !== "object" || !g.name?.trim() || !["HIGHER_IS_BETTER", "LOWER_IS_BETTER"].includes(g.direction) || !finite(g.baseline) || !finite(g.candidate) || !finite(g.maximumDegradation) || g.maximumDegradation < 0) {
      errors.push("A guardrail metric is invalid.");
      continue;
    }
    if (guardrailNames.has(g.name)) errors.push("Guardrail metric names must be unique.");
    guardrailNames.add(g.name);
  }
  const base = { engineVersion: EXPERIMENT_ENGINE_VERSION, experimentId: input.experimentId, sharedBrainChangeAuthorized: false as const, productionActivationAuthorized: false as const };
  if (errors.length) return { ...base, status: "INVALID", primaryMetric: null, guardrails: [], warnings: errors };
  if (!input.ownerApprovedProtocol || !input.datasetVerified || input.sampleCount < input.minimumSampleCount) {
    const warnings = [];
    if (!input.ownerApprovedProtocol) warnings.push("The experiment protocol has not received owner approval.");
    if (input.sampleCount < input.minimumSampleCount) warnings.push("Out-of-sample count is below the pre-registered minimum.");
    return { ...base, status: "INCOMPLETE", primaryMetric: null, guardrails: [], warnings };
  }
  const primaryImprovement = improvement(input.primaryMetric.baseline, input.primaryMetric.candidate, input.primaryMetric.direction);
  const primaryMetric = { name: input.primaryMetric.name, baseline: input.primaryMetric.baseline, candidate: input.primaryMetric.candidate, improvement: primaryImprovement, minimumRequired: input.primaryMetric.minimumImprovement };
  const guardrails = input.guardrails.map(g => {
    const degradation = -improvement(g.baseline, g.candidate, g.direction);
    return { name: g.name, degradation, maximumAllowed: g.maximumDegradation, status: degradation <= g.maximumDegradation ? "PASS" as const : "FAIL" as const };
  });
  if (primaryImprovement < input.primaryMetric.minimumImprovement) return { ...base, status: "REJECTED", primaryMetric, guardrails, warnings: ["The pre-registered primary metric did not meet its minimum improvement."] };
  if (guardrails.some(g => g.status === "FAIL")) return { ...base, status: "REJECTED", primaryMetric, guardrails, warnings: ["At least one pre-registered guardrail exceeded its permitted degradation."] };
  return { ...base, status: "ELIGIBLE_FOR_OWNER_REVIEW", primaryMetric, guardrails, warnings: ["This result is only eligible for independent owner review; no shared Brain or production change is authorized."] };
}
