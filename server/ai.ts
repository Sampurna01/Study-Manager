/**
 * Chooses the AI behind the app. Set AI_PROVIDER in .env:
 *   ollama    (default) free, local AI on your own computer via Ollama
 *   anthropic Claude through Anthropic's paid API (needs ANTHROPIC_API_KEY)
 */
import type { z } from "zod/v4";
import { AIError } from "./errors";
import type { StructuredRequest, TutorMessage } from "./ai-types";
import { OLLAMA_MODEL, maxContentChars as ollamaMaxChars, ollamaGenerate, ollamaTutor } from "./ollama";
import { CLAUDE_MODEL, claudeGenerate, claudeTutor, toClaudeError } from "./claude";

export type Provider = "ollama" | "anthropic";

export const PROVIDER: Provider = process.env.AI_PROVIDER?.toLowerCase() === "anthropic" ? "anthropic" : "ollama";
export const MODEL = PROVIDER === "anthropic" ? CLAUDE_MODEL : OLLAMA_MODEL;

/** The most course material (in characters) one request can carry; longer text is rejected, never cut. */
export function maxContentChars(): number {
  // ~800K tokens for Claude, leaving room for instructions and output.
  return PROVIDER === "anthropic" ? 3_200_000 : ollamaMaxChars();
}

export function generateStructured<S extends z.ZodType>(req: StructuredRequest<S>): Promise<z.infer<S>> {
  return PROVIDER === "anthropic" ? claudeGenerate(req) : ollamaGenerate(req);
}

export function streamTutor(
  content: string,
  messages: TutorMessage[],
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  return PROVIDER === "anthropic" ? claudeTutor(content, messages, onText, signal) : ollamaTutor(content, messages, onText, signal);
}

export function toAIError(err: unknown): AIError {
  if (err instanceof AIError) return err;
  if (PROVIDER === "anthropic") return toClaudeError(err);
  return new AIError(err instanceof Error ? err.message : String(err), 500);
}

export { AIError };
