import type { Page } from "@browserbasehq/stagehand";

export async function observe(
  page: Page,
  metadata: Record<string, unknown> = {},
) {
  const screenshot = await page.screenshot({ type: "png", fullPage: false });
  return [
    {
      type: "text" as const,
      text: JSON.stringify({ url: await page.url(), ...metadata }),
    },
    {
      type: "image" as const,
      data: Buffer.from(screenshot).toString("base64"),
      mime_type: "image/png" as const,
    },
  ];
}
