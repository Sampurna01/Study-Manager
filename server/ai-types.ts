import type { z } from "zod/v4";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface StructuredRequest<S extends z.ZodType> {
  content: string;
  task: string;
  /** Shapes the model's output (structured outputs / Ollama grammar). */
  schema: S;
  /**
   * Checks the parsed answer, if it should be more forgiving than `schema`
   * (e.g. accept any topicId, then repair it). Defaults to `schema`.
   */
  validate?: z.ZodType;
  effort: Effort;
  maxTokens?: number;
}

export interface TutorMessage {
  role: "user" | "assistant";
  content: string;
}
