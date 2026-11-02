# stagehand-gemini-sdk

Async Stagehand browser driver and Computer Use runner for the Gemini Interactions API. This directory is the source of the PyPI package. See the [Python quickstart](../../python/README.md) for a complete example.

## API

- `await StagehandBrowser.launch(...)` creates and owns a local Chromium browser. Options include `headless`, `chrome_path`, `allowed_domains`, `blocked_domains`, and `viewport`.
- `await StagehandBrowser.browserbase(api_key=..., ...)` creates and owns a Browserbase session. Domain lists and viewport are supported.
- `browser.page` exposes the underlying Stagehand page. `browser.viewport` reports the dimensions used to scale Gemini coordinates.
- `await browser.observe()` returns the current URL and PNG screenshot. `await browser.respond(call, confirm=None)` executes one Gemini function call and returns its result with a new observation.
- `await browser.close()` releases the browser. `async with browser` closes it on exit.
- `ComputerUseRunner(browser=browser, confirm=None)` accepts a browser or any implementation of the exported `BrowserToolset` protocol.
- `await runner.run(client, model=..., input=..., max_turns=20, system_instruction=None)` returns the final Google SDK `Interaction`. Pass the async client, `genai.Client().aio`.

`Viewport(width=1440, height=900)` is an immutable, validated configuration. Each browser uses its own viewport to scale coordinates. Domain policies apply to browser requests.

## Errors and execution

`SafetyDecisionError` stops execution for denied, missing, malformed, or blocked safety confirmations. The async callback must explicitly return `True` for `require_confirmation`; a truthy value isn't sufficient. Approved calls return boolean `safety_acknowledgement` inside the result's text metadata.

`InteractionError` reports unsuccessful interaction statuses or malformed call batches. `MaxTurnsError` reports an exhausted request budget. Both are exported. Browser setup failures close the newly created browser before propagating the error.

The runner sends the tool declaration on every request and links results through `previous_interaction_id`. It executes calls sequentially, preserving each call's ID and its own screenshot. The returned interaction contains usage for the final API request; the SDK doesn't aggregate usage across turns.

Action failures become `is_error` function results with a screenshot. Observation failures propagate and stop the runner. The caller owns browser cleanup in every case.

Supported browser actions are `click`, `double_click`, `triple_click`, `right_click`, `middle_click`, `move`, `type`, `press_key`, `hotkey`, `scroll`, `drag_and_drop`, `navigate`, `go_back`, `go_forward`, `wait`, and `take_screenshot`. Held-key and mouse-button actions are excluded because public Stagehand v4 does not expose those primitives. Unknown actions return errors. Typing clears by default; `clear_before_typing=False` appends. Waits are limited to 30 seconds and scrolls to 10,000 pixels per action.

## Source layout

`browser.py` owns browser lifecycle. `runner.py` handles the model loop. `actions.py`, `safety.py`, `observation.py`, and `response.py` handle execution, confirmation, capture, and protocol results. `types.py`, `errors.py`, and `__init__.py` define the public API.

The wheel includes Python source, a `py.typed` marker, and the MIT license. It depends on public Stagehand v4 and doesn't vendor a modified Stagehand build.

## Development

From the repository root:

```bash
uv sync --locked --project packages/python
uv run --project packages/python ruff check packages/python python
uv run --project packages/python pyright --project packages/python
uv run --project packages/python python -m unittest discover -s packages/python/tests -v
uv run --project packages/python python packages/python/tests/browser_smoke.py
```

Browser tests need local Google Chrome. Tests use fake Gemini responses and don't require API credentials. See [publishing](../../PUBLISHING.md) for package layout and release notes.

[MIT](LICENSE)
