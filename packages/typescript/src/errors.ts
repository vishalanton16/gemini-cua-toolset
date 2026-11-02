export class SafetyDecisionError extends Error {
  override name = "SafetyDecisionError";
}
export class InteractionError extends Error {
  override name = "InteractionError";
}
export class MaxTurnsError extends InteractionError {
  override name = "MaxTurnsError";
}
