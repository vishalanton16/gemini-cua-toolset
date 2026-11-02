import assert from "node:assert/strict";
import { test, mock } from "node:test";
import {
  localBrowser,
  browserbase,
  Stagehand,
  type StagehandBrowser as BrowserHandle,
} from "@browserbasehq/stagehand";
import { StagehandBrowser } from "../src/index.js";

function handle() {
  let closed = false;
  const policies: unknown[] = [];
  const sizes: unknown[] = [];
  const result = {
    get closed() {
      return closed;
    },
    close: mock.fn(async () => {
      closed = true;
    }),
    context: {
      setDomainPolicy: mock.fn(async (policy: unknown) => {
        policies.push(policy);
      }),
      newPage: mock.fn(async () => ({
        setViewportSize: async (...size: number[]) => {
          sizes.push(size);
        },
      })),
    },
  };
  return {
    result,
    policies,
    sizes,
    asHandle: result as unknown as BrowserHandle,
  };
}

test("local browser owns policy, viewport and cleanup", async () => {
  const h = handle();
  const launch = mock.method(localBrowser, "launch", async () => h.asHandle);
  const attach = mock.method(
    Stagehand,
    "create",
    async () => ({}) as Stagehand,
  );
  try {
    const browser = await StagehandBrowser.launch({
      allowedDomains: ["example.com"],
      viewport: { width: 800, height: 600 },
      chromePath: "/chrome",
    });
    assert.deepEqual(h.policies, [{ allowedDomains: ["example.com"] }]);
    assert.deepEqual(h.sizes, [[800, 600]]);
    assert.equal(launch.mock.calls[0].arguments[0]?.executablePath, "/chrome");
    await browser.close();
    assert.equal(browser.closed, true);
    await assert.rejects(browser.observe(), /closed/);
  } finally {
    launch.mock.restore();
    attach.mock.restore();
  }
});

test("hosted browser passes session options and closes on initialization failure", async () => {
  const h = handle();
  const launch = mock.method(browserbase, "launch", async () => h.asHandle);
  const attach = mock.method(Stagehand, "create", async () => {
    throw new Error("init failed");
  });
  try {
    await assert.rejects(
      StagehandBrowser.browserbase({
        apiKey: "test",
        allowedDomains: ["example.com"],
      }),
      /init failed/,
    );
    assert.equal(h.result.close.mock.callCount(), 1);
    assert.deepEqual(launch.mock.calls[0].arguments[0], { apiKey: "test" });
  } finally {
    launch.mock.restore();
    attach.mock.restore();
  }
});

test("invalid viewport fails before browser creation", async () => {
  const launch = mock.method(localBrowser, "launch", async () => {
    throw new Error("Should not launch");
  });
  try {
    await assert.rejects(
      StagehandBrowser.launch({ viewport: { width: 0, height: 600 } }),
      /positive integers/,
    );
    assert.equal(launch.mock.callCount(), 0);
  } finally {
    launch.mock.restore();
  }
});
