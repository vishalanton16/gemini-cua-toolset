from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from types import TracebackType

from google.genai.interactions import FunctionCallStep
from stagehand import DomainPolicyInput, Page, Stagehand, browserbase, local_browser
from stagehand import StagehandBrowser as BrowserHandle

from .observation import observe
from .response import respond
from .types import DEFAULT_VIEWPORT, Confirm, Viewport


class StagehandBrowser:
    def __init__(self, handle: BrowserHandle, page: Page, viewport: Viewport) -> None:
        self._handle = handle
        self.page = page
        self.viewport = viewport

    @classmethod
    async def launch(
        cls,
        *,
        headless: bool = False,
        chrome_path: str | Path | None = None,
        allowed_domains: Sequence[str] | None = None,
        blocked_domains: Sequence[str] | None = None,
        viewport: Viewport = DEFAULT_VIEWPORT,
    ) -> StagehandBrowser:
        handle = await local_browser.launch(
            headless=headless,
            executable_path=chrome_path,
            viewport_width=viewport.width,
            viewport_height=viewport.height,
        )
        return await cls._attach(handle, allowed_domains, blocked_domains, viewport)

    @classmethod
    async def browserbase(
        cls,
        *,
        api_key: str,
        allowed_domains: Sequence[str] | None = None,
        blocked_domains: Sequence[str] | None = None,
        viewport: Viewport = DEFAULT_VIEWPORT,
    ) -> StagehandBrowser:
        handle = await browserbase.launch(api_key=api_key)
        return await cls._attach(handle, allowed_domains, blocked_domains, viewport)

    @classmethod
    async def _attach(
        cls,
        handle: BrowserHandle,
        allowed: Sequence[str] | None,
        blocked: Sequence[str] | None,
        viewport: Viewport,
    ) -> StagehandBrowser:
        try:
            await Stagehand.create(browser=handle)
            policy: DomainPolicyInput = {}
            if allowed is not None:
                policy["allowed_domains"] = list(allowed)
            if blocked is not None:
                policy["blocked_domains"] = list(blocked)
            await handle.context.set_domain_policy(policy)
            page = await handle.context.new_page()
            await page.set_viewport_size(viewport.width, viewport.height)
            return cls(handle, page, viewport)
        except BaseException as cause:
            try:
                await handle.close()
            except BaseException as cleanup:
                raise BaseExceptionGroup(
                    "Browser initialization and cleanup failed", [cause, cleanup]
                ) from None
            raise

    @property
    def closed(self) -> bool:
        return self._handle.closed

    def _assert_open(self) -> None:
        if self._handle.closed:
            raise RuntimeError("Browser is closed or disconnected")

    async def observe(self) -> list[dict[str, str]]:
        self._assert_open()
        return await observe(self.page)

    async def respond(
        self, call: FunctionCallStep, confirm: Confirm | None = None
    ) -> dict[str, object]:
        self._assert_open()
        return await respond(self.page, call, confirm, self.viewport)

    async def close(self) -> None:
        await self._handle.close()

    async def __aenter__(self) -> StagehandBrowser:
        self._assert_open()
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        await self.close()
