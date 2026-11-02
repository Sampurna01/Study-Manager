import type { z } from "zod/v4";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface StructuredRequest<S extends z.ZodType> {
  content: string;
  task: string;
  schema: S;
  effort: Effort;
  maxTokens?: number;
}

export interface TutorMessage {
  role: "user" | "assistant";
  content: string;
}
