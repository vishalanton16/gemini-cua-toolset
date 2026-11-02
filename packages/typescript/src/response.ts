import type { Page } from "@browserbasehq/stagehand";
import { execute } from "./actions.js";
import { observe } from "./observation.js";
import { confirmAction } from "./safety.js";
import {
  DEFAULT_VIEWPORT,
  type Confirm,
  type FunctionCall,
  type FunctionResult,
  type Viewport,
} from "./types.js";

export async function respond(
  page: Page,
  call: FunctionCall,
  confirm?: Confirm,
  viewport: Viewport = DEFAULT_VIEWPORT,
): Promise<FunctionResult> {
  const acknowledged = await confirmAction(call, confirm);
  let error: string | undefined;
  try {
    await execute(page, call, viewport);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  return {
    type: "function_result",
    call_id: call.id,
    name: call.name,
    ...(error !== undefined && { is_error: true }),
    result: await observe(page, {
      ...(error !== undefined && { error }),
      ...(acknowledged && { safety_acknowledgement: true }),
    }),
  };
}
