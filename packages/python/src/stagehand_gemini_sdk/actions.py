from __future__ import annotations

import math
from typing import Any
from urllib.parse import urlparse

from google.genai.interactions import FunctionCallStep
from stagehand import Page

from .types import DEFAULT_VIEWPORT, Viewport


def number(value: Any, name: str, maximum: float = math.inf) -> float:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(value)
        or not 0 <= value <= maximum
    ):
        raise ValueError(f"{name} must be a finite number between 0 and {maximum}")
    return value


def coordinate(value: Any, size: int) -> int:
    return min(size - 1, math.floor(number(value, "coordinate", 1000) / 1000 * size))


def text(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("Expected a string")
    return value


KEY_NAMES = {"ctrl": "Control", "cmd": "Meta", "esc": "Escape", "enter": "Enter", "space": "Space"}


def key_name(value: Any) -> str:
    key = text(value)
    if not key.strip():
        raise ValueError("Empty key")
    return KEY_NAMES.get(key.lower(), key)


async def execute(
    page: Page, call: FunctionCallStep, viewport: Viewport = DEFAULT_VIEWPORT
) -> None:
    a = call.arguments

    def point() -> tuple[int, int]:
        return coordinate(a.get("x"), viewport.width), coordinate(a.get("y"), viewport.height)

    name = call.name
    if name in ("open_app", "open_web_browser", "take_screenshot", "screenshot"):
        return
    if name in ("click", "double_click", "triple_click", "right_click", "middle_click"):
        await page.click(
            *point(),
            button="right"
            if name == "right_click"
            else "middle"
            if name == "middle_click"
            else "left",
            click_count={"double_click": 2, "triple_click": 3}.get(name, 1),
        )
    elif name == "move":
        await page.hover(*point())
    elif name == "type":
        value = text(a.get("text"))
        if "x" in a or "y" in a:
            await page.click(*point())
        if a.get("clear_before_typing") is not False:
            await page.key_press("ControlOrMeta+a")
            await page.key_press("Backspace")
        await page.type(value)
        if a.get("press_enter") is True:
            await page.key_press("Enter")
    elif name == "press_key":
        await page.key_press(key_name(a.get("key")))
    elif name == "hotkey":
        keys = a.get("keys")
        if not isinstance(keys, list) or not keys:
            raise ValueError("hotkey requires keys")
        await page.key_press("+".join(key_name(key) for key in keys))
    elif name == "scroll":
        amount = number(
            a.get("magnitude_in_pixels", a.get("magnitude", 300)),
            "scroll amount",
            10000,
        )
        direction = a.get("direction", "down")
        if direction not in ("up", "down", "left", "right"):
            raise ValueError("Invalid scroll direction")
        x, y = point() if "x" in a or "y" in a else (viewport.width / 2, viewport.height / 2)
        await page.scroll(
            x,
            y,
            -amount if direction == "left" else amount if direction == "right" else 0,
            -amount if direction == "up" else amount if direction == "down" else 0,
        )
    elif name == "drag_and_drop":
        await page.drag_and_drop(
            coordinate(a.get("start_x", a.get("x")), viewport.width),
            coordinate(a.get("start_y", a.get("y")), viewport.height),
            coordinate(a.get("end_x", a.get("destination_x")), viewport.width),
            coordinate(a.get("end_y", a.get("destination_y")), viewport.height),
            steps=10,
        )
    elif name == "navigate":
        url = text(a.get("url"))
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            raise ValueError("Only HTTP(S) navigation is supported")
        await page.goto(url)
    elif name == "go_back":
        await page.go_back()
    elif name == "go_forward":
        await page.go_forward()
    elif name == "wait":
        await page.wait_for_timeout(round(number(a.get("seconds", 1), "wait seconds", 30) * 1000))
    else:
        raise ValueError(f"Unsupported computer-use action: {name}")
