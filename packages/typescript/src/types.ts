import type { GoogleGenAI } from "@google/genai";

export type Interaction = Extract<
  Awaited<ReturnType<GoogleGenAI["interactions"]["get"]>>,
  { id: string }
>;
type Step = NonNullable<Interaction["steps"]>[number];
export type FunctionCall = Extract<Step, { type: "function_call" }>;
export type FunctionResult = Extract<Step, { type: "function_result" }>;
export type Confirm = (call: FunctionCall) => Promise<boolean>;
export type Viewport = { width: number; height: number };
export const DEFAULT_VIEWPORT: Readonly<Viewport> = {
  width: 1440,
  height: 900,
};
