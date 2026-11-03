/**
 * Local AI through Ollama (https://ollama.com): free, private, runs on the
 * student's own computer. Talks to Ollama's HTTP API with fetch.
 */
import { z } from "zod/v4";
import { AIError } from "./errors";
import { BASE_INSTRUCTIONS, TUTOR_INSTRUCTIONS, courseBlock } from "./prompts";
import type { StructuredRequest, TutorMessage } from "./ai-types";

export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "gemma3:4b";
const OLLAMA_URL = (process.env.OLLAMA_HOST || "http://localhost:11434").replace(/\/$/, "");
// The context window the model is allowed to use. Bigger windows need more memory;
// 32K tokens fits comfortably on a 16 GB Mac with a 4B model. Raise it if you have
// more memory, lower it if generation is very slow.
export const MAX_CONTEXT = Number(process.env.OLLAMA_MAX_CONTEXT) || 32_768;

const MIN_CONTEXT = 8_192;
// Conservative: ~3.2 characters per token, so we over-estimate and never cut text off.
const estimateTokens = (text: string) => Math.ceil(text.length / 3.2);

/** Characters of course material that fit alongside instructions and the answer. */
export function maxContentChars(): number {
  return Math.floor((MAX_CONTEXT - 8_192 - 1_500) * 3.2);
}

function contextFor(promptText: string, outputTokens: number): number {
  const needed = estimateTokens(promptText) + outputTokens + 512;
  if (needed > MAX_CONTEXT) {
    throw new AIError(
      `This course material is too long for the local model (it needs about ${needed.toLocaleString()} tokens; the limit is ${MAX_CONTEXT.toLocaleString()}). ` +
        `Split it into smaller courses, e.g. one per unit or chapter. If your Mac has lots of memory you can raise OLLAMA_MAX_CONTEXT.`,
      413,
    );
  }
  // Round up to a multiple of 4096 so similar requests reuse the loaded model.
  return Math.max(MIN_CONTEXT, Math.ceil(needed / 4096) * 4096);
}

type OllamaMessage = { role: "system" | "user" | "assistant"; content: string };

async function chat(
  messages: OllamaMessage[],
  options: { numCtx: number; numPredict: number; temperature: number; format?: unknown },
  onText: (t: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        stream: true, // streamed so long generations don't hit HTTP timeouts
        format: options.format,
        keep_alive: "15m",
        options: { num_ctx: options.numCtx, num_predict: options.numPredict, temperature: options.temperature },
      }),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new AIError(
      `Can't reach Ollama at ${OLLAMA_URL}. Make sure the Ollama app is installed and running (you should see its llama icon in the menu bar), then try again.`,
      503,
    );
  }

  if (!res.ok || !res.body) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    const detail = body?.error ?? `HTTP ${res.status}`;
    if (res.status === 404 || /not found/i.test(detail)) {
      throw new AIError(
        `The AI model "${OLLAMA_MODEL}" isn't downloaded yet. In a terminal, run:  ollama pull ${OLLAMA_MODEL}  — then try again.`,
        503,
      );
    }
    throw new AIError(`Ollama error: ${detail}`, 502);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let doneReason: string | undefined;
  const handleLine = (line: string) => {
    if (!line.trim()) return;
    const chunk = JSON.parse(line) as { message?: { content?: string }; error?: string; done?: boolean; done_reason?: string };
    if (chunk.error) throw new AIError(`Ollama error: ${chunk.error}`, 502);
    if (chunk.message?.content) onText(chunk.message.content);
    if (chunk.done) doneReason = chunk.done_reason;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(handleLine);
  }
  handleLine(buffer);
  if (doneReason === "length") {
    throw new AIError("The local model's answer was too long and got cut off. Try asking for fewer items.", 502);
  }
}

/**
 * Ollama turns the JSON schema into a grammar. Drop parts that add nothing but make
 * that grammar huge or unsupported: the $schema tag and zod's ±2^53 integer bounds.
 */
export function simplifySchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(simplifySchema);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "$schema") continue;
    if ((k === "minimum" || k === "maximum") && typeof v === "number" && Math.abs(v) >= Number.MAX_SAFE_INTEGER) continue;
    out[k] = simplifySchema(v);
  }
  return out;
}

const OUTPUT_TOKENS: Record<StructuredRequest<z.ZodType>["effort"], number> = {
  low: 2_048,
  medium: 6_144,
  high: 8_192,
  xhigh: 8_192,
  max: 8_192,
};

export async function ollamaGenerate<S extends z.ZodType>({ content, task, schema, effort }: StructuredRequest<S>): Promise<z.infer<S>> {
  const system = `${BASE_INSTRUCTIONS}\n\n${courseBlock(content)}`;
  const user = `${task}\n\nReply with JSON only, matching the required schema. Every field must be filled in.`;
  const numPredict = OUTPUT_TOKENS[effort];
  const numCtx = contextFor(system + user, numPredict);
  const format = simplifySchema(z.toJSONSchema(schema));

  // Small local models occasionally produce JSON that doesn't fit; one retry usually fixes it.
  for (let attempt = 1; ; attempt++) {
    let text = "";
    await chat(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { numCtx, numPredict, temperature: attempt === 1 ? 0.3 : 0.6, format },
      (t) => (text += t),
    );
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    const parsed = json === undefined ? null : schema.safeParse(json);
    if (parsed?.success) return parsed.data;
    if (attempt >= 2) throw new AIError("The local model's answer wasn't in the expected format. Please try again.", 502);
  }
}

export async function ollamaTutor(
  content: string,
  messages: TutorMessage[],
  onText: (text: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const system = `${BASE_INSTRUCTIONS}\n\n${courseBlock(content)}\n\n${TUTOR_INSTRUCTIONS}`;
  const numPredict = 2_048;
  const numCtx = contextFor(system + messages.map((m) => m.content).join("\n"), numPredict);
  await chat([{ role: "system", content: system }, ...messages], { numCtx, numPredict, temperature: 0.6 }, onText, signal);
}
