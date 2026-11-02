import assert from "node:assert/strict";
import { test } from "node:test";
import type { Page } from "@browserbasehq/stagehand";
import type { GoogleGenAI } from "@google/genai";
import { coordinate, execute } from "../src/actions.js";
import { respond } from "../src/response.js";
import { observe } from "../src/observation.js";
import { ComputerUseRunner, type FunctionCall } from "../src/index.js";

function run(
  client: GoogleGenAI,
  page: Page,
  options: { prompt: string; model: string; maxTurns?: number },
) {
  const runner = new ComputerUseRunner({
    browser: {
      observe: () => observe(page),
      respond: (call, confirm) => respond(page, call, confirm),
    },
  });
  return runner.run(
    client,
    { model: options.model, input: options.prompt },
    { maxTurns: options.maxTurns },
  );
}

const call = (
  name: string,
  args: Record<string, unknown> = {},
): FunctionCall => ({
  type: "function_call",
  id: "call-1",
  name,
  arguments: args,
});
function fakePage() {
  const actions: unknown[][] = [];
  const page = new Proxy({} as Page, {
    get:
      (_, name) =>
      async (...args: unknown[]) => {
        if (name === "url") return "https://example.com";
        if (name === "screenshot") return Buffer.from("png");
        actions.push([name, ...args]);
      },
  });
  return { page, actions };
}

test("scales normalized coordinates and rejects invalid values", () => {
  assert.equal(coordinate(500, 1440), 720);
  assert.equal(coordinate(1000, 900), 899);
  for (const value of [-1, NaN, Infinity, "500", undefined, 1001])
    assert.throws(() => coordinate(value, 900));
});

test("executes typing, key chords, scrolling and full drags", async () => {
  const { page, actions } = fakePage();
  await execute(
    page,
    call("type", { x: 500, y: 500, text: "hello", press_enter: true }),
  );
  await execute(page, call("hotkey", { keys: ["ctrl", "a"] }));
  await execute(
    page,
    call("scroll", { direction: "left", magnitude_in_pixels: 125 }),
  );
  await execute(
    page,
    call("drag_and_drop", {
      x: 0,
      y: 0,
      destination_x: 1000,
      destination_y: 1000,
    }),
  );
  assert.deepEqual(actions, [
    ["click", 720, 450],
    ["keyPress", "ControlOrMeta+a"],
    ["keyPress", "Backspace"],
    ["type", "hello"],
    ["keyPress", "Enter"],
    ["keyPress", "Control+a"],
    ["scroll", 720, 450, -125, 0],
    ["dragAndDrop", 0, 0, 1439, 899, { steps: 10 }],
  ]);
});

test("confirmation never executes blocked or declined actions", async () => {
  const { page, actions } = fakePage();
  for (const decision of ["blocked", "require_confirmation", "unknown"]) {
    await assert.rejects(
      respond(
        page,
        call("click", { x: 1, y: 1, safety_decision: { decision } }),
      ),
    );
  }
  assert.equal(actions.length, 0);
  const result = await respond(
    page,
    call("click", {
      x: 1,
      y: 1,
      safety_decision: { decision: "require_confirmation" },
    }),
    async () => true,
  );
  assert.match(JSON.stringify(result), /safety_acknowledgement/);
  assert.equal(actions.length, 1);
});

test("unsupported actions return an error with a fresh screenshot", async () => {
  const { page } = fakePage();
  const result = await respond(page, call("unsupported"));
  assert.equal(result.is_error, true);
  assert.equal(result.call_id, "call-1");
  assert.match(JSON.stringify(result), /image\/png/);
});

test("chains interactions and returns the final response", async () => {
  const { page } = fakePage();
  const requests: any[] = [];
  const client = {
    interactions: {
      create: async (request: any) => {
        requests.push(request);
        return requests.length === 1
          ? {
              id: "first",
              status: "requires_action",
              steps: [call("click", { x: 500, y: 500 })],
            }
          : {
              id: "second",
              status: "completed",
              steps: [],
              output_text: "Example Domain",
            };
      },
    },
  } as unknown as GoogleGenAI;
  assert.equal(
    (await run(client, page, { prompt: "Read", model: "test" })).output_text,
    "Example Domain",
  );
  assert.equal(requests[1].previous_interaction_id, "first");
  assert.equal(requests[0].input[2].type, "image");
  assert.deepEqual(requests[0].tools[0].excluded_predefined_functions, [
    "mouse_down",
    "mouse_up",
    "key_down",
    "key_up",
  ]);
  assert.equal(requests[1].input[0].call_id, "call-1");
});

test("failed status and turn budget stop before executing", async () => {
  const { page, actions } = fakePage();
  for (const status of ["failed", "requires_action"]) {
    const client = {
      interactions: {
        create: async () => ({
          id: "first",
          status,
          steps: [call("click", { x: 0, y: 0 })],
        }),
      },
    } as unknown as GoogleGenAI;
    await assert.rejects(
      run(client, page, { prompt: "Read", model: "test", maxTurns: 1 }),
    );
  }
  assert.equal(actions.length, 0);
});

test("custom viewport scales actions independently of the default", async () => {
  const { page, actions } = fakePage();
  await execute(page, call("click", { x: 500, y: 500 }), {
    width: 800,
    height: 600,
  });
  assert.deepEqual(actions[0], [
    "click",
    400,
    300,
    { button: "left", clickCount: 1 },
  ]);
});

test("truthy confirmation and failed observations stop execution", async () => {
  const { page, actions } = fakePage();
  await assert.rejects(
    respond(
      page,
      call("click", {
        x: 0,
        y: 0,
        safety_decision: { decision: "require_confirmation" },
      }),
      async () => "yes" as unknown as boolean,
    ),
  );
  assert.equal(actions.length, 0);
  const broken = {
    url: async () => "https://example.com",
    screenshot: async () => {
      throw new Error("lost screenshot");
    },
  } as unknown as Page;
  await assert.rejects(respond(broken, call("screenshot")), /lost screenshot/);
});

test("duplicate call IDs fail before any action executes", async () => {
  const { page, actions } = fakePage();
  const client = {
    interactions: {
      create: async () => ({
        id: "first",
        status: "requires_action",
        steps: [call("click", { x: 0, y: 0 }), call("click", { x: 1, y: 1 })],
      }),
    },
  } as unknown as GoogleGenAI;
  await assert.rejects(
    run(client, page, { prompt: "Read", model: "test" }),
    /duplicate/,
  );
  assert.equal(actions.length, 0);
});

test("documented key and screenshot actions execute through the browser", async () => {
  const { page, actions } = fakePage();
  await execute(page, call("press_key", { key: "esc" }));
  const result = await respond(page, call("take_screenshot"));
  assert.deepEqual(actions, [["keyPress", "Escape"]]);
  assert.equal(result.is_error, undefined);
  assert.match(JSON.stringify(result.result), /image\/png/);
  await assert.rejects(
    execute(page, call("press_key", { key: "" })),
    /Empty key/,
  );
  assert.equal(actions.length, 1);
});
