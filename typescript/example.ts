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
