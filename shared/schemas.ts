import { z } from "zod/v4";

/**
 * Schemas shared by the server (as structured-output formats for Claude) and the
 * client (as the shape of data it stores). Keep them free of numeric min/max and
 * other constraints that JSON-schema structured outputs don't enforce.
 */

export const TopicSchema = z.object({
  id: z.string().describe("Short kebab-case identifier, unique within the course"),
  name: z.string(),
  summary: z.string().describe("2-4 sentence explanation of the topic in plain language"),
  keyPoints: z.array(z.string()).describe("The facts, definitions, formulas or ideas a student must know"),
  difficulty: z.enum(["foundational", "intermediate", "advanced"]),
  prerequisites: z.array(z.string()).describe("ids of topics in this guide that should be learned first"),
  estimatedMinutes: z.number().int().describe("Minutes a typical student needs to learn this topic the first time"),
});
export type Topic = z.infer<typeof TopicSchema>;

export const StudyGuideSchema = z.object({
  title: z.string(),
  overview: z.string().describe("One paragraph describing what the course covers"),
  learningObjectives: z.array(z.string()),
  topics: z.array(TopicSchema).describe("Topics in a sensible learning order"),
  glossary: z.array(z.object({ term: z.string(), definition: z.string() })),
});
export type StudyGuide = z.infer<typeof StudyGuideSchema>;

export const FlashcardDraftSchema = z.object({
  topicId: z.string(),
  front: z.string().describe("A question or cue; one idea per card"),
  back: z.string().describe("A concise, complete answer"),
});
export type FlashcardDraft = z.infer<typeof FlashcardDraftSchema>;

export const FlashcardSetSchema = z.object({ cards: z.array(FlashcardDraftSchema) });

export const QuestionSchema = z.object({
  topicId: z.string(),
  type: z.enum(["multiple_choice", "short_answer"]),
  prompt: z.string(),
  options: z.array(z.string()).describe("Exactly 4 options for multiple_choice; empty for short_answer"),
  correctOption: z.number().int().describe("0-based index of the correct option; -1 for short_answer"),
  modelAnswer: z.string().describe("The ideal answer a strong student would give"),
  explanation: z.string().describe("Why the answer is correct, referencing the course material"),
  difficulty: z.enum(["recall", "understanding", "application"]),
});
export type Question = z.infer<typeof QuestionSchema>;

export const QuizSchema = z.object({ questions: z.array(QuestionSchema) });

export const GradeSchema = z.object({
  score: z.number().describe("0 to 1: how fully the answer matches the model answer"),
  verdict: z.enum(["correct", "partially_correct", "incorrect"]),
  feedback: z.string().describe("Specific, encouraging feedback addressed to the student"),
  missingPoints: z.array(z.string()),
});
export type Grade = z.infer<typeof GradeSchema>;

// ---- Request bodies -------------------------------------------------------

export const GuideRequestSchema = z.object({
  title: z.string().default(""),
  content: z.string().min(1, "Course content is empty"),
});

export const TopicRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  mastery: z.number().optional(),
});

export const FlashcardRequestSchema = z.object({
  content: z.string().min(1),
  topics: z.array(TopicRefSchema).min(1),
  count: z.number().int().min(1).max(60).default(15),
  existingFronts: z.array(z.string()).default([]),
});

export const QuizRequestSchema = z.object({
  content: z.string().min(1),
  topics: z.array(TopicRefSchema).min(1),
  count: z.number().int().min(1).max(30).default(8),
  mode: z.enum(["practice", "weak_spots", "exam"]).default("practice"),
});

export const GradeRequestSchema = z.object({
  content: z.string().min(1),
  prompt: z.string().min(1),
  modelAnswer: z.string().min(1),
  studentAnswer: z.string(),
});

export const TutorRequestSchema = z.object({
  content: z.string().min(1),
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1) }))
    .min(1),
});
