import { beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";

// Stand in for Claude: return canned structured output based on the schema requested.
const generateStructured = vi.fn();
vi.mock("../server/claude", async (orig) => {
  const actual = await orig<typeof import("../server/claude")>();
  return {
    ...actual,
    generateStructured: (...args: unknown[]) => generateStructured(...args),
    streamTutor: async (_c: string, _m: unknown, onText: (t: string) => void) => {
      onText("Hello ");
      onText("student");
    },
  };
});

let app: Express;
beforeAll(async () => {
  const { createApp } = await import("../server/app");
  app = createApp();
});

const topics = [
  { id: "cells", name: "Cells" },
  { id: "dna", name: "DNA" },
];

describe("API", () => {
  it("reports health", async () => {
    const res = await request(app).get("/api/health");
    expect(res.body).toMatchObject({ ok: true, demo: false });
  });

  it("validates request bodies", async () => {
    const res = await request(app).post("/api/guide").send({ content: "" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/content/i);
  });

  it("rejects material that is too long instead of truncating it", async () => {
    const { MAX_CONTENT_CHARS } = await import("../server/app");
    const res = await request(app)
      .post("/api/guide")
      .send({ content: "x".repeat(MAX_CONTENT_CHARS + 1) });
    expect(res.status).toBe(413);
  });

  it("normalises the study guide", async () => {
    generateStructured.mockResolvedValueOnce({
      title: "Bio",
      overview: "o",
      learningObjectives: [],
      glossary: [],
      topics: [
        { id: "Cell Basics", name: "Cell basics", summary: "", keyPoints: [], difficulty: "foundational", prerequisites: ["missing"], estimatedMinutes: 0 },
        { id: "Cell Basics", name: "More cells", summary: "", keyPoints: [], difficulty: "advanced", prerequisites: ["Cell Basics"], estimatedMinutes: 40 },
      ],
    });
    const res = await request(app).post("/api/guide").send({ title: "Bio", content: "Cells are small." });
    expect(res.status).toBe(200);
    const [a, b] = res.body.guide.topics;
    expect(a.id).toBe("cell-basics");
    expect(b.id).not.toBe(a.id);
    expect(a.prerequisites).toEqual([]);
    expect(a.estimatedMinutes).toBeGreaterThanOrEqual(5);
  });

  it("drops flashcards and questions for unknown topics and repairs bad multiple choice", async () => {
    generateStructured.mockResolvedValueOnce({
      cards: [
        { topicId: "cells", front: "Q", back: "A" },
        { topicId: "nope", front: "Q2", back: "A2" },
      ],
    });
    const cards = await request(app).post("/api/flashcards").send({ content: "x", topics, count: 2 });
    expect(cards.body.cards).toHaveLength(1);

    const q = { prompt: "p", modelAnswer: "m", explanation: "e", difficulty: "recall" };
    generateStructured.mockResolvedValueOnce({
      questions: [
        { ...q, topicId: "cells", type: "multiple_choice", options: ["a", "b", "c", "d"], correctOption: 2 },
        { ...q, topicId: "dna", type: "multiple_choice", options: ["a", "b"], correctOption: 7 },
        { ...q, topicId: "ghost", type: "short_answer", options: [], correctOption: -1 },
      ],
    });
    const quiz = await request(app).post("/api/quiz").send({ content: "x", topics, count: 3 });
    expect(quiz.body.questions).toHaveLength(2);
    expect(quiz.body.questions[1]).toMatchObject({ type: "short_answer", options: [], correctOption: -1 });
  });

  it("gives empty answers zero without calling Claude", async () => {
    generateStructured.mockClear();
    const res = await request(app).post("/api/grade").send({ content: "x", prompt: "p", modelAnswer: "m", studentAnswer: "  " });
    expect(res.body.grade.score).toBe(0);
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("surfaces Claude errors with a useful status", async () => {
    const { ClaudeError } = await import("../server/claude");
    generateStructured.mockRejectedValueOnce(new ClaudeError("rate limited", 429));
    const res = await request(app).post("/api/quiz").send({ content: "x", topics });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe("rate limited");
  });

  it("streams tutor replies", async () => {
    const res = await request(app)
      .post("/api/tutor")
      .send({ content: "x", messages: [{ role: "user", content: "hi" }] });
    expect(res.status).toBe(200);
    expect(res.text).toBe("Hello student");
  });

  it("extracts text from uploads and reports unsupported files", async () => {
    const res = await request(app)
      .post("/api/extract")
      .attach("files", Buffer.from("# Notes\nMitochondria make ATP."), "notes.md")
      .attach("files", Buffer.from("<h1>Title</h1><p>Hello &amp; welcome</p>"), "page.html")
      .attach("files", Buffer.from("binary"), "slides.pptx");
    expect(res.status).toBe(200);
    const [md, html, pptx] = res.body.files;
    expect(md.text).toContain("Mitochondria");
    expect(html.text).toContain("# Title");
    expect(html.text).toContain("Hello & welcome");
    expect(pptx.error).toMatch(/supported/);
  });
});
