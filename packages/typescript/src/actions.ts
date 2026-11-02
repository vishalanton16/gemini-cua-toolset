import type { Page } from "@browserbasehq/stagehand";
import { DEFAULT_VIEWPORT, type FunctionCall, type Viewport } from "./types.js";

export function number(value: unknown, name: string, max = Infinity): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > max
  )
    throw new Error(`${name} must be a finite number between 0 and ${max}`);
  return value;
}

export function coordinate(value: unknown, size: number): number {
  return Math.min(
    size - 1,
    Math.floor((number(value, "coordinate", 1000) / 1000) * size),
  );
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected a string");
  return value;
}

const KEY_NAMES: Record<string, string> = {
  ctrl: "Control",
  cmd: "Meta",
  esc: "Escape",
  enter: "Enter",
  space: "Space",
};

function keyName(value: unknown): string {
  const key = text(value);
  if (!key.trim()) throw new Error("Empty key");
  return KEY_NAMES[key.toLowerCase()] ?? key;
}

export async function execute(
  page: Page,
  call: FunctionCall,
  viewport: Viewport = DEFAULT_VIEWPORT,
): Promise<void> {
  const a = call.arguments;
  const point = () =>
    [
      coordinate(a.x, viewport.width),
      coordinate(a.y, viewport.height),
    ] as const;
  switch (call.name) {
    case "open_app":
    case "open_web_browser":
    case "take_screenshot":
    case "screenshot":
      return;
    case "click":
    case "double_click":
    case "triple_click":
    case "right_click":
    case "middle_click": {
      const [x, y] = point();
      await page.click(x, y, {
        button:
          call.name === "right_click"
            ? "right"
            : call.name === "middle_click"
              ? "middle"
              : "left",
        clickCount:
          call.name === "double_click"
            ? 2
            : call.name === "triple_click"
              ? 3
              : 1,
      });
      return;
    }
    case "move":
      await page.hover(...point());
      return;
    case "type": {
      const value = text(a.text);
      if (a.x !== undefined || a.y !== undefined) await page.click(...point());
      if (a.clear_before_typing !== false) {
        await page.keyPress("ControlOrMeta+a");
        await page.keyPress("Backspace");
      }
      await page.type(value);
      if (a.press_enter === true) await page.keyPress("Enter");
      return;
    }
    case "press_key":
      await page.keyPress(keyName(a.key));
      return;
    case "hotkey": {
      if (!Array.isArray(a.keys) || !a.keys.length)
        throw new Error("hotkey requires keys");
      const keys = a.keys.map(keyName);
      await page.keyPress(keys.join("+"));
      return;
    }
    case "scroll": {
      const amount = number(
        a.magnitude_in_pixels ?? a.magnitude ?? 300,
        "scroll amount",
        10000,
      );
      const direction = text(a.direction ?? "down");
      if (!["up", "down", "left", "right"].includes(direction))
        throw new Error("Invalid scroll direction");
      const [x, y] =
        a.x === undefined && a.y === undefined
          ? [viewport.width / 2, viewport.height / 2]
          : point();
      await page.scroll(
        x,
        y,
        direction === "left" ? -amount : direction === "right" ? amount : 0,
        direction === "up" ? -amount : direction === "down" ? amount : 0,
      );
      return;
    }
    case "drag_and_drop": {
      const x = coordinate(a.start_x ?? a.x, viewport.width);
      const y = coordinate(a.start_y ?? a.y, viewport.height);
      const toX = coordinate(a.end_x ?? a.destination_x, viewport.width);
      const toY = coordinate(a.end_y ?? a.destination_y, viewport.height);
      await page.dragAndDrop(x, y, toX, toY, { steps: 10 });
      return;
    }
    case "navigate": {
      const url = new URL(text(a.url));
      if (!["http:", "https:"].includes(url.protocol))
        throw new Error("Only HTTP(S) navigation is supported");
      await page.goto(url.href);
      return;
    }
    case "go_back":
      await page.goBack();
      return;
    case "go_forward":
      await page.goForward();
      return;
    case "wait":
      await page.waitForTimeout(
        Math.round(number(a.seconds ?? 1, "wait seconds", 30) * 1000),
      );
      return;
    default:
      throw new Error(`Unsupported computer-use action: ${call.name}`);
  }
}
