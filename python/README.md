# Gemini toolset for Python

Run a Gemini browser task with the Google Gen AI SDK and `stagehand-gemini-sdk`. The example opens `example.com` in a visible Chrome window and asks for its heading.

## Prerequisites

- Python 3.11 or later and uv.
- Google Chrome for local execution, or a Browserbase API key for a hosted browser.
- A [Gemini API key](https://aistudio.google.com/apikey) with access to `gemini-3.8-flash`, or another Computer Use model set with `GEMINI_MODEL`.

## Install and run

From this repository's `python` directory:

```bash
uv sync --locked
cp .env.example .env
# Set GEMINI_API_KEY in .env.
uv run --env-file .env python example.py
```

The SDK hasn't been published yet. This checkout resolves it from `../packages/python` through `tool.uv.sources`. The expected answer includes "Example Domain".

## How the example works

[example.py](example.py) launches `StagehandBrowser`, passes it to `ComputerUseRunner`, and closes the browser through its async context manager:

```python
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
```

The runner executes Gemini's Computer Use calls through Stagehand and sends back a screenshot and URL after each action. It returns the final SDK interaction.

Edit `input` to change the task. Set `headless=True` to hide Chrome. Change `allowed_domains` to include the sites your task needs.

## Use Browserbase

Set `BROWSERBASE_API_KEY` in `.env`. Replace the launch call in `example.py` with:

```python
browser = await StagehandBrowser.browserbase(
    api_key=os.environ["BROWSERBASE_API_KEY"],
    allowed_domains=["example.com", "iana.org"],
)
```

Keep the runner and async context manager, then run the example again. `browser.close()` releases the hosted session.

## Handle confirmations

Pass an async `confirm` callback when constructing the runner. It receives the full function call, including Gemini's explanation in `call.arguments["safety_decision"]`.

```python
runner = ComputerUseRunner(browser=browser, confirm=ask_user)
```

Implement async `ask_user` with your UI. Return `True` only after approval. Without a callback, confirmation-required actions raise `SafetyDecisionError` before execution. Approved results include `safety_acknowledgement: True`.

## Use in your own project

After the first PyPI release:

```bash
uv add 'google-genai>=2.34.0,<3' stagehand-gemini-sdk==0.1.0
```

Use the same imports and runner above. The [SDK source and API guide](../packages/python/README.md) describe the public classes and errors.

## Troubleshooting

| Symptom                   | What to check                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Package import fails      | Run `uv sync` from this directory.                                                                               |
| Missing API key           | Copy `.env.example` to `.env` and use `uv run --env-file .env`.                                                  |
| HTTP 400 safety rejection | Google rejected the request. This is separate from a tool confirmation and cannot be approved through `confirm`. |
| Model access error        | Set `GEMINI_MODEL` to a Computer Use model available to your account.                                            |
| Chrome doesn't launch     | Install Google Chrome or pass `chrome_path` to `launch`.                                                         |
| Navigation is blocked     | Check the domain lists. Chrome may show a blocked page instead of raising.                                       |
| `SafetyDecisionError`     | Connect a confirmation callback or stop the task if the decision is blocked.                                     |
| `MaxTurnsError`           | Increase `max_turns` for a longer task.                                                                          |

See the [shared limitations](../README.md#limitations).
