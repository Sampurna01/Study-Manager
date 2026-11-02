import { describe, expect, it } from "vitest";
import { masteryLabel, readiness, topicMastery } from "../shared/mastery";
import { newSchedule, review } from "../shared/srs";

const at = (i: number) => new Date(2026, 0, 1, 0, i).toISOString();

describe("mastery", () => {
  it("is zero with no evidence", () => {
    expect(topicMastery("a", [], [])).toBe(0);
  });

  it("a single correct answer is not mastery", () => {
    const m = topicMastery("a", [{ topicId: "a", score: 1, at: at(0) }], []);
    expect(m).toBeGreaterThan(0.4);
    expect(m).toBeLessThan(0.65);
  });

  it("many correct answers approach mastery; many wrong ones stay low", () => {
    const right = Array.from({ length: 12 }, (_, i) => ({ topicId: "a", score: 1, at: at(i) }));
    const wrong = right.map((a) => ({ ...a, score: 0 }));
    expect(topicMastery("a", right, [])).toBeGreaterThan(0.8);
    expect(topicMastery("a", wrong, [])).toBeLessThan(0.1);
  });

  it("weights recent attempts more", () => {
    const improving = [0, 0, 0, 1, 1, 1].map((score, i) => ({ topicId: "a", score, at: at(i) }));
    const declining = [1, 1, 1, 0, 0, 0].map((score, i) => ({ topicId: "a", score, at: at(i) }));
    expect(topicMastery("a", improving, [])).toBeGreaterThan(topicMastery("a", declining, []));
  });

  it("ignores other topics' attempts and uses flashcards", () => {
    const now = new Date();
    const card = review(review(review(newSchedule(now), "good", now), "good", now), "good", now);
    expect(topicMastery("a", [{ topicId: "b", score: 1, at: at(0) }], [card])).toBeGreaterThan(0);
  });

  it("readiness weights topics by study time", () => {
    const topics = [
      { id: "a", estimatedMinutes: 30 },
      { id: "b", estimatedMinutes: 10 },
    ];
    expect(readiness(topics, { a: 1, b: 0 })).toBeCloseTo(0.75);
    expect(masteryLabel(0.9)).toBe("Mastered");
    expect(masteryLabel(0)).toBe("Not started");
  });
});
