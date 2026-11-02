import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock

from stagehand_gemini_sdk import ComputerUseRunner
from stagehand_gemini_sdk.actions import coordinate, execute
from stagehand_gemini_sdk.observation import observe
from stagehand_gemini_sdk.response import respond


async def run(client, page, *, prompt, model, max_turns=20):
    browser = SimpleNamespace(
        observe=lambda: observe(page), respond=lambda call, confirm: respond(page, call, confirm)
    )
    return await ComputerUseRunner(browser=browser).run(
        client, model=model, input=prompt, max_turns=max_turns
    )


def call(name="click", **arguments):
    return SimpleNamespace(type="function_call", id="call-1", name=name, arguments=arguments)


def page():
    result = AsyncMock()
    result.url.return_value = "https://example.com"
    result.screenshot.return_value = b"png"
    return result


class ToolsetTests(unittest.IsolatedAsyncioTestCase):
    def test_coordinates(self):
        self.assertEqual(coordinate(500, 1440), 720)
        self.assertEqual(coordinate(1000, 900), 899)
        for value in (-1, float("nan"), float("inf"), "500", None, 1001, True):
            with self.assertRaises(ValueError):
                coordinate(value, 900)

    async def test_actions(self):
        p = page()
        await execute(p, call("type", x=500, y=500, text="hello", press_enter=True))
        p.click.assert_awaited_once_with(720, 450)
        p.type.assert_awaited_once_with("hello")
        await execute(p, call("hotkey", keys=["ctrl", "a"]))
        p.key_press.assert_awaited_with("Control+a")
        await execute(p, call("drag_and_drop", x=0, y=0, destination_x=1000, destination_y=1000))
        p.drag_and_drop.assert_awaited_once_with(0, 0, 1439, 899, steps=10)
        await execute(p, call("scroll", direction="left", magnitude_in_pixels=125))
        p.scroll.assert_awaited_once_with(720, 450, -125, 0)

    async def test_fractional_wait(self):
        p = page()
        await execute(p, call("wait", seconds=0.001))
        p.wait_for_timeout.assert_awaited_once_with(1)
        self.assertIs(type(p.wait_for_timeout.await_args.args[0]), int)

    async def test_safety(self):
        p = page()
        for decision in ("blocked", "require_confirmation", "unknown"):
            with self.assertRaises(RuntimeError):
                await respond(p, call(x=1, y=1, safety_decision={"decision": decision}))
        p.click.assert_not_awaited()
        result = await respond(
            p,
            call(x=1, y=1, safety_decision={"decision": "require_confirmation"}),
            AsyncMock(return_value=True),
        )
        self.assertTrue(json.loads(result["result"][0]["text"])["safety_acknowledgement"])
        p.click.assert_awaited_once()

    async def test_action_error(self):
        result = await respond(page(), call("unsupported"))
        self.assertTrue(result["is_error"])
        self.assertEqual(result["result"][1]["mime_type"], "image/png")

    async def test_loop(self):
        client = SimpleNamespace(
            interactions=SimpleNamespace(
                create=AsyncMock(
                    side_effect=[
                        SimpleNamespace(
                            id="first", status="requires_action", steps=[call(x=0, y=0)]
                        ),
                        SimpleNamespace(
                            id="second", status="completed", steps=[], output_text="Example Domain"
                        ),
                    ]
                )
            )
        )
        result = await run(client, page(), prompt="Read", model="test")
        self.assertEqual(result.output_text, "Example Domain")
        requests = client.interactions.create.await_args_list
        self.assertEqual(requests[0].kwargs["input"][2]["type"], "image")
        self.assertEqual(
            requests[0].kwargs["tools"][0]["excluded_predefined_functions"],
            ["mouse_down", "mouse_up", "key_down", "key_up"],
        )
        self.assertEqual(requests[1].kwargs["previous_interaction_id"], "first")
        self.assertEqual(requests[1].kwargs["input"][0]["call_id"], "call-1")

    async def test_failed_status_and_budget(self):
        p = page()
        for status in ("failed", "requires_action"):
            client = SimpleNamespace(
                interactions=SimpleNamespace(
                    create=AsyncMock(
                        return_value=SimpleNamespace(
                            id="first", status=status, steps=[call(x=0, y=0)]
                        )
                    )
                )
            )
            with self.assertRaises(RuntimeError):
                await run(client, p, prompt="Read", model="test", max_turns=1)
        p.click.assert_not_awaited()


class AdditionalTests(unittest.IsolatedAsyncioTestCase):
    async def test_custom_viewport(self):
        from stagehand_gemini_sdk import Viewport

        p = page()
        await execute(p, call(x=500, y=500), Viewport(800, 600))
        p.click.assert_awaited_once_with(400, 300, button="left", click_count=1)

    async def test_truthy_confirmation_is_not_approval(self):
        p = page()
        with self.assertRaises(RuntimeError):
            await respond(
                p,
                call(x=0, y=0, safety_decision={"decision": "require_confirmation"}),
                AsyncMock(return_value="yes"),
            )
        p.click.assert_not_awaited()

    async def test_observation_failure_propagates(self):
        p = page()
        p.screenshot.side_effect = RuntimeError("lost screenshot")
        with self.assertRaisesRegex(RuntimeError, "lost screenshot"):
            await respond(p, call("screenshot"))

    async def test_duplicate_call_ids(self):
        p = page()
        client = SimpleNamespace(
            interactions=SimpleNamespace(
                create=AsyncMock(
                    return_value=SimpleNamespace(
                        id="first", status="requires_action", steps=[call(x=0, y=0), call(x=1, y=1)]
                    )
                )
            )
        )
        with self.assertRaisesRegex(RuntimeError, "duplicate"):
            await run(client, p, prompt="Read", model="test")
        p.click.assert_not_awaited()


class DocumentedActionsTests(unittest.IsolatedAsyncioTestCase):
    async def test_press_key_and_take_screenshot(self):
        p = page()
        await execute(p, call("press_key", key="esc"))
        p.key_press.assert_awaited_once_with("Escape")
        result = await respond(p, call("take_screenshot"))
        self.assertNotIn("is_error", result)
        self.assertEqual(result["result"][1]["mime_type"], "image/png")
        with self.assertRaisesRegex(ValueError, "Empty key"):
            await execute(p, call("press_key", key=""))
        p.key_press.assert_awaited_once()
