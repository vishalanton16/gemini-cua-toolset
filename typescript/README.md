# Gemini toolset for TypeScript

Run a Gemini browser task with the Google Gen AI SDK and `stagehand-gemini-sdk`. The example opens `example.com` in a visible Chrome window and asks for its heading.

## Prerequisites

- Node.js 22.18 or later and pnpm.
- Google Chrome for local execution, or a Browserbase API key for a hosted browser.
- A [Gemini API key](https://aistudio.google.com/apikey) with access to `gemini-3.8-flash`, or another Computer Use model set with `GEMINI_MODEL`.

## Install and run

The SDK hasn't been published yet. From the repository root, install and build the workspace package:

```bash
pnpm install --frozen-lockfile
pnpm build
cd typescript
cp .env.example .env
# Set GEMINI_API_KEY in .env.
pnpm example
```

The expected answer includes "Example Domain".

## How the example works

[example.ts](example.ts) launches `StagehandBrowser`, passes it to `ComputerUseRunner`, and closes the browser in `finally`:

```typescript
import { GoogleGenAI } from "@google/genai";
import { ComputerUseRunner, StagehandBrowser } from "stagehand-gemini-sdk";

const browser = await StagehandBrowser.launch({
  headless: false,
  allowedDomains: ["example.com", "iana.org"],
});
try {
  const runner = new ComputerUseRunner({ browser });
  const response = await runner.run(
    new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }),
    {
      model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
      input: "Open example.com and tell me the page heading.",
    },
    { maxTurns: 20 },
  );
  console.log(response.output_text);
} finally {
  await browser.close();
}
```

The runner executes Gemini's Computer Use calls through Stagehand and sends back a screenshot and URL after each action. It returns the final SDK interaction.

Edit `input` to change the task. Set `headless: true` to hide Chrome. Change `allowedDomains` to include the sites your task needs.

## Use Browserbase

Set `BROWSERBASE_API_KEY` in `.env`. Replace the launch call in `example.ts` with:

```typescript
const apiKey = process.env.BROWSERBASE_API_KEY;
if (!apiKey)
  throw new Error("Set BROWSERBASE_API_KEY before running this example.");

const browser = await StagehandBrowser.browserbase({
  apiKey,
  allowedDomains: ["example.com", "iana.org"],
});
```

Keep the runner and `finally` block, then run `pnpm example`. `browser.close()` releases the hosted session.

## Handle confirmations

Pass a `confirm` callback when constructing the runner. It receives the full function call, including Gemini's explanation in `call.arguments.safety_decision`.

```typescript
const runner = new ComputerUseRunner({
  browser,
  confirm: async (call) => askUser(call),
});
```

Implement `askUser` with your UI. Return `true` only after approval. Without a callback, confirmation-required actions throw `SafetyDecisionError` before execution. Approved results include `safety_acknowledgement: true`.

## Use in your own project

After the first npm release:

```bash
pnpm add @google/genai@2.32.0 stagehand-gemini-sdk@0.1.0
```

Use the same imports and runner above in an ESM TypeScript project. The Google SDK is a peer dependency. The [SDK source and API guide](../packages/typescript/README.md) describe the exported types and errors.

## Troubleshooting

| Symptom                   | What to check                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Package import fails      | Run `pnpm install` and `pnpm build` from the repository root.                                                    |
| Missing API key           | Copy `.env.example` to `.env` and set `GEMINI_API_KEY`.                                                          |
| HTTP 400 safety rejection | Google rejected the request. This is separate from a tool confirmation and cannot be approved through `confirm`. |
| Model access error        | Set `GEMINI_MODEL` to a Computer Use model available to your account.                                            |
| Chrome doesn't launch     | Install Google Chrome or pass `chromePath` to `launch`.                                                          |
| Navigation is blocked     | Check the domain lists. Chrome may show a blocked page instead of throwing.                                      |
| `SafetyDecisionError`     | Connect a confirmation callback or stop the task if the decision is blocked.                                     |
| `MaxTurnsError`           | Increase `maxTurns` for a longer task.                                                                           |

See the [shared limitations](../README.md#limitations).
