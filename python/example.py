import asyncio
import os

from google import genai
from stagehand_gemini_sdk import ComputerUseRunner, StagehandBrowser


async def main() -> None:
    async with genai.Client().aio as client:
        browser = await StagehandBrowser.launch(
            headless=False,
            allowed_domains=["example.com", "iana.org"],
        )
        async with browser:
            runner = ComputerUseRunner(browser=browser)
            response = await runner.run(
                client,
                model=os.environ.get("GEMINI_MODEL", "gemini-3.8-flash"),
                input="Open example.com and tell me the page heading.",
                max_turns=20,
            )
            print(response.output_text)


if __name__ == "__main__":
    asyncio.run(main())
