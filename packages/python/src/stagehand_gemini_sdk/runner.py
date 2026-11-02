from __future__ import annotations

from typing import Any, Protocol, cast

from google.genai.client import AsyncClient
from google.genai.interactions import FunctionCallStep, Interaction

from .errors import InteractionError, MaxTurnsError
from .types import Confirm


class BrowserToolset(Protocol):
    async def observe(self) -> list[dict[str, str]]: ...
    async def respond(
        self, call: FunctionCallStep, confirm: Confirm | None = None
    ) -> dict[str, object]: ...


class ComputerUseRunner:
    def __init__(self, *, browser: BrowserToolset, confirm: Confirm | None = None) -> None:
        self._browser = browser
        self._confirm = confirm

    async def run(
        self,
        client: AsyncClient,
        *,
        model: str,
        input: str,
        max_turns: int = 20,
        system_instruction: str | None = None,
    ) -> Interaction:
        if type(max_turns) is not int or max_turns < 1:
            raise ValueError("max_turns must be a positive integer")
        if not model.strip() or not input.strip():
            raise ValueError("Model and input must be non-empty strings")
        config: dict[str, Any] = {
            "model": model,
            "stream": False,
            "tools": [
                {
                    "type": "computer_use",
                    "environment": "browser",
                    "enable_prompt_injection_detection": True,
                    "excluded_predefined_functions": [
                        "mouse_down",
                        "mouse_up",
                        "key_down",
                        "key_up",
                    ],
                }
            ],
        }
        if system_instruction is not None:
            config["system_instruction"] = system_instruction
        interaction = cast(
            Interaction,
            await client.interactions.create(
                **config, input=[{"type": "text", "text": input}, *await self._browser.observe()]
            ),
        )
        for turn in range(1, max_turns + 1):
            if interaction.status not in ("completed", "requires_action"):
                raise InteractionError(f"Interaction ended with status {interaction.status}")
            calls = [step for step in (interaction.steps or []) if step.type == "function_call"]
            if not calls:
                if interaction.status != "completed":
                    raise InteractionError("Interaction requires action but returned no calls")
                return interaction
            if turn >= max_turns:
                raise MaxTurnsError(f"Reached {max_turns} model turns")
            # Validate the whole batch before executing its first action.
            ids: set[str] = set()
            for call in calls:
                if (
                    not isinstance(call.id, str)
                    or not call.id.strip()
                    or call.id in ids
                    or not isinstance(call.name, str)
                    or not call.name.strip()
                    or not isinstance(call.arguments, dict)
                ):
                    raise InteractionError("Malformed or duplicate function call")
                ids.add(call.id)
            results = [await self._browser.respond(call, self._confirm) for call in calls]
            interaction = cast(
                Interaction,
                await client.interactions.create(
                    **config,
                    previous_interaction_id=interaction.id,
                    input=results,
                ),
            )
        raise AssertionError("Unreachable")
