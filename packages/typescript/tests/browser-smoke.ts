import assert from "node:assert/strict";
import {
  StagehandBrowser,
  DEFAULT_VIEWPORT as VIEWPORT,
  ComputerUseRunner,
  type FunctionCall,
} from "stagehand-gemini-sdk";
import type { GoogleGenAI } from "@google/genai";
import { execute } from "../src/actions.js";
const browser = await StagehandBrowser.launch({
  headless: true,
  viewport: VIEWPORT,
  allowedDomains: ["example.com"],
});
try {
  const page = browser.page;
  await page.goto(
    'data:text/html,<input id="input" style="position:absolute;left:0;top:0;width:200px;height:100px"><div style="height:2000px">Test</div>',
  );
  await execute(page, {
    type: "function_call",
    id: "1",
    name: "type",
    arguments: { x: 50, y: 50, text: "hello" },
  });
  await execute(page, {
    type: "function_call",
    id: "2",
    name: "hotkey",
    arguments: { keys: ["ControlOrMeta", "a"] },
  });
  await execute(page, {
    type: "function_call",
    id: "3",
    name: "type",
    arguments: { text: "replacement" },
  });
  assert.equal(
    await page.evaluate(
      () => (document.querySelector("input") as HTMLInputElement).value,
    ),
    "replacement",
  );
  await browser.respond({
    type: "function_call",
    id: "key",
    name: "press_key",
    arguments: { key: "Tab" },
  });
  const state = await browser.observe();
  assert.ok(state[1].type === "image" && (state[1].data?.length ?? 0) > 100);
  await page.goto("https://example.org");
  assert.match(
    await page.evaluate(() => document.body.innerText),
    /ERR_BLOCKED_BY_CLIENT/,
  );
  const requests: unknown[] = [];
  const client = {
    interactions: {
      create: async (request: unknown) => {
        requests.push(request);
        return requests.length === 1
          ? {
              id: "first",
              status: "requires_action",
              steps: [
                {
                  type: "function_call",
                  id: "click",
                  name: "take_screenshot",
                  arguments: {},
                } satisfies FunctionCall,
              ],
            }
          : { id: "last", status: "completed", steps: [], output_text: "done" };
      },
    },
  } as unknown as GoogleGenAI;
  const response = await new ComputerUseRunner({ browser }).run(client, {
    model: "test",
    input: "Observe",
  });
  assert.equal(response.output_text, "done");
  assert.equal(requests.length, 2);
  await browser.close();
  await assert.rejects(browser.observe(), /closed or disconnected/);
  console.log(
    "Browser smoke passed: typing, keyboard, PNG screenshot, domain policy",
  );
} finally {
  await browser.close();
}
