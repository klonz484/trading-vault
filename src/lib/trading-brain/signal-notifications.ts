import type { SignalLifecycleStatus } from "./signal-lifecycle";

export type SignalNotificationKind =
  | "SIGNAL_ACTIVE"
  | "SIGNAL_SUSPENDED"
  | "SIGNAL_INVALIDATED"
  | "SIGNAL_EXPIRED";

export interface SignalNotificationInput {
  signalId: string;
  instrument: string;
  track: "CURRENT" | "SESSION";
  status: SignalLifecycleStatus;
  previousStatus: SignalLifecycleStatus | null;
  revision: number;
}

export interface SignalNotification {
  kind: SignalNotificationKind;
  signalId: string;
  instrument: string;
  track: "CURRENT" | "SESSION";
  subject: string;
  summary: string;
  idempotencyKey: string;
}

/**
 * Builds an email event only for a meaningful lifecycle transition.
 * This is a pure notification policy: it does not send email or activate signals.
 */
export function buildSignalNotification(
  input: SignalNotificationInput,
): SignalNotification | null {
  if (!input.signalId.trim() || !input.instrument.trim()) return null;
  if (!Number.isInteger(input.revision) || input.revision < 1) return null;

  let kind: SignalNotificationKind;
  let subject: string;
  let summary: string;

  if (input.status === "ACTIVE" && input.previousStatus !== "ACTIVE") {
    kind = "SIGNAL_ACTIVE";
    subject = `${input.instrument} signal is now active`;
    summary = "A previously monitored scenario passed its required evidence, confirmation and risk gates.";
  } else if (input.previousStatus === "ACTIVE" && input.status === "SUSPENDED") {
    kind = "SIGNAL_SUSPENDED";
    subject = `${input.instrument} signal has been suspended`;
    summary = "A required evidence or data-quality gate is no longer satisfied. Do not treat this signal as actionable.";
  } else if (input.previousStatus === "ACTIVE" && input.status === "INVALIDATED") {
    kind = "SIGNAL_INVALIDATED";
    subject = `${input.instrument} signal has been invalidated`;
    summary = "The scenario invalidation condition was confirmed. The signal is no longer valid.";
  } else if (input.previousStatus === "ACTIVE" && input.status === "EXPIRED") {
    kind = "SIGNAL_EXPIRED";
    subject = `${input.instrument} signal has expired`;
    summary = "The signal validity window ended. Do not use the old plan.";
  } else {
    return null;
  }

  return {
    kind,
    signalId: input.signalId,
    instrument: input.instrument,
    track: input.track,
    subject,
    summary,
    idempotencyKey: `${input.signalId}:${kind}:v${input.revision}`,
  };
}

/** Returns true when a durable outbox has already recorded this exact event. */
export function shouldDeliverSignalNotification(
  notification: SignalNotification,
  previouslyDeliveredKeys: ReadonlySet<string>,
): boolean {
  return !previouslyDeliveredKeys.has(notification.idempotencyKey);
}
