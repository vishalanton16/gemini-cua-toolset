from google.genai.interactions import FunctionCallStep
from stagehand import Page

from .actions import execute
from .observation import observe
from .safety import confirm_action
from .types import DEFAULT_VIEWPORT, Confirm, Viewport


async def respond(
    page: Page,
    call: FunctionCallStep,
    confirm: Confirm | None = None,
    viewport: Viewport = DEFAULT_VIEWPORT,
) -> dict[str, object]:
    acknowledged = await confirm_action(call, confirm)
    metadata: dict[str, object] = {}
    try:
        await execute(page, call, viewport)
    except Exception as error:
        metadata["error"] = str(error)
    if acknowledged:
        metadata["safety_acknowledgement"] = True
    return {
        "type": "function_result",
        "call_id": call.id,
        "name": call.name,
        **({"is_error": True} if "error" in metadata else {}),
        "result": await observe(page, metadata),
    }
