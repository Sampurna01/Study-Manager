import type { Classification, FlashcardDraft, Grade, Question, QuizStyle, StudyGuide, Syllabus } from "../../shared/schemas";
import { toDateKey } from "../../shared/plan";
import type { ChatMessage } from "./types";
import type { Diagram } from "../../shared/diagram";

export class ApiError extends Error {}

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Couldn't reach the Study Manager server. Is it running?");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

type TopicRef = { id: string; name: string; mastery?: number };

export const api = {
  async health(): Promise<{ ok: boolean; demo: boolean; provider: "ollama" | "anthropic" | "demo"; model: string }> {
    const res = await fetch("/api/health");
    return res.json();
  },

  async extract(files: File[]): Promise<{ name: string; text: string; error?: string }[]> {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    let res: Response;
    try {
      res = await fetch("/api/extract", { method: "POST", body: form });
    } catch {
      throw new ApiError("Couldn't reach the Study Manager server. Is it running?");
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(data?.error ?? "Upload failed");
    return data.files;
  },

  // Only the opening of a document is needed to tell what kind it is.
  classify: (name: string, text: string) =>
    post<{ classification: Classification }>("/api/classify", { name, text: text.slice(0, 12_000) }).then((r) => r.classification),

  syllabus: (text: string, topics: TopicRef[]) =>
    post<{ syllabus: Syllabus }>("/api/syllabus", { text, topics, today: toDateKey(new Date()) }).then((r) => r.syllabus),

  diagram: (content: string, about: string) => post<{ diagram: Diagram }>("/api/diagram", { content, about }).then((r) => r.diagram),

  guide: (title: string, content: string) => post<{ guide: StudyGuide }>("/api/guide", { title, content }).then((r) => r.guide),

  flashcards: (content: string, topics: TopicRef[], count: number, existingFronts: string[]) =>
    post<{ cards: FlashcardDraft[] }>("/api/flashcards", { content, topics, count, existingFronts }).then((r) => r.cards),

  quiz: (content: string, topics: TopicRef[], count: number, mode: "practice" | "weak_spots" | "exam", style: QuizStyle = "balanced") =>
    post<{ questions: Question[] }>("/api/quiz", { content, topics, count, mode, style }).then((r) => r.questions),

  grade: (content: string, prompt: string, modelAnswer: string, studentAnswer: string, extra: { solutionSteps?: string[]; working?: string } = {}) =>
    post<{ grade: Grade }>("/api/grade", { content, prompt, modelAnswer, studentAnswer, ...extra }).then((r) => r.grade),

  async tutor(content: string, messages: ChatMessage[], onText: (t: string) => void, signal: AbortSignal) {
    const res = await fetch("/api/tutor", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, messages }),
      signal,
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => null);
      throw new ApiError(data?.error ?? `Request failed (${res.status})`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onText(decoder.decode(value, { stream: true }));
    }
  },
};
