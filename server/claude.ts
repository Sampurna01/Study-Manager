import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod/v4";
import { AIError } from "./errors";
import { repairJsonLatex, repairStrings } from "../shared/latex";
import { BASE_INSTRUCTIONS, TUTOR_INSTRUCTIONS, courseBlock } from "./prompts";
import type { StructuredRequest, TutorMessage } from "./ai-types";

export const CLAUDE_MODEL = process.env.STUDY_MANAGER_MODEL || "claude-opus-5-5";

// Server-side refusal fallback: if the model declines, the API re-runs the
// request on a recommended fallback model inside the same call.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Credentials resolve from ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / an `ant auth login` profile.
  client ??= new Anthropic();
  return client;
}

/** System prompt with the course material as a cached block shared by every request about that course. */
function courseSystem(content: string): Anthropic.Beta.BetaTextBlockParam[] {
  return [
    { type: "text", text: BASE_INSTRUCTIONS },
    {
      type: "text",
      text: courseBlock(content),
      cache_control: { type: "ephemeral" },
    },
  ];
}

/** Text produced by the model that finally served the turn (after any fallback switch). */
function finalText(message: Anthropic.Beta.BetaMessage): string {
  const content = message.content;
  let start = 0;
  content.forEach((block, i) => {
    if (block.type === "fallback") start = i + 1;
  });
  return content
    .slice(start)
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function checkStop(message: Anthropic.Beta.BetaMessage) {
  if (message.stop_reason === "refusal") {
    throw new AIError(
      "Claude declined to process this request. Try rephrasing, or check that the course material is appropriate.",
      422,
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new AIError("The response was too long and got cut off. Try asking for fewer items.", 502);
  }
}

export function toClaudeError(err: unknown): AIError {
  if (err instanceof AIError) return err;
  if (err instanceof Anthropic.AuthenticationError) {
    return new AIError("The server has no valid Anthropic credentials. Set ANTHROPIC_API_KEY and restart.", 503);
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new AIError("The Anthropic API key doesn't have access to this model.", 503);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AIError("Claude is rate limited right now. Wait a moment and try again.", 429);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new AIError(`Claude rejected the request: ${err.message}`, 400);
  }
  if (err instanceof Anthropic.APIError) {
    return new AIError(`Claude API error (${err.status ?? "network"}): ${err.message}`, 502);
  }
  if (err instanceof Error && err.message.includes("credentials")) {
    return new AIError("The server has no Anthropic credentials. Set ANTHROPIC_API_KEY and restart.", 503);
  }
  return new AIError(err instanceof Error ? err.message : String(err), 500);
}

export async function claudeGenerate<S extends z.ZodType>({
  content,
  task,
  schema,
  validate,
  effort,
  maxTokens = 64000,
}: StructuredRequest<S>): Promise<z.infer<S>> {
  try {
    // Streamed so long outputs don't hit HTTP timeouts; we only need the final message.
    const stream = getClient().beta.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort, format: betaZodOutputFormat(schema) },
      system: courseSystem(content),
      messages: [{ role: "user", content: task }],
    });
    const message = await stream.finalMessage();
    checkStop(message);
    const text = finalText(message);
    let json: unknown;
    try {
      json = repairStrings(JSON.parse(repairJsonLatex(text)));
    } catch {
      throw new AIError("Claude returned malformed JSON. Please try again.");
    }
    const parsed = (validate ?? schema).safeParse(json);
    if (!parsed.success) throw new AIError("Claude's response didn't match the expected format. Please try again.");
    return parsed.data as z.infer<S>;
  } catch (err) {
    throw toClaudeError(err);
  }
}

export async function claudeTutor(
  content: string,
  messages: TutorMessage[],
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const stream = getClient().beta.messages.stream(
      {
        model: CLAUDE_MODEL,
        max_tokens: 16000,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: [...courseSystem(content), { type: "text", text: TUTOR_INSTRUCTIONS }],
        messages,
      },
      { signal },
    );
    let sawFallback = false;
    for await (const event of stream) {
      if (event.type === "content_block_start" && event.content_block.type === "fallback") {
        // The first model declined part-way; the fallback model restarts the answer.
        if (!sawFallback) onText("\n\n---\n\n");
        sawFallback = true;
      }
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        onText(event.delta.text);
      }
    }
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") {
      onText("\n\n_I can't help with that request._");
    }
  } catch (err) {
    throw toClaudeError(err);
  }
}
