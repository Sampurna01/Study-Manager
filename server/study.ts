import type { z } from "zod/v4";
import { z as zod } from "zod/v4";
import {
  ClassificationSchema,
  FlashcardDraftSchema,
  QuestionSchema,
  SyllabusSchema,
  type Classification,
  type Syllabus,
  type SyllabusRequestSchema,
  GradeSchema,
  StudyGuideSchema,
  type FlashcardRequestSchema,
  type GradeRequestSchema,
  type QuizRequestSchema,
  type StudyGuide,
  type FlashcardDraft,
  type Question,
  type Grade,
} from "../shared/schemas";
import { AIError, generateStructured } from "./ai";
import { DiagramSchema, cleanDiagram, type Diagram } from "../shared/diagram";

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
- If the material includes its own title, prefer that for "title".
- Each document is labelled with its type in its ===== header. If there is a syllabus: use its schedule and learning outcomes to choose, order and name the topics, and include every topic it lists. If a syllabus topic isn't actually taught by the other materials, still include it (summarise it from standard knowledge of the subject) and set syllabusOnly to true; otherwise set syllabusOnly to false. Never turn administrative content (grading, policies, office hours, deadlines) into topics.
- Treat assignments and past exams as evidence of what gets examined: emphasise those ideas in key points.`,
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
    return { ...t, id, estimatedMinutes: Math.max(5, Math.round(t.estimatedMinutes || 20)), syllabusOnly: t.syllabusOnly === true };
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

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Map whatever the model wrote for a topic back to a real topic id. Smaller local
 * models sometimes write the topic's name or a near-miss instead of its id.
 */
export function topicResolver(topics: { id: string; name: string }[]) {
  const lookup = new Map<string, string>();
  for (const t of topics) {
    lookup.set(t.id, t.id);
    lookup.set(t.id.toLowerCase(), t.id);
    lookup.set(t.name.toLowerCase().trim(), t.id);
    lookup.set(slugify(t.name), t.id);
  }
  return (raw: string): string | null => {
    const key = raw.trim();
    const hit = lookup.get(key) ?? lookup.get(key.toLowerCase()) ?? lookup.get(slugify(key));
    if (hit) return hit;
    if (topics.length === 1) return topics[0].id;
    // A partial match, e.g. "Membranes" for "transport-across-membranes".
    const partial = topics.filter((t) => slugify(t.name).includes(slugify(key)) || slugify(key).includes(slugify(t.name)));
    return partial.length === 1 ? partial[0].id : null;
  };
}

/** Restrict topicId to the real ids, so structured output can't invent one. */
function topicIdEnum(topics: { id: string }[]) {
  const ids = topics.map((t) => t.id);
  return ids.length ? zod.enum(ids as [string, ...string[]]) : zod.string();
}

/**
 * Generate a list, clean it, and try once more if nothing usable came back.
 * Logs what the model returned so empty results can be diagnosed from the terminal.
 */
async function generateList<T>(label: string, generate: () => Promise<unknown[]>, clean: (raw: unknown[]) => T[]): Promise<T[]> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await generate();
    const items = clean(raw);
    if (items.length) return items;
    console.warn(
      `[${label}] attempt ${attempt}: the AI returned ${raw.length} item(s), none usable. Start of its answer: ${JSON.stringify(raw).slice(0, 400)}`,
    );
  }
  throw new AIError(
    `The AI didn't produce any usable ${label}. Try again, pick fewer topics, or switch to a larger model (see the README).`,
    502,
  );
}

export async function buildFlashcards(req: FlashcardRequest): Promise<FlashcardDraft[]> {
  const resolve = topicResolver(req.topics);
  return generateList("flashcards", () => draftFlashcards(req), (raw) =>
    (raw as FlashcardDraft[])
      .map((c) => ({ ...c, topicId: resolve(c.topicId) ?? "" }))
      .filter((c) => c.topicId && c.front?.trim() && c.back?.trim()),
  );
}

async function draftFlashcards(req: FlashcardRequest): Promise<unknown[]> {
  const { cards } = await generateStructured({
    content: req.content,
    schema: zod.object({ cards: zod.array(FlashcardDraftSchema.extend({ topicId: topicIdEnum(req.topics) })).min(1) }),
    // Accept any topicId here; buildFlashcards maps it back to a real topic.
    validate: zod.object({ cards: zod.array(FlashcardDraftSchema) }),
    effort: "medium",
    task: `Write ${req.count} flashcards covering these topics (spread them in proportion to how much material each topic has):
${topicList(req.topics)}

Rules:
- One atomic fact or idea per card. Front: a specific question or cue (not "What is X?" for everything; vary with "why", "how", "compare", "what happens when"). Back: a short, complete answer.
- Prioritise what is most likely to be examined.
- topicId must be one of the ids above.
${req.existingFronts.length ? `- The student already has these cards; don't duplicate them:\n${req.existingFronts.map((f) => `  * ${f}`).join("\n")}` : ""}`,
  });
  return cards;
}

const MODE_GUIDANCE: Record<QuizRequest["mode"], string> = {
  practice: "Mix recall, understanding and application questions, spread across the topics.",
  weak_spots:
    "Focus on the topics with the lowest mastery. Target the misconceptions a struggling student is likely to have, and include a couple of easier questions to build confidence.",
  exam: "Write exam-style questions like a final exam for this course would contain: mostly understanding and application, a few recall. Cover every topic listed.",
};

const STYLE_GUIDANCE: Record<QuizRequest["style"], string> = {
  problems: `Question types: mostly "problem" (about three quarters), the rest multiple_choice.
- A problem is a concrete exercise like the worked examples, exercises and past-exam questions in the material: compute, solve, find, prove, derive, design, analyse. Use specific numbers, matrices, functions or data, and keep it solvable by hand in 2-10 minutes.
- Vary them: different sub-skills and methods, not the same exercise with new numbers.
- For each problem, work it out yourself in solutionSteps first (every calculation shown, one step per item), check the result, then put only the final result in modelAnswer. Give 1-3 hints that point toward the method without giving the answer away.`,
  balanced: `Question types: if the course is quantitative (maths, physics, engineering, chemistry, statistics, economics, programming...), make about half the questions "problem" (concrete exercises with specific numbers, worked out step by step in solutionSteps) and the rest multiple_choice and short_answer. For non-quantitative courses use about two thirds multiple_choice and one third short_answer, with a problem only where the material has exercises.`,
  concepts: `Question types: no problems. About two thirds multiple_choice and one third short_answer (answerable in 1-4 sentences), testing definitions, ideas and reasoning.`,
};

/** Make each question internally consistent, whatever the model wrote. */
export function cleanQuestion(q: Question): Question {
  const base = { ...q, hints: q.hints ?? [], solutionSteps: q.solutionSteps ?? [] };
  if (base.type === "multiple_choice") {
    if (base.options.length >= 2 && base.correctOption >= 0 && base.correctOption < base.options.length) return { ...base, hints: [] };
    return { ...base, type: "short_answer", options: [], correctOption: -1, hints: [] };
  }
  if (base.type === "problem") return { ...base, options: [], correctOption: -1 };
  return { ...base, options: [], correctOption: -1, hints: [] };
}

export async function buildQuiz(req: QuizRequest): Promise<Question[]> {
  const resolve = topicResolver(req.topics);
  return generateList("questions", () => draftQuiz(req), (raw) =>
    (raw as Question[])
      .map((q) => ({ ...q, topicId: resolve(q.topicId) ?? "" }))
      .filter((q) => q.topicId && q.prompt?.trim())
      .map(cleanQuestion),
  );
}

async function draftQuiz(req: QuizRequest): Promise<unknown[]> {
  const { questions } = await generateStructured({
    content: req.content,
    schema: zod.object({ questions: zod.array(QuestionSchema.extend({ topicId: topicIdEnum(req.topics) })).min(1) }),
    // Accept any topicId (and missing hints/steps) here; buildQuiz repairs them.
    validate: zod.object({
      questions: zod.array(
        QuestionSchema.extend({ hints: zod.array(zod.string()).default([]), solutionSteps: zod.array(zod.string()).default([]) }),
      ),
    }),
    // Worked solutions are long, so problem-heavy quizzes get more room.
    effort: req.style === "concepts" ? "medium" : "high",
    task: `Write a ${req.count}-question quiz on these topics:
${topicList(req.topics)}

${MODE_GUIDANCE[req.mode]}

${STYLE_GUIDANCE[req.style]}

- multiple_choice: exactly 4 options, one clearly correct, plausible distractors based on real misconceptions or typical calculation slips; vary the position of the correct option.
- Fields that don't apply to a question type are empty: options [] and correctOption -1 unless multiple_choice; hints [] and solutionSteps [] unless problem.
- Write mathematical notation in LaTeX between $...$ (e.g. $\\det(A) = ad - bc$, $\\begin{pmatrix}1 & 2\\\\ 3 & 4\\end{pmatrix}$). Don't use $ for anything else.
- explanation teaches: the key idea, and for multiple choice why the tempting wrong answer is wrong.
- topicId must be one of the ids above.
- Write all ${req.count} questions; the "questions" list must not be empty.`,
  });
  return questions;
}

export async function gradeAnswer(req: GradeRequest): Promise<Grade> {
  if (req.solutionSteps.length) return gradeProblem(req);
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

// Classifying a document only needs its opening; the prompt says it's an excerpt.
const CLASSIFY_EXCERPT_CHARS = 12_000;

export async function classifySource(name: string, text: string): Promise<Classification> {
  const excerpt = text.length > CLASSIFY_EXCERPT_CHARS;
  return generateStructured({
    content: excerpt ? text.slice(0, CLASSIFY_EXCERPT_CHARS) : text,
    schema: ClassificationSchema,
    effort: "low",
    maxTokens: 4000,
    task: `Identify what kind of course document this is${name ? ` (file name: "${name}")` : ""}${excerpt ? ". You are seeing only the first part of a longer document" : ""}.
A syllabus/course outline typically has course info, a week-by-week schedule, grading breakdown and policies. Lecture notes and slides teach content. Choose the single best kind.`,
  });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (d: string) => (ISO_DATE.test(d) && !Number.isNaN(new Date(d + "T00:00:00").getTime()) ? d : "");

/** Clean up an extracted syllabus: valid dates only, known topic ids only, sane weights. */
export function normalizeSyllabus(s: Syllabus, topicIds: Set<string>): Syllabus {
  const ids = (list: string[]) => [...new Set(list.filter((id) => topicIds.has(id)))];
  return {
    ...s,
    schedule: s.schedule.map((e) => ({ ...e, date: validDate(e.date), topicIds: ids(e.topicIds) })),
    assessments: s.assessments.map((a) => ({
      ...a,
      date: validDate(a.date),
      weightPercent: a.weightPercent >= 0 && a.weightPercent <= 100 ? a.weightPercent : -1,
      topicIds: ids(a.topicIds),
    })),
  };
}

export async function extractSyllabus(req: z.infer<typeof SyllabusRequestSchema>): Promise<Syllabus> {
  const syllabus = await generateStructured({
    content: req.text,
    schema: SyllabusSchema,
    effort: "medium",
    task: `This document is a course syllabus. Extract its structure. Today is ${req.today}.

- schedule: every week/lecture/unit in order, with what is taught and the readings.
- assessments: every exam, quiz, assignment and project, with its weight in the final grade and its date.
- Dates: write YYYY-MM-DD. If the syllabus gives a date without a year, infer the year from the term or from today's date. If a date can't be determined, use "".
- Copy facts exactly; don't invent dates, weights or names that aren't there.
${
  req.topics.length
    ? `- topicIds: link schedule entries and assessments to these study-guide topics (use only these ids):\n${topicList(req.topics)}`
    : "- topicIds: leave empty (no study guide topics given)."
}`,
  });
  return normalizeSyllabus(syllabus, new Set(req.topics.map((t) => t.id)));
}

async function gradeProblem(req: GradeRequest): Promise<Grade> {
  if (!req.studentAnswer.trim() && !req.working.trim()) {
    return { score: 0, verdict: "incorrect", feedback: "No answer was given.", missingPoints: [] };
  }
  const grade = await generateStructured({
    content: req.content,
    schema: GradeSchema,
    effort: "medium",
    maxTokens: 8000,
    task: `Grade the student's solution to a problem.

<problem>${req.prompt}</problem>
<worked_solution>
${req.solutionSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}
</worked_solution>
<correct_final_answer>${req.modelAnswer}</correct_final_answer>
<student_working>${req.working.trim() || "(none given)"}</student_working>
<student_final_answer>${req.studentAnswer.trim() || "(none given)"}</student_final_answer>

How to grade:
- First check the student's final answer yourself. Count it correct if it is mathematically equivalent to the correct answer (e.g. 1/2 = 0.5 = 2/4, a different but valid form of an expression, eigenvectors scaled by a constant, small rounding differences).
- If the worked solution above looks wrong, trust your own careful calculation instead.
- Correct final answer: score 0.9-1. Wrong final answer but a correct method with a slip: about 0.4-0.7, depending on how far they got. Wrong method: 0-0.3.
- feedback: 1-3 sentences to the student. If something is wrong, point to the first step where it went wrong. Use LaTeX between $...$ for maths.
- missingPoints: the specific mistakes or missing steps (empty if none).
score: 0-1. verdict: correct (>= 0.8), partially_correct (0.4-0.8), incorrect (< 0.4).`,
  });
  return { ...grade, score: Math.max(0, Math.min(1, grade.score)) };
}

export async function drawDiagram(content: string, about: string): Promise<Diagram> {
  const diagram = await generateStructured({
    content,
    schema: DiagramSchema,
    effort: "medium",
    maxTokens: 8000,
    task: `Design ONE diagram that helps a student understand the following. The app will draw it from your description.

<about>
${about}
</about>

Choose kind:
- plot: anything on axes — graphs of functions (and their approximations, tangents, areas), specific points (roots, maxima, poles, eigenvalues), vectors (eigenvectors, forces, transformations), circles (contours, |z| = r regions). Use xLabel "Re" and yLabel "Im" for the complex plane, with equalAxes true.
- flow: boxes and arrows — a method's steps, a process or cycle, a decision procedure, how concepts relate. 3-10 short node labels; edges reference node ids.
- none: only if no diagram would genuinely help.

Rules for plot:
- functions[].expr is y in terms of x only, using + - * / ^ ( ), sin cos tan exp ln log sqrt abs, pi, e. Write 2*x rather than 2x. No other variables, no "y =".
- Pick xMin/xMax/yMin/yMax so the interesting features (intercepts, turning points, where approximations differ, the vectors and circles) are all visible.
- Labels are short plain text (e.g. "f(x) = x^2", "λ = 3", "z0"). Use the exact numbers from the question or solution.
Leave every field that doesn't apply empty ([] or ""), and use 0 for unused numbers in a flow diagram.
caption: one sentence on what to notice.`,
  });
  return cleanDiagram(diagram);
}
