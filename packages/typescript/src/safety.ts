import { SafetyDecisionError } from "./errors.js";
import type { Confirm, FunctionCall } from "./types.js";

export async function confirmAction(
  call: FunctionCall,
  confirm?: Confirm,
): Promise<boolean> {
  const decision: unknown = call.arguments.safety_decision;
  if (decision === undefined) return false;
  if (!decision || typeof decision !== "object" || !("decision" in decision))
    throw new SafetyDecisionError("Malformed computer-use safety decision");
  if (decision.decision === "allowed" || decision.decision === "regular")
    return false;
  if (decision.decision !== "require_confirmation")
    throw new SafetyDecisionError(
      "Computer-use action blocked by safety policy",
    );
  if (!confirm || (await confirm(call)) !== true)
    throw new SafetyDecisionError(
      "Computer-use confirmation declined or unavailable",
    );
  return true;
}
