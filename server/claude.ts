import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod/v4";

export const MODEL = process.env.STUDY_MANAGER_MODEL || "claude-opus-5-5";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

// Server-side refusal fallback: if the model declines, the API re-runs the
// request on a recommended fallback model inside the same call.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  // Credentials resolve from ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / an `ant auth login` profile.
  client ??= new Anthropic();
  return client;
}

export class ClaudeError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

const BASE_INSTRUCTIONS = `You are Study Manager, an expert teacher and exam coach. A student has given you their course material.
Everything you produce must be grounded in that material: use its terminology, notation, and emphasis. When the material is thin on something, you may add widely accepted background knowledge, but never contradict the material and never invent course-specific facts (dates, names, figures) that aren't there.
Write for a motivated student: clear, precise, and concise.`;

/** System prompt with the course material as a cached block shared by every request about that course. */
function courseSystem(content: string): Anthropic.Beta.BetaTextBlockParam[] {
  return [
    { type: "text", text: BASE_INSTRUCTIONS },
    {
      type: "text",
      text: `<course_material>\n${content}\n</course_material>`,
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
    throw new ClaudeError(
      "Claude declined to process this request. Try rephrasing, or check that the course material is appropriate.",
      422,
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new ClaudeError("The response was too long and got cut off. Try asking for fewer items.", 502);
  }
}

export function toClaudeError(err: unknown): ClaudeError {
  if (err instanceof ClaudeError) return err;
  if (err instanceof Anthropic.AuthenticationError) {
    return new ClaudeError("The server has no valid Anthropic credentials. Set ANTHROPIC_API_KEY and restart.", 503);
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new ClaudeError("The Anthropic API key doesn't have access to this model.", 503);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ClaudeError("Claude is rate limited right now. Wait a moment and try again.", 429);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new ClaudeError(`Claude rejected the request: ${err.message}`, 400);
  }
  if (err instanceof Anthropic.APIError) {
    return new ClaudeError(`Claude API error (${err.status ?? "network"}): ${err.message}`, 502);
  }
  if (err instanceof Error && err.message.includes("credentials")) {
    return new ClaudeError("The server has no Anthropic credentials. Set ANTHROPIC_API_KEY and restart.", 503);
  }
  return new ClaudeError(err instanceof Error ? err.message : String(err), 500);
}

export interface StructuredRequest<S extends z.ZodType> {
  content: string;
  task: string;
  schema: S;
  effort: Effort;
  maxTokens?: number;
}

export async function generateStructured<S extends z.ZodType>({
  content,
  task,
  schema,
  effort,
  maxTokens = 64000,
}: StructuredRequest<S>): Promise<z.infer<S>> {
  try {
    // Streamed so long outputs don't hit HTTP timeouts; we only need the final message.
    const stream = getClient().beta.messages.stream({
      model: MODEL,
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
      json = JSON.parse(text);
    } catch {
      throw new ClaudeError("Claude returned malformed JSON. Please try again.");
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ClaudeError("Claude's response didn't match the expected format. Please try again.");
    return parsed.data;
  } catch (err) {
    throw toClaudeError(err);
  }
}

export const TUTOR_INSTRUCTIONS = `You are now the student's personal tutor for this course.
- Answer questions using the course material; say so when something isn't covered, then give the standard explanation.
- Prefer teaching over telling: check understanding, use small examples, and when the student is working a problem, give hints before full solutions unless they ask for the answer.
- If the student asks you to quiz them, ask one question at a time and wait for their answer.
- Keep answers focused. Use Markdown (headings sparingly, lists, **bold** for key terms, \`code\` and fenced blocks when relevant).`;

export async function streamTutor(
  content: string,
  messages: { role: "user" | "assistant"; content: string }[],
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const stream = getClient().beta.messages.stream(
      {
        model: MODEL,
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
