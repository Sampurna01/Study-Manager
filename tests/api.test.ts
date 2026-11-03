import { beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";

// Stand in for the AI: return canned structured output based on the schema requested.
const generateStructured = vi.fn();
vi.mock("../server/ai", async (orig) => {
  const actual = await orig<typeof import("../server/ai")>();
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

  it("limits topic ids to the real ones and maps topic names back to ids", async () => {
    const q = { type: "multiple_choice", options: ["a", "b", "c", "d"], correctOption: 0, hints: [], solutionSteps: [], modelAnswer: "m", explanation: "e", difficulty: "recall" };
    generateStructured.mockResolvedValueOnce({
      questions: [
        { ...q, prompt: "by id", topicId: "cells" },
        { ...q, prompt: "by name", topicId: "DNA" },
        { ...q, prompt: "by name, different case", topicId: "Cells " },
      ],
    });
    const res = await request(app).post("/api/quiz").send({ content: "x", topics, count: 3 });
    expect(res.body.questions.map((x: { topicId: string }) => x.topicId)).toEqual(["cells", "dna", "cells"]);
    // The schema sent to the model only allows the real ids.
    const { schema } = generateStructured.mock.calls.at(-1)![0];
    const ok = { questions: [{ ...q, prompt: "p", topicId: "dna" }] };
    expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse({ questions: [{ ...q, prompt: "p", topicId: "DNA" }] }).success).toBe(false);
  });

  it("retries once when the AI returns no usable questions, then explains the failure", async () => {
    const q = { type: "multiple_choice", options: ["a", "b", "c", "d"], correctOption: 0, modelAnswer: "m", explanation: "e", difficulty: "recall", prompt: "p" };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    generateStructured.mockResolvedValueOnce({ questions: [] });
    generateStructured.mockResolvedValueOnce({ questions: [{ ...q, topicId: "cells" }] });
    const ok = await request(app).post("/api/quiz").send({ content: "x", topics, count: 3 });
    expect(ok.body.questions).toHaveLength(1);

    generateStructured.mockResolvedValueOnce({ questions: [] });
    generateStructured.mockResolvedValueOnce({ questions: [{ ...q, topicId: "unknown-topic" }] });
    const bad = await request(app).post("/api/quiz").send({ content: "x", topics, count: 3 });
    expect(bad.status).toBe(502);
    expect(bad.body.error).toMatch(/usable questions/);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();

    // The schema sent to the model doesn't allow an empty list.
    const { schema } = generateStructured.mock.calls.at(-1)![0];
    expect(schema.safeParse({ questions: [] }).success).toBe(false);
  });

  it("asks for problems in problem-solving quizzes and keeps their solutions", async () => {
    generateStructured.mockResolvedValueOnce({
      questions: [
        {
          topicId: "cells", type: "problem", prompt: "Find $\\det(A)$", options: ["junk"], correctOption: 2,
          hints: ["Use ad - bc"], solutionSteps: ["ad - bc = 4 - 6", "= -2"], modelAnswer: "-2", explanation: "e", difficulty: "application",
        },
        { topicId: "dna", type: "multiple_choice", prompt: "p", options: ["a", "b", "c", "d"], correctOption: 1, hints: ["x"], solutionSteps: [], modelAnswer: "b", explanation: "e", difficulty: "recall" },
      ],
    });
    const res = await request(app).post("/api/quiz").send({ content: "x", topics, count: 2, style: "problems" });
    expect(res.status).toBe(200);
    const [problem, mcq] = res.body.questions;
    expect(problem).toMatchObject({ type: "problem", options: [], correctOption: -1, hints: ["Use ad - bc"], solutionSteps: ["ad - bc = 4 - 6", "= -2"] });
    expect(mcq.hints).toEqual([]);
    expect(generateStructured.mock.calls.at(-1)![0].task).toMatch(/mostly "problem"/);
  });

  it("grades problems against the worked solution and the student's working", async () => {
    generateStructured.mockResolvedValueOnce({ score: 0.5, verdict: "partially_correct", feedback: "f", missingPoints: [] });
    const res = await request(app)
      .post("/api/grade")
      .send({ content: "x", prompt: "Find det", modelAnswer: "-2", studentAnswer: "2", solutionSteps: ["4 - 6", "-2"], working: "4-6=2" });
    expect(res.body.grade.score).toBe(0.5);
    const task = generateStructured.mock.calls.at(-1)![0].task;
    expect(task).toContain("<student_working>4-6=2</student_working>");
    expect(task).toContain("mathematically equivalent");
  });

  it("gives empty answers zero without calling the AI", async () => {
    generateStructured.mockClear();
    const res = await request(app).post("/api/grade").send({ content: "x", prompt: "p", modelAnswer: "m", studentAnswer: "  " });
    expect(res.body.grade.score).toBe(0);
    expect(generateStructured).not.toHaveBeenCalled();
  });

  it("surfaces AI errors with a useful status", async () => {
    const { AIError } = await import("../server/errors");
    generateStructured.mockRejectedValueOnce(new AIError("rate limited", 429));
    const res = await request(app).post("/api/quiz").send({ content: "x", topics });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe("rate limited");
  });

  it("classifies a document from its opening", async () => {
    generateStructured.mockResolvedValueOnce({ kind: "syllabus", title: "BIO 101", summary: "Course outline" });
    const res = await request(app).post("/api/classify").send({ name: "outline.pdf", text: "Week 1: Cells" });
    expect(res.body.classification.kind).toBe("syllabus");
    expect(generateStructured.mock.calls.at(-1)![0].task).toContain("outline.pdf");
  });

  it("cleans up an extracted syllabus", async () => {
    generateStructured.mockResolvedValueOnce({
      courseName: "Bio",
      courseCode: "BIO 101",
      instructor: "",
      term: "Fall 2026",
      description: "",
      learningOutcomes: [],
      requiredMaterials: [],
      schedule: [{ label: "Week 1", date: "2026-09-02", topics: ["Cells"], readings: [], topicIds: ["cells", "made-up"] }],
      assessments: [
        { name: "Midterm", type: "midterm", weightPercent: 30, date: "2026-10-15", details: "", topicIds: ["dna"] },
        { name: "Final", type: "final", weightPercent: 250, date: "Dec 10", details: "", topicIds: [] },
      ],
    });
    const res = await request(app).post("/api/syllabus").send({ text: "syllabus", topics, today: "2026-09-01" });
    expect(res.status).toBe(200);
    const { schedule, assessments } = res.body.syllabus;
    expect(schedule[0].topicIds).toEqual(["cells"]);
    expect(assessments[0]).toMatchObject({ date: "2026-10-15", weightPercent: 30, topicIds: ["dna"] });
    expect(assessments[1]).toMatchObject({ date: "", weightPercent: -1 });
  });

  it("requires today's date for syllabus extraction", async () => {
    const res = await request(app).post("/api/syllabus").send({ text: "syllabus", today: "tomorrow" });
    expect(res.status).toBe(400);
  });

  it("draws diagrams, dropping anything that can't be drawn", async () => {
    generateStructured.mockResolvedValueOnce({
      kind: "plot", title: "t", caption: "c", xMin: -3, xMax: 3, yMin: -2, yMax: 10, xLabel: "x", yLabel: "y", equalAxes: false,
      functions: [{ expr: "x^2", label: "x²" }, { expr: "x +", label: "broken" }],
      points: [], vectors: [], circles: [], nodes: [], edges: [],
    });
    const res = await request(app).post("/api/diagram").send({ content: "x", about: "graph of x squared" });
    expect(res.status).toBe(200);
    expect(res.body.diagram.functions).toEqual([{ expr: "x^2", label: "x²" }]);
    expect(generateStructured.mock.calls.at(-1)![0].task).toContain("graph of x squared");
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
