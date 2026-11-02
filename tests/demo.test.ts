import { describe, expect, it } from "vitest";
import { demoFlashcards, demoGrade, demoGuide, demoQuiz } from "../server/demo";

const content = `# Photosynthesis
Photosynthesis converts light energy into chemical energy. Chlorophyll absorbs mostly red and blue light.

# Respiration
Cellular respiration releases energy from glucose. Mitochondria produce most of the cell's ATP.`;

describe("demo mode", () => {
  it("builds a guide from headings", () => {
    const g = demoGuide("", content);
    expect(g.topics.map((t) => t.id)).toEqual(["photosynthesis", "respiration"]);
    expect(g.topics[1].prerequisites).toEqual(["photosynthesis"]);
  });

  it("produces cards and well-formed quiz questions", () => {
    const topics = demoGuide("", content).topics.map((t) => ({ id: t.id, name: t.name }));
    expect(demoFlashcards({ content, topics, count: 3, existingFronts: [] }).length).toBeGreaterThan(0);
    for (const q of demoQuiz({ content, topics, count: 4, mode: "practice" })) {
      if (q.type === "multiple_choice") {
        expect(q.options).toHaveLength(4);
        expect(q.options[q.correctOption]).toBe(q.modelAnswer);
      }
    }
  });

  it("grades by overlap", () => {
    const g = demoGrade({ content, prompt: "p", modelAnswer: "Mitochondria produce ATP", studentAnswer: "mitochondria produce atp" });
    expect(g.verdict).toBe("correct");
  });
});
