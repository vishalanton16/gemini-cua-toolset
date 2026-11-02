import type { GoogleGenAI } from "@google/genai";
import type { StagehandBrowser } from "./browser.js";
import { InteractionError, MaxTurnsError } from "./errors.js";
import type {
  Confirm,
  FunctionCall,
  FunctionResult,
  Interaction,
} from "./types.js";

export type BrowserToolset = Pick<StagehandBrowser, "observe" | "respond">;
export type RunnerOptions = { browser: BrowserToolset; confirm?: Confirm };
export type RunRequest = {
  model: string;
  input: string;
  systemInstruction?: string;
};
export type RunOptions = { maxTurns?: number };

export class ComputerUseRunner {
  constructor(private readonly options: RunnerOptions) {}

  async run(
    client: GoogleGenAI,
    request: RunRequest,
    options: RunOptions = {},
  ): Promise<Interaction> {
    const maxTurns = options.maxTurns ?? 20;
    if (!Number.isSafeInteger(maxTurns) || maxTurns < 1)
      throw new TypeError("maxTurns must be a positive integer");
    if (!request.model.trim() || !request.input.trim())
      throw new TypeError("Model and input must be non-empty strings");
    const config = {
      model: request.model,
      ...(request.systemInstruction !== undefined && {
        system_instruction: request.systemInstruction,
      }),
      tools: [
        {
          type: "computer_use" as const,
          environment: "browser" as const,
          enable_prompt_injection_detection: true,
          excluded_predefined_functions: [
            "mouse_down",
            "mouse_up",
            "key_down",
            "key_up",
          ],
        },
      ],
    };
    let interaction = await client.interactions.create({
      ...config,
      input: [
        { type: "text", text: request.input },
        ...(await this.options.browser.observe()),
      ],
    });
    for (let turn = 1; ; turn++) {
      if (!["completed", "requires_action"].includes(interaction.status))
        throw new InteractionError(
          `Interaction ended with status ${interaction.status}`,
        );
      const calls = (interaction.steps ?? []).filter(
        (step): step is FunctionCall => step.type === "function_call",
      );
      if (!calls.length) {
        if (interaction.status !== "completed")
          throw new InteractionError(
            "Interaction requires action but returned no calls",
          );
        return interaction;
      }
      if (turn >= maxTurns)
        throw new MaxTurnsError(`Reached ${maxTurns} model turns`);
      // Validate the whole batch before executing its first action.
      const ids = new Set<string>();
      for (const call of calls) {
        if (
          typeof call.id !== "string" ||
          !call.id.trim() ||
          ids.has(call.id) ||
          typeof call.name !== "string" ||
          !call.name.trim() ||
          !call.arguments ||
          typeof call.arguments !== "object" ||
          Array.isArray(call.arguments)
        )
          throw new InteractionError("Malformed or duplicate function call");
        ids.add(call.id);
      }
      const results: FunctionResult[] = [];
      for (const call of calls)
        results.push(
          await this.options.browser.respond(call, this.options.confirm),
        );
      interaction = await client.interactions.create({
        ...config,
        previous_interaction_id: interaction.id,
        input: results,
      });
    }
  }
}
