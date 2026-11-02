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
  syllabusOnly: z
    .boolean()
    .describe("true only if a syllabus lists this topic but the other materials don't actually teach it"),
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

// ---- Identifying materials and reading the syllabus ------------------------

export const SOURCE_KINDS = [
  "syllabus",
  "lecture_notes",
  "slides",
  "textbook",
  "assignment",
  "past_exam",
  "study_notes",
  "other",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  syllabus: "Syllabus",
  lecture_notes: "Lecture notes",
  slides: "Slides",
  textbook: "Textbook",
  assignment: "Assignment",
  past_exam: "Past exam",
  study_notes: "Study notes",
  other: "Other",
};

export const ClassificationSchema = z.object({
  kind: z.enum(SOURCE_KINDS).describe(
    "syllabus = course outline with schedule/grading/policies; lecture_notes = notes from lectures; slides = lecture slides; textbook = book chapter or reading; assignment = homework or problem set; past_exam = previous exam or practice test; study_notes = a student's own notes or summaries",
  ),
  title: z.string().describe("A short descriptive title for this document"),
  summary: z.string().describe("One sentence on what this document contains"),
});
export type Classification = z.infer<typeof ClassificationSchema>;

export const ASSESSMENT_TYPES = ["exam", "midterm", "final", "quiz", "assignment", "project", "presentation", "participation", "other"] as const;

export const SyllabusSchema = z.object({
  courseName: z.string(),
  courseCode: z.string().describe("e.g. BIO 101; empty if not given"),
  instructor: z.string().describe("Name(s) and contact if given; empty if not given"),
  term: z.string().describe("e.g. Fall 2026; empty if not given"),
  description: z.string().describe("One short paragraph on what the course is about"),
  learningOutcomes: z.array(z.string()),
  schedule: z
    .array(
      z.object({
        label: z.string().describe('How the syllabus names this period, e.g. "Week 3" or "Lecture 5"'),
        date: z.string().describe("Start date as YYYY-MM-DD if it can be determined, otherwise empty"),
        topics: z.array(z.string()).describe("What is taught in this period"),
        readings: z.array(z.string()),
        topicIds: z.array(z.string()).describe("ids of study-guide topics this period covers (from the list provided)"),
      }),
    )
    .describe("The course schedule in order"),
  assessments: z.array(
    z.object({
      name: z.string(),
      type: z.enum(ASSESSMENT_TYPES),
      weightPercent: z.number().describe("Percentage of the final grade; -1 if not stated"),
      date: z.string().describe("Due or exam date as YYYY-MM-DD if it can be determined, otherwise empty"),
      details: z.string().describe("Format, length, what it covers; empty if not stated"),
      topicIds: z.array(z.string()).describe("ids of study-guide topics it covers (from the list provided); empty if unclear"),
    }),
  ),
  requiredMaterials: z.array(z.string()).describe("Textbooks and other required materials"),
});
export type Syllabus = z.infer<typeof SyllabusSchema>;

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

export const ClassifyRequestSchema = z.object({
  name: z.string().default(""),
  text: z.string().min(1),
});

export const SyllabusRequestSchema = z.object({
  text: z.string().min(1, "The syllabus is empty"),
  topics: z.array(TopicRefSchema).default([]),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "today must be YYYY-MM-DD"),
});
