import type { z } from "zod/v4";
import {
  FlashcardSetSchema,
  GradeSchema,
  QuizSchema,
  StudyGuideSchema,
  type FlashcardRequestSchema,
  type GradeRequestSchema,
  type QuizRequestSchema,
  type StudyGuide,
  type FlashcardDraft,
  type Question,
  type Grade,
} from "../shared/schemas";
import { generateStructured } from "./ai";

type FlashcardRequest = z.infer<typeof FlashcardRequestSchema>;
type QuizRequest = z.infer<typeof QuizRequestSchema>;
type GradeRequest = z.infer<typeof GradeRequestSchema>;

function topicList(topics: { id: string; name: string; mastery?: number }[]): string {
  return topics
    .map((t) => `- ${t.id}: ${t.name}${t.mastery !== undefined ? ` (current mastery ${Math.round(t.mastery * 100)}%)` : ""}`)
    .join("\n");
}

export async function buildGuide(title: string, content: string): Promise<StudyGuide> {
  const guide = await generateStructured({
    content,
    schema: StudyGuideSchema,
    effort: "high",
    task: `Turn the course material into a study guide${title ? ` for the course "${title}"` : ""}.

- Break the material into 4-15 topics, each a coherent unit a student could study in one sitting (roughly 15-60 minutes). Order them so prerequisites come first.
- For each topic give a plain-language summary and the key points a student must know for an exam: definitions, formulas, processes, cause/effect, typical pitfalls.
- difficulty is relative to this course. estimatedMinutes is time for a first pass.
- learningObjectives: 3-8 "By the end you should be able to..." statements.
- glossary: the important terms the material uses, with definitions in its own words.
- If the material includes its own title, prefer that for "title".`,
  });
  return normalizeGuide(guide);
}

/** Make topic ids unique and drop prerequisites that point nowhere. */
export function normalizeGuide(guide: StudyGuide): StudyGuide {
  const seen = new Set<string>();
  const topics = guide.topics.map((t, i) => {
    let id = (t.id || t.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `topic-${i + 1}`;
    while (seen.has(id)) id = `${id}-${i + 1}`;
    seen.add(id);
    return { ...t, id, estimatedMinutes: Math.max(5, Math.round(t.estimatedMinutes || 20)) };
  });
  // Map the model's original ids to the normalized ones for prerequisite lookups.
  const idMap = new Map(guide.topics.map((t, i) => [t.id, topics[i].id]));
  return {
    ...guide,
    topics: topics.map((t) => ({
      ...t,
      prerequisites: t.prerequisites.map((p) => idMap.get(p) ?? p).filter((p) => p !== t.id && seen.has(p)),
    })),
  };
}

export async function buildFlashcards(req: FlashcardRequest): Promise<FlashcardDraft[]> {
  const ids = new Set(req.topics.map((t) => t.id));
  const { cards } = await generateStructured({
    content: req.content,
    schema: FlashcardSetSchema,
    effort: "medium",
    task: `Write ${req.count} flashcards covering these topics (spread them in proportion to how much material each topic has):
${topicList(req.topics)}

Rules:
- One atomic fact or idea per card. Front: a specific question or cue (not "What is X?" for everything; vary with "why", "how", "compare", "what happens when"). Back: a short, complete answer.
- Prioritise what is most likely to be examined.
- topicId must be one of the ids above.
${req.existingFronts.length ? `- The student already has these cards; don't duplicate them:\n${req.existingFronts.map((f) => `  * ${f}`).join("\n")}` : ""}`,
  });
  return cards.filter((c) => ids.has(c.topicId) && c.front.trim() && c.back.trim());
}

const MODE_GUIDANCE: Record<QuizRequest["mode"], string> = {
  practice: "Mix recall, understanding and application questions, spread across the topics.",
  weak_spots:
    "Focus on the topics with the lowest mastery. Target the misconceptions a struggling student is likely to have, and include a couple of easier questions to build confidence.",
  exam: "Write exam-style questions like a final exam for this course would contain: mostly understanding and application, a few recall. Cover every topic listed.",
};

export async function buildQuiz(req: QuizRequest): Promise<Question[]> {
  const ids = new Set(req.topics.map((t) => t.id));
  const { questions } = await generateStructured({
    content: req.content,
    schema: QuizSchema,
    effort: "medium",
    task: `Write a ${req.count}-question quiz on these topics:
${topicList(req.topics)}

${MODE_GUIDANCE[req.mode]}

- About two thirds multiple_choice (exactly 4 options, one clearly correct, plausible distractors based on real misconceptions; vary the position of the correct option) and one third short_answer (answerable in 1-4 sentences).
- For short_answer set options to [] and correctOption to -1.
- explanation teaches: say why the right answer is right and, for multiple choice, why the tempting wrong answer is wrong.
- topicId must be one of the ids above.`,
  });
  return questions
    .filter((q) => ids.has(q.topicId))
    .map((q) => {
      if (q.type === "multiple_choice" && (q.options.length < 2 || q.correctOption < 0 || q.correctOption >= q.options.length)) {
        return { ...q, type: "short_answer" as const, options: [], correctOption: -1 };
      }
      return q.type === "short_answer" ? { ...q, options: [], correctOption: -1 } : q;
    });
}

export async function gradeAnswer(req: GradeRequest): Promise<Grade> {
  if (!req.studentAnswer.trim()) {
    return { score: 0, verdict: "incorrect", feedback: "No answer was given.", missingPoints: [] };
  }
  const grade = await generateStructured({
    content: req.content,
    schema: GradeSchema,
    effort: "low",
    maxTokens: 8000,
    task: `Grade the student's answer to a short-answer question. Be fair: reward correct ideas expressed in the student's own words, don't require exact phrasing, and penalise factual errors.

<question>${req.prompt}</question>
<model_answer>${req.modelAnswer}</model_answer>
<student_answer>${req.studentAnswer}</student_answer>

score: 0-1. verdict: correct (>= 0.8), partially_correct (0.4-0.8), incorrect (< 0.4). feedback: 1-3 sentences to the student. missingPoints: key ideas they left out or got wrong (empty if none).`,
  });
  return { ...grade, score: Math.max(0, Math.min(1, grade.score)) };
}
