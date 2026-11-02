import base64
import json

from stagehand import Page


async def observe(page: Page, metadata: dict[str, object] | None = None) -> list[dict[str, str]]:
    screenshot = await page.screenshot(type="png", full_page=False)
    return [
        {"type": "text", "text": json.dumps({"url": await page.url(), **(metadata or {})})},
        {"type": "image", "data": base64.b64encode(screenshot).decode(), "mime_type": "image/png"},
    ]
