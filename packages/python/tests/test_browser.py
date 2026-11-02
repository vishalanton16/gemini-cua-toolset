import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from stagehand_gemini_sdk import StagehandBrowser, Viewport


def handle():
    return SimpleNamespace(
        closed=False,
        close=AsyncMock(),
        context=SimpleNamespace(
            set_domain_policy=AsyncMock(),
            new_page=AsyncMock(return_value=SimpleNamespace(set_viewport_size=AsyncMock())),
        ),
    )


class BrowserTests(unittest.IsolatedAsyncioTestCase):
    async def test_local_lifecycle(self):
        h = handle()
        with (
            patch(
                "stagehand_gemini_sdk.browser.local_browser.launch", AsyncMock(return_value=h)
            ) as launch,
            patch("stagehand_gemini_sdk.browser.Stagehand.create", AsyncMock()),
        ):
            browser = await StagehandBrowser.launch(
                allowed_domains=["example.com"], viewport=Viewport(800, 600), chrome_path="/chrome"
            )
            h.context.set_domain_policy.assert_awaited_once_with(
                {"allowed_domains": ["example.com"]}
            )
            launch.assert_awaited_once_with(
                headless=False, executable_path="/chrome", viewport_width=800, viewport_height=600
            )
            async with browser:
                pass
            h.close.assert_awaited_once()
            h.closed = True
            with self.assertRaises(RuntimeError):
                await browser.observe()

    async def test_hosted_initialization_failure_closes_browser(self):
        h = handle()
        with (
            patch(
                "stagehand_gemini_sdk.browser.browserbase.launch", AsyncMock(return_value=h)
            ) as launch,
            patch(
                "stagehand_gemini_sdk.browser.Stagehand.create",
                AsyncMock(side_effect=RuntimeError("init failed")),
            ),
        ):
            with self.assertRaisesRegex(RuntimeError, "init failed"):
                await StagehandBrowser.browserbase(api_key="test", allowed_domains=["example.com"])
            launch.assert_awaited_once_with(api_key="test")
            h.close.assert_awaited_once()

    async def test_setup_and_cleanup_failures_are_preserved(self):
        h = handle()
        h.close.side_effect = RuntimeError("cleanup failed")
        with (
            patch("stagehand_gemini_sdk.browser.local_browser.launch", AsyncMock(return_value=h)),
            patch(
                "stagehand_gemini_sdk.browser.Stagehand.create",
                AsyncMock(side_effect=RuntimeError("init failed")),
            ),
        ):
            with self.assertRaises(BaseExceptionGroup) as caught:
                await StagehandBrowser.launch()
            self.assertEqual(
                [str(error) for error in caught.exception.exceptions],
                ["init failed", "cleanup failed"],
            )

    def test_invalid_viewport(self):
        for width in (0, -1, 1.5, True):
            with self.assertRaises(ValueError):
                Viewport(width, 600)
