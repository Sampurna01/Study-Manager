/**
 * Demo mode (STUDY_MANAGER_DEMO=1): a deterministic, offline stand-in for the AI so
 * the app can be tried and tested without API credentials. It derives topics from
 * headings and key sentences from the text — useful for exploring the UI, not for
 * real studying.
 */
import type { z } from "zod/v4";
import type {
  FlashcardDraft,
  FlashcardRequestSchema,
  Grade,
  GradeRequestSchema,
  Question,
  QuizRequestSchema,
  StudyGuide,
} from "../shared/schemas";
import { normalizeGuide } from "./study";

export const DEMO = process.env.STUDY_MANAGER_DEMO === "1";

interface Section {
  heading: string;
  sentences: string[];
}

function sections(content: string): Section[] {
  const lines = content.split(/\r?\n/);
  const out: Section[] = [];
  let current: Section | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    const heading = line.match(/^#{1,3}\s+(.+)/)?.[1] ?? (/^[A-Z][^.!?]{2,60}:?$/.test(line) && line.split(" ").length <= 8 ? line.replace(/:$/, "") : null);
    if (heading) {
      current = { heading, sentences: [] };
      out.push(current);
      continue;
    }
    if (!line) continue;
    current ??= (out.push({ heading: "Introduction", sentences: [] }), out[out.length - 1]);
    current.sentences.push(...(line.replace(/^[-*]\s+/, "").match(/[^.!?]+[.!?]?/g) ?? []).map((s) => s.trim()).filter((s) => s.length > 15));
  }
  const nonEmpty = out.filter((s) => s.sentences.length);
  if (nonEmpty.length) return nonEmpty.slice(0, 12);
  const all = (content.match(/[^.!?]+[.!?]/g) ?? [content]).map((s) => s.trim());
  const size = Math.max(3, Math.ceil(all.length / 4));
  return Array.from({ length: Math.ceil(all.length / size) }, (_, i) => ({
    heading: `Part ${i + 1}`,
    sentences: all.slice(i * size, (i + 1) * size),
  }));
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function demoGuide(title: string, content: string): StudyGuide {
  const secs = sections(content);
  const glossary = secs.flatMap((s) =>
    s.sentences
      .map((sentence) => sentence.match(/^(?:An?|The)?\s*([A-Z][\w -]{2,40}?)\s+(?:is|are|refers to|means)\s+(.+)$/))
      .filter((m): m is RegExpMatchArray => !!m)
      .map((m) => ({ term: m[1].trim(), definition: m[2].trim() })),
  );
  return normalizeGuide({
    title: title || secs[0]?.heading || "Untitled course",
    overview: `Demo mode summary. This material covers ${secs.map((s) => s.heading).join(", ")}.`,
    learningObjectives: secs.map((s) => `Explain the main ideas of ${s.heading}.`),
    topics: secs.map((s, i) => ({
      id: slug(s.heading),
      name: s.heading,
      summary: s.sentences.slice(0, 2).join(" "),
      keyPoints: s.sentences.slice(0, 6),
      difficulty: i < secs.length / 3 ? "foundational" : i < (2 * secs.length) / 3 ? "intermediate" : "advanced",
      prerequisites: i > 0 ? [slug(secs[i - 1].heading)] : [],
      estimatedMinutes: Math.min(60, 10 + s.sentences.length * 4),
    })),
    glossary: glossary.slice(0, 30),
  });
}

function sentencesFor(content: string, topicName: string): string[] {
  const secs = sections(content);
  return secs.find((s) => s.heading === topicName)?.sentences ?? secs.flatMap((s) => s.sentences);
}

function cloze(sentence: string): { front: string; back: string } | null {
  const words = sentence.split(/\s+/);
  const idx = words.reduce((best, w, i) => (w.replace(/\W/g, "").length > words[best].replace(/\W/g, "").length ? i : best), 0);
  const answer = words[idx].replace(/[^\w-]/g, "");
  if (answer.length < 4) return null;
  const front = words.map((w, i) => (i === idx ? "_____" : w)).join(" ");
  return { front: `Fill in the blank: ${front}`, back: answer };
}

export function demoFlashcards(req: z.infer<typeof FlashcardRequestSchema>): FlashcardDraft[] {
  const existing = new Set(req.existingFronts);
  const cards: FlashcardDraft[] = [];
  for (let round = 0; cards.length < req.count && round < 10; round++) {
    let added = false;
    for (const t of req.topics) {
      const s = sentencesFor(req.content, t.name)[round];
      const c = s && cloze(s);
      if (c && !existing.has(c.front) && cards.length < req.count) {
        cards.push({ topicId: t.id, ...c });
        added = true;
      }
    }
    if (!added) break;
  }
  return cards;
}

export function demoQuiz(req: z.infer<typeof QuizRequestSchema>): Question[] {
  const topics = req.mode === "weak_spots" ? [...req.topics].sort((a, b) => (a.mastery ?? 0) - (b.mastery ?? 0)) : req.topics;
  const pool = req.topics.flatMap((t) => sentencesFor(req.content, t.name).map((s) => cloze(s)?.back)).filter(Boolean) as string[];
  const questions: Question[] = [];
  for (let i = 0; questions.length < req.count && i < req.count * 3; i++) {
    const t = topics[i % topics.length];
    const sentence = sentencesFor(req.content, t.name)[Math.floor(i / topics.length)];
    const c = sentence && cloze(sentence);
    if (!c) continue;
    if (questions.length % 3 === 2) {
      questions.push({
        topicId: t.id,
        type: "short_answer",
        prompt: `In your own words, explain: "${sentence}"`,
        options: [],
        correctOption: -1,
        modelAnswer: sentence,
        explanation: `From the material on ${t.name}.`,
        difficulty: "understanding",
      });
    } else {
      const distractors = [...new Set(pool.filter((w) => w.toLowerCase() !== c.back.toLowerCase()))].slice(i % 5, (i % 5) + 3);
      while (distractors.length < 3) distractors.push(["none of these", "all of these", "it depends"][distractors.length]);
      const correct = i % 4;
      const options = [...distractors];
      options.splice(correct, 0, c.back);
      questions.push({
        topicId: t.id,
        type: "multiple_choice",
        prompt: c.front.replace("Fill in the blank: ", "Which word completes the sentence? "),
        options,
        correctOption: correct,
        modelAnswer: c.back,
        explanation: `The original sentence: "${sentence}"`,
        difficulty: "recall",
      });
    }
  }
  return questions;
}

export function demoGrade(req: z.infer<typeof GradeRequestSchema>): Grade {
  const words = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const model = words(req.modelAnswer);
  const student = words(req.studentAnswer);
  const hit = [...model].filter((w) => student.has(w));
  const score = model.size ? hit.length / model.size : 0;
  const missing = [...model].filter((w) => !student.has(w)).slice(0, 5);
  return {
    score,
    verdict: score >= 0.8 ? "correct" : score >= 0.4 ? "partially_correct" : "incorrect",
    feedback: `Demo grading by keyword overlap: you covered ${hit.length} of ${model.size} key terms.`,
    missingPoints: missing,
  };
}

export async function demoTutor(
  content: string,
  messages: { role: string; content: string }[],
  onText: (t: string) => void,
): Promise<void> {
  const question = messages[messages.length - 1].content;
  const terms = new Set(question.toLowerCase().match(/[a-z]{4,}/g) ?? []);
  const best = sections(content)
    .flatMap((s) => s.sentences)
    .map((s) => ({ s, hits: (s.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => terms.has(w)).length }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3)
    .filter((x) => x.hits > 0);
  const reply = best.length
    ? `**Demo mode** — here's what your material says that relates to your question:\n\n${best.map((b) => `- ${b.s}`).join("\n")}\n\nStart the app with \`npm run dev\` (not \`dev:demo\`) for real AI tutoring.`
    : "**Demo mode** — I couldn't find anything in the material matching that. Start the app with \`npm run dev\` (not \`dev:demo\`) for real AI tutoring.";
  for (const chunk of reply.match(/.{1,24}/gs) ?? []) {
    onText(chunk);
    await new Promise((r) => setTimeout(r, 15));
  }
}
