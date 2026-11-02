from google.genai.interactions import FunctionCallStep

from .errors import SafetyDecisionError
from .types import Confirm


async def confirm_action(call: FunctionCallStep, confirm: Confirm | None = None) -> bool:
    if "safety_decision" not in call.arguments:
        return False
    decision = call.arguments["safety_decision"]
    if not isinstance(decision, dict) or "decision" not in decision:
        raise SafetyDecisionError("Malformed computer-use safety decision")
    if decision["decision"] in ("allowed", "regular"):
        return False
    if decision["decision"] != "require_confirmation":
        raise SafetyDecisionError("Computer-use action blocked by safety policy")
    if confirm is None or await confirm(call) is not True:
        raise SafetyDecisionError("Computer-use confirmation declined or unavailable")
    return True
