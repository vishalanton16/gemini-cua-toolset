from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from google.genai.interactions import FunctionCallStep

Confirm = Callable[[FunctionCallStep], Awaitable[bool]]


@dataclass(frozen=True)
class Viewport:
    width: int = 1440
    height: int = 900

    def __post_init__(self) -> None:
        if any(type(value) is not int or value <= 0 for value in (self.width, self.height)):
            raise ValueError("Viewport dimensions must be positive integers")


DEFAULT_VIEWPORT = Viewport()
