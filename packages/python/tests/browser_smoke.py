import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from stagehand_gemini_sdk import ComputerUseRunner, StagehandBrowser
from stagehand_gemini_sdk.actions import execute


async def main():
    browser = await StagehandBrowser.launch(headless=True, allowed_domains=["example.com"])
    try:
        page = browser.page
        await page.goto(
            'data:text/html,<input style="position:absolute;left:0;top:0;width:200px;height:100px">'
        )
        await execute(
            page, SimpleNamespace(name="type", arguments={"x": 50, "y": 50, "text": "hello"})
        )
        assert await page.evaluate('document.querySelector("input").value') == "hello"
        await execute(page, SimpleNamespace(name="wait", arguments={"seconds": 0.001}))
        await browser.respond(
            SimpleNamespace(
                type="function_call", id="key", name="press_key", arguments={"key": "Tab"}
            )
        )
        state = await browser.observe()
        assert len(state[1]["data"]) > 100
        await page.goto("https://example.org")
        assert "ERR_BLOCKED_BY_CLIENT" in await page.evaluate("document.body.innerText")
        client = SimpleNamespace(
            interactions=SimpleNamespace(
                create=AsyncMock(
                    side_effect=[
                        SimpleNamespace(
                            id="first",
                            status="requires_action",
                            steps=[
                                SimpleNamespace(
                                    type="function_call",
                                    id="shot",
                                    name="take_screenshot",
                                    arguments={},
                                )
                            ],
                        ),
                        SimpleNamespace(
                            id="last", status="completed", steps=[], output_text="done"
                        ),
                    ]
                )
            )
        )
        result = await ComputerUseRunner(browser=browser).run(client, model="test", input="Observe")
        assert result.output_text == "done"
        await browser.close()
        try:
            await browser.observe()
        except RuntimeError:
            pass
        else:
            raise AssertionError("Closed browser was usable")
        print("Browser smoke passed: typing, keyboard, PNG screenshot, domain policy")
    finally:
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
