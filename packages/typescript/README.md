# stagehand-gemini-sdk

Stagehand browser driver and Computer Use runner for the Gemini Interactions API. This directory is the source of the npm package. See the [TypeScript quickstart](../../typescript/README.md) for a complete example.

## API

- `StagehandBrowser.launch(options?)` creates and owns a local Chromium browser, attaches Stagehand, applies the domain policy, and opens a page.
- `StagehandBrowser.browserbase(options)` creates and owns a Browserbase session. `apiKey` is required.
- `browser.page` exposes the underlying Stagehand page. `browser.viewport` reports the dimensions used to scale Gemini coordinates.
- `browser.observe()` returns the current URL and PNG screenshot. `browser.respond(call, confirm?)` executes one Gemini function call and returns its result with a new observation.
- `browser.close()` releases the browser. Repeated calls follow Stagehand's idempotent cleanup behavior.
- `new ComputerUseRunner({ browser, confirm? })` accepts a browser or any implementation of the exported `BrowserToolset` contract.
- `runner.run(client, { model, input, systemInstruction? }, { maxTurns? })` returns the final Google SDK interaction. The default limit is 20 model requests, including the first request.

`allowedDomains` and `blockedDomains` configure browser requests. `viewport` defaults to `{ width: 1440, height: 900 }`. Local launch accepts Stagehand's launch options, using `chromePath` for its executable path. Hosted launch accepts Stagehand's Browserbase session options.

## Errors and execution

`SafetyDecisionError` stops execution for denied, missing, malformed, or blocked safety confirmations. The callback must explicitly return `true` for `require_confirmation`; a truthy value isn't sufficient. Approved calls return boolean `safety_acknowledgement` inside the result's text metadata.

`InteractionError` reports unsuccessful interaction statuses or malformed call batches. `MaxTurnsError` reports an exhausted request budget. Both are exported. Browser setup failures close the newly created browser before propagating the error.

The runner sends the tool declaration on every request and links results through `previous_interaction_id`. It executes calls sequentially, preserving each call's ID and its own screenshot. The returned interaction contains usage for the final API request; the SDK doesn't aggregate usage across turns.

Action failures become `is_error` function results with a screenshot. Observation failures propagate and stop the runner. The caller owns browser cleanup in every case.

Supported browser actions are `click`, `double_click`, `triple_click`, `right_click`, `middle_click`, `move`, `type`, `press_key`, `hotkey`, `scroll`, `drag_and_drop`, `navigate`, `go_back`, `go_forward`, `wait`, and `take_screenshot`. Held-key and mouse-button actions are excluded because public Stagehand v4 does not expose those primitives. Unknown actions return errors. Typing clears by default; `clear_before_typing: false` appends. Waits are limited to 30 seconds and scrolls to 10,000 pixels per action.

## Source layout

| Module                              | Responsibility                                               |
| ----------------------------------- | ------------------------------------------------------------ |
| `browser.ts`                        | Browser ownership, initialization, policy, viewport, cleanup |
| `runner.ts`                         | Interactions request loop and model turn budget              |
| `actions.ts`                        | Computer Use action execution and coordinate scaling         |
| `safety.ts`                         | Safety decisions and confirmation callback                   |
| `observation.ts`                    | Screenshot and URL capture                                   |
| `response.ts`                       | Function result construction                                 |
| `types.ts`, `errors.ts`, `index.ts` | Types, errors, public exports                                |

The npm tarball includes the original TypeScript source, compiled JavaScript, declarations, source maps, and license. It depends on public Stagehand v4 and doesn't vendor a modified Stagehand build.

## Development

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm test:browser
```

Browser tests need local Google Chrome. Tests use fake Gemini responses and don't require API credentials. See [publishing](../../PUBLISHING.md) for package layout and release notes.

[MIT](LICENSE)
